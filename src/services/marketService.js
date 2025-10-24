const yahooFinance = require('yahoo-finance2').default;

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
  }

  // Check rate limit before making requests
  async checkRateLimit() {
    if (Date.now() > this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = Date.now() + 60000;
    }
    
    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      const waitTime = this.rateLimit.resetTime - Date.now();
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
      return cached.data;
    }
    
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
        const quote = await yahooFinance.quote(symbol.toUpperCase(), {
          fields: ['regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent', 
                   'regularMarketVolume', 'regularMarketDayHigh', 'regularMarketDayLow',
                   'regularMarketOpen', 'regularMarketPreviousClose', 'marketCap', 
                   'fiftyTwoWeekHigh', 'fiftyTwoWeekLow', 'averageVolume', 'bid', 'ask',
                   'bidSize', 'askSize', 'trailingPE', 'forwardPE', 'dividendYield']
        });

        return {
          symbol: quote.symbol,
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
      console.error(`Error fetching stock data for ${symbol}:`, error.message);
      throw new Error(`Failed to fetch data for ${symbol}: ${error.message}`);
    }
  }

  // Get detailed stock data with historical information
  async getDetailedStockData(symbol, options = {}) {
    try {
      await this.checkRateLimit();
      
      const cacheKey = `detailed_${symbol}_${JSON.stringify(options)}`;
      
      return await this.getCachedData(cacheKey, async () => {
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
        });

        // Get historical data (last 30 days by default)
        const period = options.period || '1mo';
        const interval = options.interval || '1d';
        
        const historical = await yahooFinance.historical(symbol.toUpperCase(), {
          period1: this.calculatePeriodStart(period),
          period2: new Date(),
          interval: interval
        });

        // Get chart data for intraday
        const chart = await yahooFinance.chart(symbol.toUpperCase(), {
          period1: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          interval: '5m'
        }).catch(() => null);

        return {
          symbol: symbol.toUpperCase(),
          quote: quoteSummary.price,
          summaryDetail: quoteSummary.summaryDetail,
          statistics: quoteSummary.defaultKeyStatistics,
          financialData: quoteSummary.financialData,
          earnings: quoteSummary.earnings,
          recommendations: quoteSummary.recommendationTrend,
          historical: historical,
          intraday: chart ? chart.quotes : [],
          timestamp: new Date().toISOString()
        };
      });

    } catch (error) {
      console.error(`Error fetching detailed data for ${symbol}:`, error.message);
      // Fallback to basic quote
      return await this.getStockData(symbol);
    }
  }

  // Get multiple quotes at once (batch processing)
  async getMultipleQuotes(symbols) {
    try {
      await this.checkRateLimit();
      
      // Yahoo Finance supports batch quotes
      const quotes = await yahooFinance.quote(symbols.map(s => s.toUpperCase()));
      
      return Array.isArray(quotes) ? quotes : [quotes];

    } catch (error) {
      console.error('Error fetching multiple quotes:', error.message);
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
        const trending = await yahooFinance.trendingSymbols('US', {
          count: count
        });
        
        return trending.quotes || [];
      });

    } catch (error) {
      console.error('Error fetching trending symbols:', error.message);
      return [];
    }
  }

  // Get market summary with major indices
  async getMarketSummary() {
    try {
      const majorIndices = ['^GSPC', '^DJI', '^IXIC', '^RUT', '^VIX']; // S&P 500, Dow, Nasdaq, Russell 2000, VIX
      
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
      console.error('Market summary error:', error.message);
      throw error;
    }
  }

  // Get options chain data
  async getOptionsData(symbol, expirationDate = null) {
    try {
      await this.checkRateLimit();
      
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
      console.error(`Error fetching options for ${symbol}:`, error.message);
      return null;
    }
  }

  // Get relevant market data based on message content
  async getRelevantMarketData(message) {
    const symbols = this.extractSymbolsFromMessage(message);
    
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
      console.error('Relevant market data error:', error);
      return null;
    }
  }

  // Search for stocks
  async searchStocks(query) {
    try {
      await this.checkRateLimit();
      
      const searchResults = await yahooFinance.search(query);
      
      return searchResults.quotes || [];

    } catch (error) {
      console.error(`Search error for "${query}":`, error.message);
      return [];
    }
  }

  // Get recommendations for a symbol
  async getRecommendations(symbol) {
    try {
      await this.checkRateLimit();
      
      const recommendations = await yahooFinance.recommendationsBySymbol(symbol.toUpperCase());
      
      return recommendations;

    } catch (error) {
      console.error(`Error fetching recommendations for ${symbol}:`, error.message);
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

  // Extract symbols from message
  extractSymbolsFromMessage(message) {
    const symbolPattern = /\b[A-Z]{1,5}\b/g;
    const possibleSymbols = message.toUpperCase().match(symbolPattern) || [];
    
    const commonWords = ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 
                         'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'GET', 'MAY', 
                         'HIM', 'OLD', 'SEE', 'NOW', 'WAY', 'WHO', 'BOY', 'ITS', 
                         'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'API', 'GET'];
    
    return possibleSymbols
      .filter(symbol => !commonWords.includes(symbol) && symbol.length >= 1)
      .slice(0, 5);
  }

  // Calculate market sentiment
  calculateMarketSentiment(marketData) {
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
    console.log('Cache cleared');
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

module.exports = new MarketService();
