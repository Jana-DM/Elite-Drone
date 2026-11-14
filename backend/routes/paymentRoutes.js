const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect, adminOnly, optionalAuth } = require('../middleware/authMiddleware');

// Order creation (supports authenticated and guest checkout)
router.post('/create-order', optionalAuth, paymentController.createOrder);

// Server-side payment verification
router.post('/verify', optionalAuth, paymentController.verifyPayment);

// Customer payment history
router.get('/my-payments', protect, paymentController.getMyPayments);

// Admin all payments
router.get('/admin', protect, adminOnly, paymentController.getAllPayments);

module.exports = router;
