const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }]
}, { timestamps: true });

// Library listing = all playlists sorted oldest-first; "my playlists" = by owner.
playlistSchema.index({ createdAt: 1 });
playlistSchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model('Playlist', playlistSchema);