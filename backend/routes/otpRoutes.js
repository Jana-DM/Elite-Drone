const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const otpController = require('../controllers/otpController');

// Rate limiter for OTP requests (max 6 requests per 10 minutes per IP)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many OTP requests from this network. Please wait a few minutes before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/send', otpLimiter, otpController.sendOtp);
router.post('/verify', otpController.verifyOtp);

module.exports = router;
