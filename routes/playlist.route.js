const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlist.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { cache, invalidateAfter } = require('../services/cache');

// Public library reads cached 60s under "playlists:"; every mutation sweeps it.
router.get('/', cache('playlists'), playlistController.getAllPlaylists);
router.get('/:id', cache('playlists'), playlistController.getPlaylistById);
// Mutations require login; owner check lives in controller (admin bypass).
router.post('/', verifyToken, invalidateAfter('playlists'), playlistController.createPlaylist);
router.put('/:id', verifyToken, invalidateAfter('playlists'), playlistController.updatePlaylist);
router.post('/:id/tracks', verifyToken, invalidateAfter('playlists'), playlistController.addTracks);
router.delete('/:id/tracks/:trackId', verifyToken, invalidateAfter('playlists'), playlistController.removeTrack);
router.delete('/:id', verifyToken, invalidateAfter('playlists'), playlistController.deletePlaylist);

module.exports = router;
