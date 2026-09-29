const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const trackController = require('../controllers/track.controller');
const { verifyAdmin } = require('../middleware/auth.middleware');

router.get('/', trackController.getAllTracks);
router.get('/:id', trackController.getTrackById);
router.put('/:id', verifyAdmin, trackController.updateTrack);
router.delete('/:id', verifyAdmin, trackController.deleteTrack);
router.post(
  '/',
  verifyAdmin,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  trackController.createTrack
);

module.exports = router;