const { snapshot } = require('../middleware/metrics.middleware');
const cacheService = require('../services/cache');
const mongoose = require('mongoose');

// GET /api/metrics (admin only) — data source for the performance dashboard.
exports.getMetrics = async (req, res) => {
  try {
    const snap = snapshot();
    const dbState = mongoose.connection.readyState; // 0 down, 1 connected, 2 connecting
    let dbStats = null;
    if (dbState === 1 && mongoose.connection.db) {
      try {
        dbStats = await mongoose.connection.db.command({ dbStats: 1, scale: 1 });
      } catch { /* command may be denied on shared clusters — dashboard still renders */ }
    }
    res.json({
      ...snap,
      cache: cacheService.getStats(),
      db: {
        state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
        name: mongoose.connection.name || null,
        collections: dbStats
          ? { objects: dbStats.objects, storageSizeMB: Math.round((dbStats.storageSize || 0) / 1048576 * 10) / 10 }
          : null
      },
      process: {
        node: process.version,
        pid: process.pid,
        env: process.env.NODE_ENV || 'development'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
