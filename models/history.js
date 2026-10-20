const mongoose = require('mongoose');

// One document = one play event. We keep a bounded log (see MAX_HISTORY_PER_USER
// in the controller, which prunes the oldest rows) instead of an unbounded array
// so the collection stays small and "recently played" is a fast indexed read.
const historySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  track: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true }
  // playedAt comes from timestamps.createdAt
}, { timestamps: true });

// Fast "my plays, newest first" + pruning scans.
historySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('History', historySchema);
