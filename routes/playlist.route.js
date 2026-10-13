const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlist.controller');

router.get('/', playlistController.getAllPlaylists);
router.get('/:id', playlistController.getPlaylistById);
router.post('/', playlistController.createPlaylist);
router.put('/:id', playlistController.updatePlaylist);
router.post('/:id/tracks', playlistController.addTracks);
router.delete('/:id/tracks/:trackId', playlistController.removeTrack);

module.exports = router;
