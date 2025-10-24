// marketService.js - DIAGNOSTIC & FIXED VERSION
let yahooFinance = null;
let initPromise = null;

// Initialize Yahoo Finance module with proper error handling
async function initYahooFinance() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      console.log('🔄 Loading yahoo-finance2 module...');
      const module = await import('yahoo-finance2');
      
      // Debug: Log the entire module structure
      console.log('📦 Module keys:', Object.keys(module));
      console.log('📦 Module.default exists:', !!module.default);
      console.log('📦 Module.quote exists:', typeof module.quote);
      console.log('📦 Module.default?.quote exists:', typeof module.default?.quote);
      
      // Try all possible import patterns
      if (typeof module.quote === 'function') {
        // Pattern 1: Named exports directly on module
        yahooFinance = module;
        console.log('✅ Using direct module exports');
      } else if (module.default && typeof module.default.quote === 'function') {
        // Pattern 2: Default export with methods
        yahooFinance = module.default;
        console.log('✅ Using module.default exports');
      } else if (module.default && typeof module.default.default === 'object') {
        // Pattern 3: Nested default
        yahooFinance = module.default.default;
        console.log('✅ Using module.default.default exports');
      } else {
        throw new Error('Could not find yahoo-finance2 methods in any expected location');
      }
      
      console.log('✅ Yahoo Finance loaded successfully');
      console.log('📊 Available methods:', Object.keys(yahooFinance).filter(k => typeof yahooFinance[k] === 'function').slice(0, 10).join(', '));
      
      return yahooFinance;
    } catch (error) {
      console.error('❌ Failed to load yahoo-finance2:', error.message);
      console.error('💡 Stack:', error.stack);
      throw error;
    }
  })();
  
  return initPromise;
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
      maxRequests: 30
    };
    
    // Request queue for managing concurrent requests
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    // Statistics tracking
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Initialize module
    this.ready = initYahooFinance();
    
    console.log('✅ MarketService initialized');
  }

  // Ensure Yahoo Finance is ready before any operation
  async ensureReady() {
    if (!yahooFinance) {
      await this.ready;
    }
    if (!yahooFinance) {
      throw new Error('Yahoo Finance module failed to initialize. Please check your installation.');
    }
    return yahooFinance;
  }

  // Check rate limit before making requests
  async checkRateLimit() {
    const now = Date.now();
    
    if (now > this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = now + 60000;
    }
    
    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      const waitTime = this.rateLimit.resetTime - now;
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
      this.stats.cacheHits++;
      return cached.data;
    }
    
    console.log(`🔄 Fetching fresh data for: ${key}`);
    this.stats.cacheMisses++;
    const data = await fetchFunction();
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }

  // Get real-time stock quote
  async getStockData(symbol) {
    this.stats.totalRequests++;
    
    try {
      const yf = await this.ensureReady();
      await this.checkRateLimit();
      
      return await this.getCachedData(`quote_${symbol}`, async () => {
        console.log(`📈 Fetching quote for: ${symbol}`);
        
        const quote = await yf.quote(symbol.toUpperCase(), {
          fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent', 
                   'regularMarketVolume', 'regularMarketDayHigh', 'regularMarketDayLow',
                   'regularMarketOpen', 'regularMarketPreviousClose', 'marketCap', 
                   'fiftyTwoWeekHigh', 'fiftyTwoWeekLow', 'averageVolume', 'bid', 'ask',
                   'bidSize', 'askSize', 'trailingPE', 'forwardPE', 'dividendYield',
                   'shortName', 'longName', 'currency', 'exchange']
        });

        console.log(`✅ Successfully fetched quote for ${symbol}: $${quote.regularMarketPrice}`);
        this.stats.successfulRequests++;

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
          currency: quote.currency || 'USD',
          exchange: quote.exchange || 'N/A',
          timestamp: new Date().toISOString(),
          source: 'yahoo-finance'
        };
      });

    } catch (error) {
      this.stats.failedRequests++;
      console.error(`❌ Error fetching stock data for ${symbol}:`, error.message);
      throw new Error(`Failed to fetch data for ${symbol}: ${error.message}`);
    }
  }

  // Get detailed stock data with historical information
  async getDetailedStockData(symbol, options = {}) {
    try {
      const yf = await this.ensureReady();
      await this.checkRateLimit();
      
      const cacheKey = `detailed_${symbol}_${JSON.stringify(options)}`;
      
      return await this.getCachedData(cacheKey, async () => {
        console.log(`🔍 Fetching detailed data for: ${symbol}`);
        
        // Get quote summary with multiple modules
        const quoteSummary = await yf.quoteSummary(symbol.toUpperCase(), {
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

        // Get historical data
        const period = options.period || '1mo';
        const interval = options.interval || '1d';
        
        const historical = await yf.historical(symbol.toUpperCase(), {
          period1: this.calculatePeriodStart(period),
          period2: new Date(),
          interval: interval
        }).catch(err => {
          console.warn(`⚠️ Could not fetch historical data for ${symbol}:`, err.message);
          return [];
        });

        // Get intraday chart data
        const chart = await yf.chart(symbol.toUpperCase(), {
          period1: new Date(Date.now() - 24 * 60 * 60 * 1000),
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
      const yf = await this.ensureReady();
      
      // Filter and validate symbols
      const validSymbols = symbols.filter(s => {
        if (!s || typeof s !== 'string') return false;
        if (s.length < 1 || s.length > 5) return false;
        return true;
      });
      
      if (validSymbols.length === 0) {
        console.warn('⚠️ No valid symbols to fetch');
        return [];
      }

      await this.checkRateLimit();
      
      console.log(`📊 Fetching multiple quotes for: ${validSymbols.join(', ')}`);
      
      const quotes = await yf.quote(validSymbols.map(s => s.toUpperCase()));
      
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
  async getTrendingSymbols(count = 10, region = 'US') {
    try {
      const yf = await this.ensureReady();
      await this.checkRateLimit();
      
      return await this.getCachedData(`trending_${region}`, async () => {
        console.log(`🔥 Fetching trending symbols for ${region}...`);
        const trending = await yf.trendingSymbols(region, { count });
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
      const majorIndices = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX'];
      
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
      const yf = await this.ensureReady();
      await this.checkRateLimit();
      
      console.log(`🔎 Searching for: ${query}`);
      const searchResults = await yf.search(query);
      
      return searchResults.quotes || [];

    } catch (error) {
      console.error(`❌ Search error for "${query}":`, error.message);
      return [];
    }
  }

  // Calculate period start date
  calculatePeriodStart(period) {
    const now = new Date();
    const periodMap = {
      '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180,
      '1y': 365, '2y': 730, '5y': 1825, '10y': 3650,
      'ytd': Math.floor((now - new Date(now.getFullYear(), 0, 1)) / (24 * 60 * 60 * 1000)),
      'max': 36500
    };
    
    const days = periodMap[period] || 30;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  // Get index name from symbol
  getIndexName(symbol) {
    const indexNames = {
      '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'NASDAQ',
      '^RUT': 'Russell 2000', '^VIX': 'VIX', '^FTSE': 'FTSE 100',
      '^N225': 'Nikkei 225', '^HSI': 'Hang Seng'
    };
    return indexNames[symbol] || symbol;
  }

  // Extract stock symbols from message
  extractSymbolsFromMessage(message) {
    const symbolPattern = /\$?[A-Z]{1,5}\b/g;
    const possibleSymbols = message.toUpperCase().match(symbolPattern) || [];
    
    const commonWords = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE',
      'OUR', 'HAD', 'GET', 'MAY', 'HIM', 'OLD', 'SEE', 'NOW', 'WAY', 'WHO', 'BOY', 'ITS',
      'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'API', 'WITH', 'STOCK', 'PRICE', 'OF',
      'IS', 'IN', 'AT', 'TO', 'FROM', 'BY', 'ON', 'AS', 'OR', 'AN', 'BE', 'SO', 'UP',
      'OUT', 'IF', 'NO', 'GO', 'DO', 'MY', 'IT', 'WE', 'ME', 'HE', 'US', 'AM', 'PM',
      'AI', 'VS', 'VIA', 'PER', 'ETC', 'SHOW', 'TELL', 'GIVE', 'FIND', 'WHAT', 'WHEN',
      'WHERE', 'WHY', 'HOW', 'MUCH', 'MANY', 'SOME', 'MORE', 'LESS', 'THAN', 'THEN',
      'THEM', 'THESE', 'THOSE', 'THIS', 'THAT', 'HAS', 'BEEN', 'WILL', 'ABOUT'
    ]);
    
    const validSymbols = possibleSymbols
      .map(s => s.replace('$', ''))
      .filter(symbol => {
        if (commonWords.has(symbol)) return false;
        if (symbol.length < 1 || symbol.length > 5) return false;
        if (!/^[A-Z]+$/.test(symbol)) return false;
        return true;
      });
    
    return [...new Set(validSymbols)].slice(0, 5);
  }

  // Calculate market sentiment from data
  calculateMarketSentiment(marketData) {
    if (!marketData || marketData.length === 0) return 'neutral';

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

  // Clear all cache
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ Cache cleared (${size} entries removed)`);
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
      timeout: `${this.cacheTimeout / 1000} seconds`,
      cacheHitRate: this.stats.cacheHits > 0 
        ? `${((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  // Get service statistics
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? `${((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2)}%`
        : '0%',
      cacheHitRate: (this.stats.cacheHits + this.stats.cacheMisses) > 0
        ? `${((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(2)}%`
        : '0%',
      uptime: process.uptime()
    };
  }

  // Health check
  async healthCheck() {
    try {
      const yf = await this.ensureReady();
      
      // Test with a simple quote request
      const testQuote = await yf.quote('AAPL');
      
      return {
        status: 'healthy',
        service: 'Yahoo Finance',
        moduleLoaded: !!yf,
        testSymbol: 'AAPL',
        testPrice: testQuote.regularMarketPrice,
        stats: this.getStats(),
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
