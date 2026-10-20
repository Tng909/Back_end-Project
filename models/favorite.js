const mongoose = require('mongoose');

// One document = one "liked song" by one user.
// A separate collection (vs. an array of ids on the user doc) so it can grow
// without the 16MB document cap, is indexed for fast "my likes" queries, and
// the unique compound index below rejects duplicates at the DB level.
const favoriteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  track: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true }
}, { timestamps: true });

// Enforce "a user can like a given track only once" — even under concurrent
// requests (two simultaneous POSTs cannot both insert).
favoriteSchema.index({ user: 1, track: 1 }, { unique: true });
// Fast "my likes, newest first" listing.
favoriteSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Favorite', favoriteSchema);
