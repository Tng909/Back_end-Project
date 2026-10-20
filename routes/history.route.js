const express = require('express');
const router = express.Router();
const historyController = require('../controllers/history.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All history routes are per-user and require login.
router.use(verifyToken);

router.get('/', historyController.getMyHistory);
router.post('/:trackId', historyController.recordPlay);
router.delete('/', historyController.clearHistory);
router.delete('/:trackId', historyController.removeTrackFromHistory);

module.exports = router;
