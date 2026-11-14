const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', serviceController.getAllServices);
router.get('/:slug', serviceController.getServiceBySlug);

// Admin-only management routes
router.post('/', protect, adminOnly, serviceController.createService);
router.put('/:id', protect, adminOnly, serviceController.updateService);
router.delete('/:id', protect, adminOnly, serviceController.deleteService);

module.exports = router;

