const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Database connection
const connectDB = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('📊 MongoDB connected successfully');
    } else {
      console.log('📊 Running without database - using in-memory storage');
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    // Don't exit the process, just log the error
  }
};

connectDB();

module.exports = app;
