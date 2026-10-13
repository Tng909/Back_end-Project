const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlist.controller');

router.get('/', playlistController.getAllPlaylists);
router.get('/:id', playlistController.getPlaylistById);
router.post('/', playlistController.createPlaylist);

module.exports = router;
