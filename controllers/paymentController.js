const asyncHandler = require('express-async-handler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');



// @desc    Create Stripe Checkout session (web)
// @route   POST /api/payments/web-checkout
// @access  Private (student)
exports.createCheckoutSessionWeb = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  // 1. Validate courseId
  if (!courseId) {
    return res.status(400).json({ message: 'Course ID is required' });
  }

  // 2. Verify course exists
  const course = await Course.findById(courseId);
  if (!course) {
    return res.status(404).json({ message: 'Course not found' });
  }

  // 3. Verify user is a student
  // if (req.user.role !== 'student') {
  //   return res.status(403).json({ message: 'Only students can enroll in courses' });
  // }

  // 4. Check if already enrolled
  const existingEnrollment = await Enrollment.findOne({ user: req.user._id, course: courseId });
  if (existingEnrollment && existingEnrollment.paymentStatus === 'completed') {
    return res.status(400).json({ message: 'You are already enrolled in this course' });
  }

  // 5. Create Stripe Checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          name : req.user.name,  
          price_data: {
            currency: 'egp',
            product_data: {
              name: course.title,
              description: `Access to ${course.title} course`,
            },
            unit_amount: Math.round(course.price * 100), // Price in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_DOMAIN}/payment/success?session_id={CHECKOUT_SESSION_ID}`, //${req.protocol}://${req.get('host')}
      cancel_url: `${process.env.CLIENT_DOMAIN}/payment/cancel`,
      customer_email : req.user.email,
      client_reference_id: req.user._id.toString(), // Store user ID
      metadata: { courseId: courseId.toString() }, // Store course ID
    });

    // 6. Create pending enrollment
    await Enrollment.create({
      user: req.user._id,
      course: courseId,
      paymentStatus: 'pending',
      stripePaymentId: session.id,
    });

    // 7. Update course's enrolledStudents && User's enrolledCourses
    await Course.findByIdAndUpdate(courseId, { $addToSet: { enrolledStudents: req.user._id } });
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { enrolledCourses: courseId } });
    

    res.status(200).json({
      success: true,
      message: 'Checkout session created',
      sessionId: session.id,
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ message: 'Failed to create checkout session', error: error.message });
  }
});





// @desc    Create Stripe Checkout session (flutter)
// @route   POST /api/payments/flutter-checkout
// @access  Private (student)


exports.createPaymentIntentFlutter = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  // 1. Validate courseId
  if (!courseId) {
    return res.status(400).json({ message: 'Course ID is required' });
  }

  // 2. Verify course exists
  const course = await Course.findById(courseId);
  if (!course) {
    return res.status(404).json({ message: 'Course not found' });
  }

  // 3. Check if already enrolled
  const existingEnrollment = await Enrollment.findOne({ user: req.user._id, course: courseId });
  if (existingEnrollment && existingEnrollment.paymentStatus === 'completed') {
    return res.status(400).json({ message: 'You are already enrolled in this course' });
  }

  // 4. Create Stripe Payment Intent
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(course.price * 100), // Price in cents
      currency: 'egp', // Ensure your Stripe account supports EGP
      payment_method_types: ['card'],
      description: `Access to ${course.title} course`,
      metadata: {
        courseId: courseId.toString(),
        userId: req.user._id.toString(),
      },
      receipt_email: req.user.email,
    });

    // 5. Create pending enrollment
    await Enrollment.create({
      user: req.user._id,
      course: courseId,
      paymentStatus: 'pending',
      stripePaymentId: paymentIntent.id,
    });

    // 6. Update course's enrolledStudents and User's enrolledCourses
    await Course.findByIdAndUpdate(courseId, { $addToSet: { enrolledStudents: req.user._id } });
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { enrolledCourses: courseId } });

    res.status(200).json({
      success: true,
      message: 'Payment Intent created',
      clientSecret: paymentIntent.client_secret, // Send client secret to Flutter
    });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ message: 'Failed to create payment intent', error: error.message });
  }
});


// @desc    Handle Stripe webhook for payment completion
// @route   POST /api/payments/webhook
// @access  Public (Stripe)
exports.handleWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // 1. Verify webhook signature
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET // Set in .env for production
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return res.status(400).json({ message: 'Webhook error' });
  }

  // 2. Handle payment_intent.succeeded event
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const userId = paymentIntent.metadata.userId; // From metadata in Payment Intent
    const courseId = paymentIntent.metadata.courseId; // From metadata in Payment Intent

    try {
      // Update enrollment to completed
      const enrollment = await Enrollment.findOneAndUpdate(
        { stripePaymentId: paymentIntent.id }, // Use Payment Intent ID
        { paymentStatus: 'completed', enrolledAt: new Date() },
        { new: true }
      );

      if (!enrollment) {
        console.error('Enrollment not found for Payment Intent:', paymentIntent.id);
        return res.status(404).json({ message: 'Enrollment not found' });
      }

      console.log(`Enrolled user ${userId} in course ${courseId}`);
    } catch (error) {
      console.error('Enrollment update error:', error);
      return res.status(500).json({ message: 'Failed to process enrollment' });
    }
  }

  // 3. Optionally keep checkout.session.completed for backward compatibility
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const courseId = session.metadata.courseId;

    try {
      // Update enrollment to completed
      const enrollment = await Enrollment.findOneAndUpdate(
        { stripePaymentId: session.id },
        { paymentStatus: 'completed', enrolledAt: new Date() },
        { new: true }
      );

      if (!enrollment) {
        console.error('Enrollment not found for session:', session.id);
        return res.status(404).json({ message: 'Enrollment not found' });
      }

      console.log(`Enrolled user ${userId} in course ${courseId}`);
    } catch (error) {
      console.error('Enrollment update error:', error);
      return res.status(500).json({ message: 'Failed to process enrollment' });
    }
  }

  // 4. Respond to Stripe
  res.status(200).json({ received: true });
});



// @desc    check Enrollment of a course for a user
// @route   GET /api/payments/check/:courseId
// @access  Private (student)

exports.checkEnrollment = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user._id;

  if (!courseId) {
    return res.status(400).json({ message: 'Course ID is required' });
  }

  // Validate course existence
  const course = await Course.findById(courseId);
  if (!course) {
    return res.status(404).json({ message: 'Course not found' });
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    course: courseId,
    user: userId,
    paymentStatus: 'completed',
  });

  res.status(200).json({
    success: !!enrollment, // true if enrolled, false otherwise
  });
});