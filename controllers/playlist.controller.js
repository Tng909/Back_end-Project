const Playlist = require('../models/playlist');

// Public: example playlists with populated tracks (for "Your Library").
exports.getAllPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({})
      .populate('tracks')
      .populate('user', 'username fullName')
      .sort({ createdAt: 1 });
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPlaylistById = async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate('tracks')
      .populate('user', 'username fullName');
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create a new playlist.
exports.createPlaylist = async (req, res) => {
  try {
    const { name, description, tracks, user } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name is required' });
    const playlist = await Playlist.create({ name: name.trim(), description: description || '', user, tracks: tracks || [] });
    res.status(201).json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
