// marketService.js - CORRECTED VERSION
let yahooFinance = null;
let initPromise = null;

async function initYahooFinance() {
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      console.log('🔄 Loading yahoo-finance2 module...');
      const module = await import('yahoo-finance2');
      
      if (typeof module.default === 'function') {
        console.log('📦 Creating yahooFinance instance...');
        // Simple initialization without cookieJar to avoid errors
        yahooFinance = new module.default({ 
          suppressNotices: ['yahooSurvey']
        });
        console.log('✅ Yahoo Finance instance created successfully');
      } else {
        yahooFinance = module.default;
        console.log('✅ Yahoo Finance loaded as object');
      }
      
      console.log('📊 Available methods:', Object.keys(Object.getPrototypeOf(yahooFinance)).filter(k => typeof yahooFinance[k] === 'function').slice(0, 10).join(', '));
      
      return yahooFinance;
    } catch (error) {
      console.error('❌ Failed to load yahoo-finance2:', error.message);
      throw error;
    }
  })();
  
  return initPromise;
}

class MarketService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60 * 1000;
    
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 60000,
      maxRequests: 30
    };
    
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastResetTime: new Date().toISOString()
    };
    
    this.ready = initYahooFinance();
    
    console.log('✅ MarketService initialized');
  }

  async ensureReady() {
    if (!yahooFinance) {
      await this.ready;
    }
    if (!yahooFinance) {
      throw new Error('Yahoo Finance module failed to initialize');
    }
    return yahooFinance;
  }

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
    
    if (this.cache.size > 100) {
      this.cleanupCache();
    }
    
    return data;
  }

  async getStockData(symbol) {
    this.stats.totalRequests++;
    
    try {
      const yf = await this.ensureReady();
      await this.checkRateLimit();
      
      return await this.getCachedData(`quote_${symbol}`, async () => {
        console.log(`📈 Fetching quote for: ${symbol}`);
        
        // Use only valid fields according to yahoo-finance2 schema
        const quote = await yf.quote(symbol.toUpperCase(), {
          fields: [
            'regularMarketPrice', 
            'regularMarketChange', 
            'regularMarketChangePercent', 
            'regularMarketVolume', 
            'regularMarketDayHigh', 
            'regularMarketDayLow',
            'regularMarketOpen', 
            'regularMarketPreviousClose', 
            'marketCap', 
            'fiftyTwoWeekHigh', 
            'fiftyTwoWeekLow', 
            'averageDailyVolume3Month', // CORRECTED from 'averageVolume'
            'averageDailyVolume10Day',  // Additional valid field
            'bid', 
            'ask',
            'bidSize', 
            'askSize', 
            'trailingPE', 
            'forwardPE', 
            'dividendYield',
            'shortName', 
            'longName', 
            'currency', 
            'exchange', 
            'quoteType'
          ]
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
          averageVolume: quote.averageDailyVolume3Month || quote.averageDailyVolume10Day || 0,
          bid: quote.bid || 0,
          ask: quote.ask || 0,
          bidSize: quote.bidSize || 0,
          askSize: quote.askSize || 0,
          pe: quote.trailingPE || null,
          forwardPE: quote.forwardPE || null,
          dividendYield: quote.dividendYield || null,
          currency: quote.currency || 'USD',
          exchange: quote.exchange || 'N/A',
          quoteType: quote.quoteType || 'EQUITY',
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

  async getDetailedStockData(symbol, options = {}) {
    try {
      const yf = await this.ensureReady();
      await this.checkRateLimit();
      
      const cacheKey = `detailed_${symbol}_${JSON.stringify(options)}`;
      
      return await this.getCachedData(cacheKey, async () => {
        console.log(`🔍 Fetching detailed data for: ${symbol}`);
        
        const quoteSummary = await yf.quoteSummary(symbol.toUpperCase(), {
          modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData']
        }).catch(err => {
          console.warn(`⚠️ Could not fetch quote summary for ${symbol}:`, err.message);
          return null;
        });

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

        return {
          symbol: symbol.toUpperCase(),
          quote: quoteSummary?.price || null,
          summaryDetail: quoteSummary?.summaryDetail || null,
          statistics: quoteSummary?.defaultKeyStatistics || null,
          financialData: quoteSummary?.financialData || null,
          historical: historical || [],
          timestamp: new Date().toISOString()
        };
      });

    } catch (error) {
      console.error(`❌ Error fetching detailed data for ${symbol}:`, error.message);
      return await this.getStockData(symbol);
    }
  }

  async getMultipleQuotes(symbols) {
    try {
      const yf = await this.ensureReady();
      
      const validSymbols = symbols.filter(s => s && typeof s === 'string' && s.length > 0 && s.length <= 5);
      
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

  getIndexName(symbol) {
    const indexNames = {
      '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'NASDAQ',
      '^RUT': 'Russell 2000', '^VIX': 'VIX'
    };
    return indexNames[symbol] || symbol;
  }

  extractSymbolsFromMessage(message) {
    const symbolPattern = /\$?[A-Z]{1,5}\b/g;
    const possibleSymbols = message.toUpperCase().match(symbolPattern) || [];
    
    const commonWords = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE',
      'OUR', 'HAD', 'GET', 'MAY', 'HIM', 'OLD', 'SEE', 'NOW', 'WAY', 'WHO', 'BOY', 'ITS',
      'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'API', 'WITH', 'STOCK', 'PRICE', 'OF',
      'IS', 'IN', 'AT', 'TO', 'FROM', 'BY', 'ON', 'AS', 'OR', 'AN', 'BE', 'SO', 'UP',
      'OUT', 'IF', 'NO', 'GO', 'DO', 'MY', 'IT', 'WE', 'ME', 'HE', 'US', 'AM', 'PM'
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

  cleanupCache() {
    const now = Date.now();
    const entriesToDelete = [];
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout * 5) {
        entriesToDelete.push(key);
      }
    }
    
    entriesToDelete.forEach(key => this.cache.delete(key));
    
    if (entriesToDelete.length > 0) {
      console.log(`🗑️ Cleaned up ${entriesToDelete.length} expired cache entries`);
    }
  }

  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ Cache cleared (${size} entries removed)`);
  }

  getCacheStats() {
    const totalRequests = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      size: this.cache.size,
      timeout: `${this.cacheTimeout / 1000} seconds`,
      hitRate: totalRequests > 0 
        ? `${((this.stats.cacheHits / totalRequests) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0
        ? `${((this.stats.successfulRequests / this.stats.totalRequests) * 100).toFixed(2)}%`
        : '0%'
    };
  }

  async healthCheck() {
    try {
      const yf = await this.ensureReady();
      const testQuote = await yf.quote('AAPL');
      
      return {
        status: 'healthy',
        service: 'Yahoo Finance',
        testSymbol: 'AAPL',
        testPrice: testQuote.regularMarketPrice,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new MarketService();
