const mongoose = require('mongoose');

const trackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  album: String,
  genre: String,
  durationSec: Number,
  audioUrl: { type: String, required: true },
  coverArtUrl: String
}, { timestamps: true });

module.exports = mongoose.model('Track', trackSchema);