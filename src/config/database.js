const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    if (process.env.MONGODB_URI) {
      // Remove deprecated options - they're now defaults in Mongoose 6+
      const conn = await mongoose.connect(process.env.MONGODB_URI);
      
      console.log('✅ MongoDB connected successfully');
      console.log(`📊 Database: ${conn.connection.name}`);
      console.log(`🔗 Host: ${conn.connection.host}`);
      
      return conn;
    } else {
      console.log('⚠️  No MONGODB_URI found - running without database');
      console.log('📊 Using in-memory storage');
      return null;
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('📊 Continuing without database connection...');
    return null;
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('🟢 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 Mongoose disconnected from MongoDB');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔴 MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = connectDB;
