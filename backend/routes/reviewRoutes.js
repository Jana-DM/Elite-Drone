const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect } = require('../middleware/authMiddleware');

// Public route to view approved customer testimonials
router.get('/', reviewController.getApprovedReviews);

// Protected route for registered customers to submit feedback
router.post('/', protect, reviewController.createReview);

module.exports = router;
