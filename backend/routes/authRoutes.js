const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Login limiter (max 10 login attempts per 15 mins per IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many login attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/check-username', authController.checkUsername);
router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/me', protect, authController.getMe);
router.get('/profile', protect, authController.getMe);
router.put('/profile', protect, authController.updateProfile);
router.put('/avatar', protect, authController.updateAvatar);
router.post('/change-password', protect, authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Social authentication (Google & Facebook)
router.get('/google', authController.getGoogleAuthUrl);
router.post('/google/callback', authController.googleAuthCallback);
router.get('/google/callback', authController.googleAuthCallback);
router.get('/facebook', authController.getFacebookAuthUrl);
router.post('/facebook/callback', authController.facebookAuthCallback);
router.get('/facebook/callback', authController.facebookAuthCallback);

router.post('/logout', authController.logout);

module.exports = router;
