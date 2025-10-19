const dotenv = require('dotenv');

dotenv.config();

// No database connection - just configuration
const connectDB = async () => {
  console.log('📊 Database-free mode enabled');
  console.log('💾 Using in-memory storage for chat history');
};

module.exports = connectDB;
