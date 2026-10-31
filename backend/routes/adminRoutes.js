const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Guard all admin routes with auth and admin role check
router.use(protect);
router.use(adminOnly);

// Metrics
router.get('/metrics', adminController.getMetrics);

// Bookings management
router.get('/bookings', adminController.getAllBookings);
router.put('/bookings/:id/status', adminController.updateBookingStatus);

// Customers
router.get('/customers', adminController.getCustomers);

// Gallery
router.post('/gallery', adminController.addGalleryItem);
router.delete('/gallery/:id', adminController.deleteGalleryItem);

module.exports = router;

