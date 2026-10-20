const mongoose = require('mongoose');
const History = require('../models/history');
const Track = require('../models/track');

// Keep only each user's most recent plays so the collection stays bounded.
const MAX_HISTORY_PER_USER = 50;

// Every history route is per-user (verifyToken) and reads req.user._id, so a
// user can only ever see or change THEIR OWN play history.
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST /api/history/:trackId -> record that the user played this track.
exports.recordPlay = async (req, res) => {
  try {
    const { trackId } = req.params;
    if (!isValidId(trackId)) return res.status(400).json({ error: 'Invalid track id.' });
    const track = await Track.findById(trackId).select('_id');
    if (!track) return res.status(404).json({ error: 'Track not found' });

    const entry = await History.create({ user: req.user._id, track: trackId });

    // Prune the oldest entries beyond the cap (n is small, so this is cheap).
    const excess = await History.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(MAX_HISTORY_PER_USER)
      .select('_id');
    if (excess.length) {
      await History.deleteMany({ _id: { $in: excess.map((e) => e._id) } });
    }

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/history?limit= -> my plays, newest first, track populated.
exports.getMyHistory = async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, MAX_HISTORY_PER_USER)
      : MAX_HISTORY_PER_USER;
    const history = await History.find({ user: req.user._id })
      .populate('track')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/history/:trackId -> remove all plays of one track from my history.
exports.removeTrackFromHistory = async (req, res) => {
  try {
    const { trackId } = req.params;
    if (!isValidId(trackId)) return res.status(400).json({ error: 'Invalid track id.' });
    await History.deleteMany({ user: req.user._id, track: trackId });
    res.json({ message: 'Removed from history.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /api/history -> clear my whole play history.
exports.clearHistory = async (req, res) => {
  try {
    await History.deleteMany({ user: req.user._id });
    res.json({ message: 'History cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
