// server/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const { createCheckoutSessionWeb,createPaymentIntentFlutter, handleWebhook, verifyPayment,checkEnrollment } = require('../controllers/paymentController');
const { protect } = require('../middlewares/authMiddleware.js');

router.post('/web-checkout', protect, createCheckoutSessionWeb);
router.post('/flutter-checkout', protect, createPaymentIntentFlutter);
//router.post('/webhook',express.raw({ type: 'application/json' }), handleWebhook); // put this api into app.js
router.get('/verify', protect, verifyPayment);
router.get('/check/:courseId', protect, checkEnrollment);

module.exports = router;