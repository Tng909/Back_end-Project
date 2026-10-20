const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metrics.controller');
const { verifyAdmin } = require('../middleware/auth.middleware');

// Performance metrics are admin-only (contains route traffic + memory info).
router.get('/', verifyAdmin, metricsController.getMetrics);

module.exports = router;
