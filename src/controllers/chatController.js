const aiService = require('../services/aiService');
const marketService = require('../services/marketService');

// In-memory chat history storage (temporary, resets on server restart)
const chatHistoryStore = new Map();

class ChatController {
  // Helper to manage in-memory chat history
  getChatHistory(userId, limit = 10) {
    if (!chatHistoryStore.has(userId)) {
      chatHistoryStore.set(userId, []);
    }
    const history = chatHistoryStore.get(userId);
    return history.slice(-limit);
  }

  addToHistory(userId, message, response) {
    if (!chatHistoryStore.has(userId)) {
      chatHistoryStore.set(userId, []);
    }
    const history = chatHistoryStore.get(userId);
    history.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    history.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });
    
    // Keep only last 50 messages per user
    if (history.length > 100) {
      chatHistoryStore.set(userId, history.slice(-100));
    }
  }

  async sendMessage(req, res) {
    try {
      const { userId, message } = req.body;

      // Validation
      if (!userId || !message) {
        return res.status(400).json({
          success: false,
          error: 'UserId and message are required',
          timestamp: new Date().toISOString()
        });
      }

      if (typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message must be a non-empty string',
          timestamp: new Date().toISOString()
        });
      }

      if (message.length > 5000) {
        return res.status(400).json({
          success: false,
          error: 'Message too long (max 5000 characters)',
          timestamp: new Date().toISOString()
        });
      }

      console.log(`📨 Chat request from user: ${userId}`);
      console.log(`💬 Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

      // Get conversation history for context
      const chatHistory = this.getChatHistory(userId, 5);

      // Get market context if message relates to trading
      let marketContext = null;
      try {
        marketContext = await marketService.getRelevantMarketData(message);
        if (marketContext) {
          console.log(`📊 Market context retrieved for symbols:`, marketContext.symbols);
        }
      } catch (error) {
        console.error('⚠️ Market service error:', error.message);
        // Continue without market context
      }
      
      // Generate AI response
      const startTime = Date.now();
      const aiResponse = await aiService.generateResponse(message, {
        userId,
        marketContext,
        chatHistory
      });
      const responseTime = Date.now() - startTime;

      console.log(`✅ AI response generated in ${responseTime}ms`);

      // Save to in-memory history
      this.addToHistory(userId, message, aiResponse.text);

      res.json({
        success: true,
        response: aiResponse.text,
        type: aiResponse.type || 'text',
        suggestions: aiResponse.suggestions || [],
        marketData: aiResponse.marketData || null,
        metadata: {
          responseTime: `${responseTime}ms`,
          hasMarketContext: !!marketContext,
          historyLength: chatHistory.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Chat error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process message',
        message: 'An error occurred while processing your request. Please try again.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        timestamp: new Date().toISOString()
      });
    }
  }

  async getChatHistoryEndpoint(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 20 } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'UserId is required'
        });
      }

      const history = this.getChatHistory(userId, parseInt(limit));

      res.json({
        success: true,
        chatHistory: history,
        total: history.length,
        note: 'History is stored in-memory and will reset on server restart',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get chat history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve chat history'
      });
    }
  }

  async clearChatHistory(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'UserId is required'
        });
      }

      chatHistoryStore.delete(userId);

      res.json({
        success: true,
        message: 'Chat history cleared successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Clear chat history error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear chat history'
      });
    }
  }

  async getMarketData(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Stock symbol is required'
        });
      }

      console.log(`📈 Fetching market data for: ${symbol.toUpperCase()}`);

      const marketData = await marketService.getStockData(symbol.toUpperCase());

      res.json({
        success: true,
        data: marketData,
        symbol: symbol.toUpperCase(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Market data error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve market data',
        message: `Could not fetch data for symbol: ${symbol}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  async addToWatchlist(req, res) {
    res.status(501).json({
      success: false,
      error: 'Feature not available',
      message: 'Watchlist requires database. This feature will be available in a future update.',
      timestamp: new Date().toISOString()
    });
  }

  async getWatchlist(req, res) {
    res.status(501).json({
      success: false,
      error: 'Feature not available',
      message: 'Watchlist requires database. This feature will be available in a future update.',
      watchlist: [],
      timestamp: new Date().toISOString()
    });
  }

  async removeFromWatchlist(req, res) {
    res.status(501).json({
      success: false,
      error: 'Feature not available',
      message: 'Watchlist requires database. This feature will be available in a future update.',
      timestamp: new Date().toISOString()
    });
  }

  async getPortfolio(req, res) {
    res.status(501).json({
      success: false,
      error: 'Feature not available',
      message: 'Portfolio tracking requires database. This feature will be available in a future update.',
      portfolio: [],
      totalValue: 0,
      totalGainLoss: 0,
      timestamp: new Date().toISOString()
    });
  }

  async updatePortfolio(req, res) {
    res.status(501).json({
      success: false,
      error: 'Feature not available',
      message: 'Portfolio tracking requires database. This feature will be available in a future update.',
      timestamp: new Date().toISOString()
    });
  }

  async getAnalysis(req, res) {
    try {
      const { symbol, analysisType = 'technical' } = req.body;

      if (!symbol) {
        return res.status(400).json({
          success: false,
          error: 'Stock symbol is required',
          timestamp: new Date().toISOString()
        });
      }

      console.log(`🔍 Generating ${analysisType} analysis for: ${symbol.toUpperCase()}`);

      const marketData = await marketService.getDetailedStockData(symbol.toUpperCase());
      const analysis = await aiService.generateAnalysis(symbol.toUpperCase(), marketData, analysisType);

      res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        analysisType,
        analysis: analysis.text,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        keyPoints: analysis.keyPoints || [],
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Analysis error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate analysis',
        message: `Could not analyze symbol: ${req.body.symbol}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  async getRecommendations(req, res) {
    try {
      const { category = 'general' } = req.query;

      console.log(`💡 Generating ${category} recommendations`);

      const recommendations = await aiService.generateRecommendations(null, category);

      res.json({
        success: true,
        recommendations: recommendations.items || [],
        category,
        basedOn: 'general market analysis',
        personalized: false,
        note: 'Personalized recommendations require database integration',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Recommendations error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate recommendations',
        timestamp: new Date().toISOString()
      });
    }
  }

  // Health check endpoint for chat service
  async healthCheck(req, res) {
    res.json({
      success: true,
      service: 'Chat Controller',
      status: 'operational',
      features: {
        chat: 'available',
        marketData: 'available',
        analysis: 'available',
        recommendations: 'available',
        history: 'in-memory only',
        watchlist: 'not available',
        portfolio: 'not available'
      },
      inMemoryUsers: chatHistoryStore.size,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new ChatController();
