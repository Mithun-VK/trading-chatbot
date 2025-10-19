const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
  message: {
    type: String,
    required: true
  },
  response: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'market_data', 'analysis', 'recommendation', 'error'], // Added 'error'
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const watchlistSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  alertPrice: {
    type: Number,
    default: null
  },
  alertType: {
    type: String,
    enum: ['above', 'below', 'none'],
    default: 'none'
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const portfolioSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  averagePrice: {
    type: Number,
    required: true
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: 'User'
  },
  email: {
    type: String,
    default: ''
  },
  preferences: {
    riskTolerance: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    },
    investmentGoals: {
      type: [String],
      default: []
    },
    preferredSectors: {
      type: [String],
      default: []
    }
  },
  chatHistory: [chatHistorySchema],
  watchlist: [watchlistSchema],
  portfolio: [portfolioSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Virtual for portfolio value
userSchema.virtual('portfolioValue').get(function() {
  return this.portfolio.reduce((total, holding) => {
    return total + (holding.currentPrice * holding.quantity);
  }, 0);
});

// Virtual for total gain/loss
userSchema.virtual('totalGainLoss').get(function() {
  return this.portfolio.reduce((total, holding) => {
    const costBasis = holding.averagePrice * holding.quantity;
    const currentValue = holding.currentPrice * holding.quantity;
    return total + (currentValue - costBasis);
  }, 0);
});

// Update lastActive on save
userSchema.pre('save', function(next) {
  this.lastActive = new Date();
  next();
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
