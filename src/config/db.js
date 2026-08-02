// ============================================================================
// config/db.js — MongoDB connection via Mongoose.
//
// Call connectDB() once at server startup. Mongoose handles reconnections
// automatically. We never hard-code the URI — it must come from MONGODB_URI.
// ============================================================================

import mongoose from 'mongoose';
import logger   from '../utils/logger.js';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set.');
  }

  try {
    await mongoose.connect(uri, {
      // Recommended options for production
      serverSelectionTimeoutMS: 5000,  // fail fast if Atlas unreachable
      socketTimeoutMS:          45000,
    });
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1); // can't run without the database
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — Mongoose will auto-reconnect.');
  });
  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB error: ${err.message}`);
  });
}
