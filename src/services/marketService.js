// marketService.js - FIXED VERSION
let yahooFinance;

// Async initialization for ES Module compatibility
async function initYahooFinance() {
  if (!yahooFinance) {
    try {
      // Use dynamic import for ES Module
      const module = await import('yahoo-finance2');
      yahooFinance = module.default;
      console.log('✅ Yahoo Finance loaded via dynamic import');
    } catch (error) {
      console.error('❌ Failed to load yahoo-finance2:', error.message);
      throw error;
    }
  }
  return yahooFinance;
}

class MarketService {
  constructor() {
    // Enhanced cache configuration
    this.cache = new Map();
    this.cacheTimeout = 60 * 1000; // 1 minute for real-time data
    
    // Rate limiting configuration
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 60000,
      maxRequests: 30 // Yahoo Finance is more permissive
    };
    
    // Request queue for managing concurrent requests
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    // Debug logging
    console.log('✅ MarketService initialized with Yahoo Finance');
    console.log('📊 Yahoo Finance module loaded:', typeof yahooFinance);
  }

  // Check rate limit before making requests
  async checkRateLimit() {
    if (Date.now() > this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = Date.now() + 60000;
    }
    
    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      const waitTime = this.rateLimit.resetTime - Date.now();
      console.log(`⏳ Rate limit reached. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = Date.now() + 60000;
    }
    
    this.rateLimit.requests++;
  }

  // Get cached data or fetch new data
  async getCachedData(key, fetchFunction) {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`📦 Cache hit for: ${key}`);
      return cached.data;
    }
    
    console.log(`🔄 Fetching fresh data for: ${key}`);
    const data = await fetchFunction();
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }

  // Get real-time stock quote
  async getStockData(symbol) {
    try {
      await this.checkRateLimit();
      
      return await this.getCachedData(`quote_${symbol}`, async () => {
        console.log(`📈 Fetching quote for: ${symbol}`);
        
        const quote = await yahooFinance.quote(symbol.toUpperCase(), {
          fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent', 
                   'regularMarketVolume', 'regularMarketDayHigh', 'regularMarketDayLow',
                   'regularMarketOpen', 'regularMarketPreviousClose', 'marketCap', 
                   'fiftyTwoWeekHigh', 'fiftyTwoWeekLow', 'averageVolume', 'bid', 'ask',
                   'bidSize', 'askSize', 'trailingPE', 'forwardPE', 'dividendYield',
                   'shortName', 'longName']
        });

        console.log(`✅ Successfully fetched quote for ${symbol}: $${quote.regularMarketPrice}`);

        return {
          symbol: quote.symbol,
          name: quote.shortName || quote.longName || symbol,
          price: quote.regularMarketPrice || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          volume: quote.regularMarketVolume || 0,
          high: quote.regularMarketDayHigh || quote.regularMarketPrice,
          low: quote.regularMarketDayLow || quote.regularMarketPrice,
          open: quote.regularMarketOpen || quote.regularMarketPrice,
          previousClose: quote.regularMarketPreviousClose || quote.regularMarketPrice,
          marketCap: quote.marketCap || 0,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0,
          averageVolume: quote.averageVolume || 0,
          bid: quote.bid || 0,
          ask: quote.ask || 0,
          bidSize: quote.bidSize || 0,
          askSize: quote.askSize || 0,
          pe: quote.trailingPE || null,
          forwardPE: quote.forwardPE || null,
          dividendYield: quote.dividendYield || null,
          timestamp: new Date().toISOString(),
          source: 'yahoo-finance'
        };
      });

    } catch (error) {
      console.error(`❌ Error fetching stock data for ${symbol}:`, error.message);
      throw new Error(`Failed to fetch data for ${symbol}: ${error.message}`);
    }
  }

  // Get detailed stock data with historical information
  async getDetailedStockData(symbol, options = {}) {
    try {
      await this.checkRateLimit();
      
      const cacheKey = `detailed_${symbol}_${JSON.stringify(options)}`;
      
      return await this.getCachedData(cacheKey, async () => {
        console.log(`🔍 Fetching detailed data for: ${symbol}`);
        
        // Get quote summary with multiple modules
        const quoteSummary = await yahooFinance.quoteSummary(symbol.toUpperCase(), {
          modules: [
            'price',
            'summaryDetail',
            'defaultKeyStatistics',
            'financialData',
            'calendarEvents',
            'recommendationTrend',
            'earnings',
            'earningsTrend'
          ]
        }).catch(err => {
          console.warn(`⚠️ Could not fetch quote summary for ${symbol}:`, err.message);
          return null;
        });

        // Get historical data (last 30 days by default)
        const period = options.period || '1mo';
        const interval = options.interval || '1d';
        
        const historical = await yahooFinance.historical(symbol.toUpperCase(), {
          period1: this.calculatePeriodStart(period),
          period2: new Date(),
          interval: interval
        }).catch(err => {
          console.warn(`⚠️ Could not fetch historical data for ${symbol}:`, err.message);
          return [];
        });

        // Get chart data for intraday
        const chart = await yahooFinance.chart(symbol.toUpperCase(), {
          period1: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          interval: '5m'
        }).catch(() => null);

        return {
          symbol: symbol.toUpperCase(),
          quote: quoteSummary?.price || null,
          summaryDetail: quoteSummary?.summaryDetail || null,
          statistics: quoteSummary?.defaultKeyStatistics || null,
          financialData: quoteSummary?.financialData || null,
          earnings: quoteSummary?.earnings || null,
          recommendations: quoteSummary?.recommendationTrend || null,
          historical: historical || [],
          intraday: chart ? chart.quotes : [],
          timestamp: new Date().toISOString()
        };
      });

    } catch (error) {
      console.error(`❌ Error fetching detailed data for ${symbol}:`, error.message);
      // Fallback to basic quote
      return await this.getStockData(symbol);
    }
  }

  // Get multiple quotes at once (batch processing)
  async getMultipleQuotes(symbols) {
    try {
      // Filter out invalid symbols first
      const validSymbols = symbols.filter(s => s && s.length > 0 && s.length <= 5);
      
      if (validSymbols.length === 0) {
        console.warn('⚠️ No valid symbols to fetch');
        return [];
      }

      await this.checkRateLimit();
      
      console.log(`📊 Fetching multiple quotes for: ${validSymbols.join(', ')}`);
      
      // Yahoo Finance supports batch quotes
      const quotes = await yahooFinance.quote(validSymbols.map(s => s.toUpperCase()));
      
      const result = Array.isArray(quotes) ? quotes : [quotes];
      console.log(`✅ Successfully fetched ${result.length} quotes`);
      
      return result;

    } catch (error) {
      console.error('❌ Error fetching multiple quotes:', error.message);
      // Fallback to individual requests
      const results = [];
      for (const symbol of symbols) {
        try {
          const data = await this.getStockData(symbol);
          results.push(data);
        } catch (err) {
          console.error(`Failed to fetch ${symbol}:`, err.message);
        }
      }
      return results;
    }
  }

  // Get trending symbols
  async getTrendingSymbols(count = 10) {
    try {
      await this.checkRateLimit();
      
      return await this.getCachedData('trending', async () => {
        console.log(`🔥 Fetching trending symbols...`);
        const trending = await yahooFinance.trendingSymbols('US', {
          count: count
        });
        
        return trending.quotes || [];
      });

    } catch (error) {
      console.error('❌ Error fetching trending symbols:', error.message);
      return [];
    }
  }

  // Get market summary with major indices
  async getMarketSummary() {
    try {
      const majorIndices = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX']; // S&P 500, Dow, Nasdaq, Russell 2000, VIX
      
      console.log('📊 Fetching market summary...');
      const indices = await this.getMultipleQuotes(majorIndices);
      const trending = await this.getTrendingSymbols(5);
      
      return {
        indices: indices.map(index => ({
          symbol: index.symbol,
          name: this.getIndexName(index.symbol),
          price: index.regularMarketPrice || index.price,
          change: index.regularMarketChange || index.change,
          changePercent: index.regularMarketChangePercent || index.changePercent
        })),
        trending: trending,
        marketSentiment: this.calculateMarketSentiment(indices),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Market summary error:', error.message);
      throw error;
    }
  }

  // Get options chain data
  async getOptionsData(symbol, expirationDate = null) {
    try {
      await this.checkRateLimit();
      
      console.log(`📋 Fetching options data for: ${symbol}`);
      const options = await yahooFinance.options(symbol.toUpperCase(), 
        expirationDate ? { date: new Date(expirationDate) } : {}
      );
      
      return {
        symbol: symbol.toUpperCase(),
        expirationDates: options.expirationDates || [],
        strikes: options.strikes || [],
        calls: options.options[0]?.calls || [],
        puts: options.options[0]?.puts || [],
        quote: options.quote
      };

    } catch (error) {
      console.error(`❌ Error fetching options for ${symbol}:`, error.message);
      return null;
    }
  }

  // Get relevant market data based on message content
  async getRelevantMarketData(message) {
    const symbols = this.extractSymbolsFromMessage(message);
    
    console.log(`🔍 Extracted symbols from message: ${symbols.join(', ') || 'none'}`);
    
    if (symbols.length === 0) {
      return null;
    }

    try {
      const marketData = await this.getMultipleQuotes(symbols);
      
      return {
        relevantData: marketData,
        extractedSymbols: symbols,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Relevant market data error:', error);
      return null;
    }
  }

  // Search for stocks
  async searchStocks(query) {
    try {
      await this.checkRateLimit();
      
      console.log(`🔎 Searching for: ${query}`);
      const searchResults = await yahooFinance.search(query);
      
      return searchResults.quotes || [];

    } catch (error) {
      console.error(`❌ Search error for "${query}":`, error.message);
      return [];
    }
  }

  // Get recommendations for a symbol
  async getRecommendations(symbol) {
    try {
      await this.checkRateLimit();
      
      console.log(`💡 Fetching recommendations for: ${symbol}`);
      const recommendations = await yahooFinance.recommendationsBySymbol(symbol.toUpperCase());
      
      return recommendations;

    } catch (error) {
      console.error(`❌ Error fetching recommendations for ${symbol}:`, error.message);
      return null;
    }
  }

  // Helper method to calculate period start date
  calculatePeriodStart(period) {
    const now = new Date();
    const periodMap = {
      '1d': 1,
      '5d': 5,
      '1mo': 30,
      '3mo': 90,
      '6mo': 180,
      '1y': 365,
      '2y': 730,
      '5y': 1825,
      '10y': 3650,
      'ytd': Math.floor((now - new Date(now.getFullYear(), 0, 1)) / (24 * 60 * 60 * 1000)),
      'max': 36500 // 100 years
    };
    
    const days = periodMap[period] || 30;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  // Helper to get index name
  getIndexName(symbol) {
    const indexNames = {
      '^GSPC': 'S&P 500',
      '^DJI': 'Dow Jones',
      '^IXIC': 'NASDAQ',
      '^RUT': 'Russell 2000',
      '^VIX': 'VIX'
    };
    return indexNames[symbol] || symbol;
  }

  // Extract symbols from message - ENHANCED with better filtering
  extractSymbolsFromMessage(message) {
    // Match stock symbols (1-5 uppercase letters)
    const symbolPattern = /\b[A-Z]{1,5}\b/g;
    const possibleSymbols = message.toUpperCase().match(symbolPattern) || [];
    
    // Comprehensive list of common English words to exclude
    const commonWords = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 
      'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'GET', 'MAY', 
      'HIM', 'OLD', 'SEE', 'NOW', 'WAY', 'WHO', 'BOY', 'ITS', 
      'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'API', 'WITH',
      // Critical additions to prevent false positives
      'STOCK', 'PRICE', 'OF', 'IS', 'IN', 'AT', 'TO', 'FROM',
      'BY', 'ON', 'AS', 'OR', 'AN', 'BE', 'SO', 'UP', 'OUT',
      'IF', 'NO', 'GO', 'DO', 'MY', 'IT', 'WE', 'ME', 'HE',
      'US', 'AM', 'PM', 'AI', 'VS', 'VIA', 'PER', 'ETC',
      'SHOW', 'TELL', 'GIVE', 'FIND', 'WHAT', 'WHEN', 'WHERE',
      'WHY', 'HOW', 'MUCH', 'MANY', 'SOME', 'MORE', 'LESS',
      'THAN', 'THEN', 'THEM', 'THESE', 'THOSE', 'THIS', 'THAT',
      'ABOUT', 'AFTER', 'AGAIN', 'ALSO', 'BOTH', 'EACH', 'EVEN',
      'JUST', 'LIKE', 'MAKE', 'ONLY', 'OVER', 'SAME', 'SUCH',
      'TAKE', 'THEM', 'THERE', 'THINK', 'UNDER', 'VERY', 'WELL',
      'WHAT', 'WILL', 'WITH', 'WOULD', 'YEAR'
    ]);
    
    // Filter out common words and keep only valid stock symbols
    const validSymbols = possibleSymbols.filter(symbol => {
      // Must not be a common word
      if (commonWords.has(symbol)) return false;
      
      // Must be between 1-5 characters
      if (symbol.length < 1 || symbol.length > 5) return false;
      
      // Must be all letters (no numbers)
      if (!/^[A-Z]+$/.test(symbol)) return false;
      
      return true;
    });
    
    // Remove duplicates and limit to 5 symbols
    return [...new Set(validSymbols)].slice(0, 5);
  }

  // Calculate market sentiment
  calculateMarketSentiment(marketData) {
    if (!marketData || marketData.length === 0) {
      return 'neutral';
    }

    const avgChange = marketData.reduce((sum, data) => {
      const change = data.regularMarketChangePercent || data.changePercent || 0;
      return sum + change;
    }, 0) / marketData.length;
    
    if (avgChange > 1) return 'bullish';
    if (avgChange > 0.5) return 'moderately-bullish';
    if (avgChange < -1) return 'bearish';
    if (avgChange < -0.5) return 'moderately-bearish';
    return 'neutral';
  }

  // Clear cache manually
  clearCache() {
    this.cache.clear();
    console.log('🗑️ Cache cleared');
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      timeout: `${this.cacheTimeout / 1000} seconds`
    };
  }

  // Health check method
  async healthCheck() {
    try {
      // Test with a simple quote request
      await this.getStockData('AAPL');
      return {
        status: 'healthy',
        service: 'Yahoo Finance',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'Yahoo Finance',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new MarketService();
