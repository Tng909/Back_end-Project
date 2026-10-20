const mongoose = require('mongoose');
const Favorite = require('../models/favorite');
const Track = require('../models/track');

// Every favorite route is per-user (verifyToken) and reads req.user._id, so a
// user can only ever see or change THEIR OWN likes — never someone else's.
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// GET /api/favorites -> the current user's liked tracks (newest like first).
exports.getMyFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id })
      .populate('track')
      .sort({ createdAt: -1 });
    // Return plain track objects (drop any whose track was hard-deleted).
    res.json(favorites.map((f) => f.track).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/favorites/ids -> just the liked track ids (lightweight, for UI hearts).
exports.getFavoriteIds = async (req, res) => {
  try {
    const rows = await Favorite.find({ user: req.user._id }).select('track');
    res.json(rows.map((r) => String(r.track)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/favorites/check/:trackId -> { favorited: boolean } for one track.
exports.checkFavorite = async (req, res) => {
  try {
    const { trackId } = req.params;
    if (!isValidId(trackId)) return res.status(400).json({ error: 'Invalid track id.' });
    const fav = await Favorite.findOne({ user: req.user._id, track: trackId }).select('_id');
    res.json({ favorited: Boolean(fav) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/favorites/:trackId -> like a track (idempotent).
exports.addFavorite = async (req, res) => {
  try {
    const { trackId } = req.params;
    if (!isValidId(trackId)) return res.status(400).json({ error: 'Invalid track id.' });
    const track = await Track.findById(trackId).select('_id');
    if (!track) return res.status(404).json({ error: 'Track not found' });

    // Upsert: race-safe thanks to the unique { user, track } index.
    const favorite = await Favorite.findOneAndUpdate(
      { user: req.user._id, track: trackId },
      {},
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(favorite);
  } catch (err) {
    // A concurrent request liked it first — treat as already-liked success.
    if (err.code === 11000) return res.status(200).json({ message: 'Already favorited.' });
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/favorites/:trackId -> unlike a track (idempotent).
exports.removeFavorite = async (req, res) => {
  try {
    const { trackId } = req.params;
    if (!isValidId(trackId)) return res.status(400).json({ error: 'Invalid track id.' });
    await Favorite.deleteOne({ user: req.user._id, track: trackId });
    res.json({ message: 'Removed from favorites.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
