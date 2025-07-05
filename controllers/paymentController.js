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
exports.createCheckoutSessionFlutter = asyncHandler(async (req, res) => {
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
      success_url: `${process.env.CLIENT_DOMAIN}/payment/flutter-success?session_id={CHECKOUT_SESSION_ID}`, //${req.protocol}://${req.get('host')}
      cancel_url: `${process.env.CLIENT_DOMAIN}/payment/flutter-cancel`,
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




// @desc    Handle Stripe webhook for payment completion
// @route   POST /api/payments/webhook
// @access  Public (Stripe)
exports.handleWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

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

  // Handle checkout.session.completed event
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

  res.status(200).json({ received: true });
});

// @desc    Verify enrollment and redirect after payment
// @route   GET /api/payments/verify
// @access  Private (student)
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ message: 'Session ID is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid') {
      const enrollment = await Enrollment.findOne({
        stripePaymentId: session_id,
        user: req.user._id,
      }).populate('course');

      if (!enrollment) {
        return res.status(404).json({ message: 'Enrollment not found' });
      }

      if (enrollment.paymentStatus === 'completed') {
        return res.status(200).json({
          success: true,
          message: 'Payment verified, you are enrolled',
          course: enrollment.course,
        });
      }
    }
    return res.status(400).json({ message: 'Payment not completed' });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ message: 'Failed to verify payment', error: error.message });
  }
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