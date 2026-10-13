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

// Create a new playlist (used by "Create New Album" on the main page).
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

// Update playlist name / description ("Name & details").
exports.updatePlaylist = async (req, res) => {
  try {
    const { name, description } = req.body;
    const update = {};
    if (typeof name === 'string') {
      if (!name.trim()) return res.status(400).json({ error: 'Playlist name cannot be empty' });
      update.name = name.trim();
    }
    if (typeof description === 'string') update.description = description;
    const playlist = await Playlist.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('tracks')
      .populate('user', 'username fullName');
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add one or more tracks to a playlist ("Add" / search-to-add).
exports.addTracks = async (req, res) => {
  try {
    const { tracks } = req.body;
    const incoming = Array.isArray(tracks) ? tracks : (tracks ? [tracks] : []);
    if (!incoming.length) return res.status(400).json({ error: 'No tracks provided' });
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    const existing = new Set(playlist.tracks.map((t) => t.toString()));
    let changed = false;
    incoming.forEach((id) => {
      if (id && !existing.has(id.toString())) {
        playlist.tracks.push(id);
        existing.add(id.toString());
        changed = true;
      }
    });
    if (changed) await playlist.save();
    await playlist.populate('tracks');
    await playlist.populate('user', 'username fullName');
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Remove a single track from a playlist.
exports.removeTrack = async (req, res) => {
  try {
    const { trackId } = req.params;
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    const before = playlist.tracks.length;
    playlist.tracks = playlist.tracks.filter((t) => t.toString() !== trackId.toString());
    if (playlist.tracks.length !== before) await playlist.save();
    await playlist.populate('tracks');
    await playlist.populate('user', 'username fullName');
    res.json(playlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
