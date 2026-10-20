const mongoose = require('mongoose');

const trackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  producer: String,
  lyrics: String,
  album: String,
  genre: String,
  durationSec: Number,
  audioUrl: { type: String, required: true },
  coverArtUrl: String
}, { timestamps: true });

// Indexes for the query patterns in track.controller.js:
// - default listing sort is { createdAt: -1 } (newest first)
// - genre filter + sort, artist filter (regex can't use these directly, but
//   exact-match filters and distinct('genre') can)
trackSchema.index({ createdAt: -1 });
trackSchema.index({ genre: 1, createdAt: -1 });
trackSchema.index({ artist: 1 });
trackSchema.index({ title: 1 });

module.exports = mongoose.model('Track', trackSchema);