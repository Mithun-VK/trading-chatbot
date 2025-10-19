const aiService = require('../services/aiService');
const marketService = require('../services/marketService');
const User = require('../models/User');

class ChatController {
  async sendMessage(req, res) {
    try {
      const { userId, message, userProfile } = req.body;

      if (!userId || !message) {
        return res.status(400).json({
          error: 'UserId and message are required'
        });
      }

      // Get or create user
      let user = await User.findOne({ userId });
      if (!user && userProfile) {
        user = new User({
          userId,
          name: userProfile.name || 'Anonymous',
          email: userProfile.email || `${userId}@temp.com`,
          preferences: userProfile.preferences || {}
        });
        await user.save();
      }

      // Get market context if message relates to trading
      const marketContext = await marketService.getRelevantMarketData(message);
      
      // Generate AI response
      const aiResponse = await aiService.generateResponse(message, {
        userId,
        userPreferences: user?.preferences,
        marketContext,
        chatHistory: user?.chatHistory?.slice(-5) || [] // Last 5 messages for context
      });

      // Save to chat history
      if (user) {
        user.chatHistory.push({
          message,
          response: aiResponse.text,
          messageType: aiResponse.type || 'text'
        });
        
        // Keep only last 50 messages
        if (user.chatHistory.length > 50) {
          user.chatHistory = user.chatHistory.slice(-50);
        }
        
        await user.save();
      }

      res.json({
        response: aiResponse.text,
        type: aiResponse.type || 'text',
        suggestions: aiResponse.suggestions || [],
        marketData: aiResponse.marketData || null,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({
        error: 'Failed to process message',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  async getChatHistory(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const user = await User.findOne({ userId });
      
      if (!user) {
        return res.json({ chatHistory: [] });
      }

      const history = user.chatHistory
        .slice(-limit - offset, -offset || undefined)
        .reverse();

      res.json({
        chatHistory: history,
        total: user.chatHistory.length
      });

    } catch (error) {
      console.error('Get chat history error:', error);
      res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
  }

  async clearChatHistory(req, res) {
    try {
      const { userId } = req.params;

      await User.updateOne(
        { userId },
        { $set: { chatHistory: [] } }
      );

      res.json({ message: 'Chat history cleared successfully' });

    } catch (error) {
      console.error('Clear chat history error:', error);
      res.status(500).json({ error: 'Failed to clear chat history' });
    }
  }

  async getMarketData(req, res) {
    try {
      const { symbol } = req.params;
      const marketData = await marketService.getStockData(symbol);

      res.json(marketData);

    } catch (error) {
      console.error('Market data error:', error);
      res.status(500).json({ error: 'Failed to retrieve market data' });
    }
  }

  async addToWatchlist(req, res) {
    try {
      const { userId, symbol, alertPrice, alertType } = req.body;

      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if already in watchlist
      const existingIndex = user.watchlist.findIndex(item => item.symbol === symbol.toUpperCase());
      
      if (existingIndex >= 0) {
        // Update existing
        user.watchlist[existingIndex] = {
          symbol: symbol.toUpperCase(),
          alertPrice,
          alertType,
          addedAt: new Date()
        };
      } else {
        // Add new
        user.watchlist.push({
          symbol: symbol.toUpperCase(),
          alertPrice,
          alertType
        });
      }

      await user.save();

      res.json({
        message: 'Added to watchlist successfully',
        watchlist: user.watchlist
      });

    } catch (error) {
      console.error('Add to watchlist error:', error);
      res.status(500).json({ error: 'Failed to add to watchlist' });
    }
  }

  async getWatchlist(req, res) {
    try {
      const { userId } = req.params;

      const user = await User.findOne({ userId });
      if (!user) {
        return res.json({ watchlist: [] });
      }

      // Get current prices for watchlist items
      const watchlistWithPrices = await Promise.all(
        user.watchlist.map(async (item) => {
          try {
            const marketData = await marketService.getStockData(item.symbol);
            return {
              ...item.toObject(),
              currentPrice: marketData.price,
              change: marketData.change,
              changePercent: marketData.changePercent
            };
          } catch (error) {
            return {
              ...item.toObject(),
              currentPrice: null,
              error: 'Failed to fetch price'
            };
          }
        })
      );

      res.json({ watchlist: watchlistWithPrices });

    } catch (error) {
      console.error('Get watchlist error:', error);
      res.status(500).json({ error: 'Failed to retrieve watchlist' });
    }
  }

  async removeFromWatchlist(req, res) {
    try {
      const { userId, symbol } = req.params;

      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      user.watchlist = user.watchlist.filter(item => item.symbol !== symbol.toUpperCase());
      await user.save();

      res.json({
        message: 'Removed from watchlist successfully',
        watchlist: user.watchlist
      });

    } catch (error) {
      console.error('Remove from watchlist error:', error);
      res.status(500).json({ error: 'Failed to remove from watchlist' });
    }
  }

  async getPortfolio(req, res) {
    try {
      const { userId } = req.params;

      const user = await User.findOne({ userId });
      if (!user) {
        return res.json({ portfolio: [], totalValue: 0, totalGainLoss: 0 });
      }

      // Update current prices
      const portfolioWithCurrentPrices = await Promise.all(
        user.portfolio.map(async (holding) => {
          try {
            const marketData = await marketService.getStockData(holding.symbol);
            holding.currentPrice = marketData.price;
            holding.lastUpdated = new Date();
            return holding;
          } catch (error) {
            return holding;
          }
        })
      );

      user.portfolio = portfolioWithCurrentPrices;
      await user.save();

      const totalValue = user.portfolioValue;
      const totalGainLoss = user.totalGainLoss;

      res.json({
        portfolio: user.portfolio,
        totalValue,
        totalGainLoss,
        gainLossPercent: totalValue > 0 ? (totalGainLoss / (totalValue - totalGainLoss)) * 100 : 0
      });

    } catch (error) {
      console.error('Get portfolio error:', error);
      res.status(500).json({ error: 'Failed to retrieve portfolio' });
    }
  }

  async updatePortfolio(req, res) {
    try {
      const { userId, symbol, quantity, averagePrice, action } = req.body;

      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const existingIndex = user.portfolio.findIndex(item => item.symbol === symbol.toUpperCase());

      if (action === 'buy') {
        if (existingIndex >= 0) {
          // Update existing holding
          const existing = user.portfolio[existingIndex];
          const totalQuantity = existing.quantity + quantity;
          const totalCost = (existing.quantity * existing.averagePrice) + (quantity * averagePrice);
          
          user.portfolio[existingIndex] = {
            symbol: symbol.toUpperCase(),
            quantity: totalQuantity,
            averagePrice: totalCost / totalQuantity,
            currentPrice: existing.currentPrice,
            lastUpdated: new Date()
          };
        } else {
          // Add new holding
          user.portfolio.push({
            symbol: symbol.toUpperCase(),
            quantity,
            averagePrice,
            currentPrice: averagePrice
          });
        }
      } else if (action === 'sell') {
        if (existingIndex >= 0) {
          const existing = user.portfolio[existingIndex];
          if (existing.quantity >= quantity) {
            existing.quantity -= quantity;
            existing.lastUpdated = new Date();
            
            if (existing.quantity === 0) {
              user.portfolio.splice(existingIndex, 1);
            }
          } else {
            return res.status(400).json({ error: 'Insufficient quantity to sell' });
          }
        } else {
          return res.status(400).json({ error: 'Stock not found in portfolio' });
        }
      }

      await user.save();

      res.json({
        message: `Portfolio updated successfully (${action})`,
        portfolio: user.portfolio
      });

    } catch (error) {
      console.error('Update portfolio error:', error);
      res.status(500).json({ error: 'Failed to update portfolio' });
    }
  }

  async getAnalysis(req, res) {
    try {
      const { symbol, analysisType = 'technical' } = req.body;

      const marketData = await marketService.getDetailedStockData(symbol);
      const analysis = await aiService.generateAnalysis(symbol, marketData, analysisType);

      res.json({
        symbol,
        analysisType,
        analysis: analysis.text,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        keyPoints: analysis.keyPoints || [],
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({ error: 'Failed to generate analysis' });
    }
  }

  async getRecommendations(req, res) {
    try {
      const { userId } = req.params;
      const { category = 'general' } = req.query;

      const user = await User.findOne({ userId });
      const recommendations = await aiService.generateRecommendations(user, category);

      res.json({
        recommendations: recommendations.items || [],
        category,
        basedOn: recommendations.basedOn || 'general market analysis',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Recommendations error:', error);
      res.status(500).json({ error: 'Failed to generate recommendations' });
    }
  }
}

module.exports = new ChatController();
