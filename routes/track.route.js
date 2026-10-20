const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload.middleware');
const trackController = require('../controllers/track.controller');
const { verifyAdmin } = require('../middleware/auth.middleware');
const { cache, invalidateAfter } = require('../services/cache');

// Public catalog reads are the hottest endpoints — cache them (60s TTL,
// namespace "tracks:"; genres 300s) and sweep the namespace on admin writes.
router.get('/', cache('tracks'), trackController.getAllTracks);
router.get('/genres', cache('tracks', 300), trackController.getGenres);
router.get('/artists', cache('tracks', 300), trackController.getArtists);
router.get('/:id', cache('tracks'), trackController.getTrackById);
router.put(
  '/:id',
  verifyAdmin,
  invalidateAfter('tracks'),
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  trackController.updateTrack
);
router.delete('/:id', verifyAdmin, invalidateAfter('tracks'), trackController.deleteTrack);
router.post(
  '/',
  verifyAdmin,
  invalidateAfter('tracks'),
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
  ]),
  trackController.createTrack
);

module.exports = router;