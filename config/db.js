const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Pool tuning: one shared driver pool per instance instead of the driver
    // default (100), which over-opens connections when several scaled instances
    // point at the same Atlas cluster. Env-tunable for Render.
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;