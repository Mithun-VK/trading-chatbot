const axios = require('axios');

class MarketService {
  constructor() {
    this.baseURL = 'https://api.twelvedata.com';
    this.apiKey = process.env.TWELVE_DATA_API_KEY || 'demo';
  }

  async getStockData(symbol) {
    try {
      // Using a free API for demo purposes
      const response = await axios.get(`${this.baseURL}/price`, {
        params: {
          symbol: symbol.toUpperCase(),
          apikey: this.apiKey
        }
      });

      const price = parseFloat(response.data.price) || 0;
      
      // Get additional data
      const quoteResponse = await axios.get(`${this.baseURL}/quote`, {
        params: {
          symbol: symbol.toUpperCase(),
          apikey: this.apiKey
        }
      }).catch(() => ({ data: {} }));

      const quote = quoteResponse.data;

      return {
        symbol: symbol.toUpperCase(),
        price: price,
        change: parseFloat(quote.change) || 0,
        changePercent: parseFloat(quote.percent_change) || 0,
        volume: parseInt(quote.volume) || 0,
        high: parseFloat(quote.high) || price,
        low: parseFloat(quote.low) || price,
        open: parseFloat(quote.open) || price,
        previousClose: parseFloat(quote.previous_close) || price,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Market data error for ${symbol}:`, error.message);
      
      // Return mock data for demo purposes
      return this.getMockStockData(symbol);
    }
  }

  getMockStockData(symbol) {
    const basePrice = Math.random() * 200 + 50;
    const change = (Math.random() - 0.5) * 10;
    const changePercent = (change / basePrice) * 100;

    return {
      symbol: symbol.toUpperCase(),
      price: parseFloat(basePrice.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000),
      high: parseFloat((basePrice + Math.abs(change)).toFixed(2)),
      low: parseFloat((basePrice - Math.abs(change)).toFixed(2)),
      open: parseFloat((basePrice - change).toFixed(2)),
      previousClose: parseFloat((basePrice - change).toFixed(2)),
      timestamp: new Date().toISOString(),
      isMockData: true
    };
  }

  async getDetailedStockData(symbol) {
    try {
      const basicData = await this.getStockData(symbol);
      
      // Get time series data
      const timeSeriesResponse = await axios.get(`${this.baseURL}/time_series`, {
        params: {
          symbol: symbol.toUpperCase(),
          interval: '1day',
          outputsize: 30,
          apikey: this.apiKey
        }
      }).catch(() => ({ data: { values: [] } }));

      return {
        ...basicData,
        timeSeries: timeSeriesResponse.data.values || [],
        technicalIndicators: {
          rsi: Math.random() * 100,
          macd: (Math.random() - 0.5) * 2,
          bollinger: {
            upper: basicData.price * 1.1,
            middle: basicData.price,
            lower: basicData.price * 0.9
          }
        }
      };

    } catch (error) {
      console.error(`Detailed market data error for ${symbol}:`, error.message);
      return this.getStockData(symbol);
    }
  }

  async getRelevantMarketData(message) {
    const symbols = this.extractSymbolsFromMessage(message);
    
    if (symbols.length === 0) {
      return null;
    }

    try {
      const marketData = await Promise.all(
        symbols.map(symbol => this.getStockData(symbol))
      );

      return {
        relevantData: marketData,
        extractedSymbols: symbols
      };

    } catch (error) {
      console.error('Relevant market data error:', error);
      return null;
    }
  }

  extractSymbolsFromMessage(message) {
    const symbolPattern = /\b[A-Z]{1,5}\b/g;
    const possibleSymbols = message.toUpperCase().match(symbolPattern) || [];
    
    // Filter out common words that might match the pattern
    const commonWords = ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'BUT', 'DID', 'GET', 'MAY', 'HIM', 'OLD', 'SEE', 'NOW', 'WAY', 'WHO', 'BOY', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE'];
    
    return possibleSymbols.filter(symbol => 
      !commonWords.includes(symbol) && 
      symbol.length >= 1 && 
      symbol.length <= 5
    ).slice(0, 3); // Limit to 3 symbols to avoid API overuse
  }

  async getMarketSummary() {
    const majorIndices = ['SPY', 'QQQ', 'DIA', 'IWM'];
    
    try {
      const summaryData = await Promise.all(
        majorIndices.map(symbol => this.getStockData(symbol))
      );

      return {
        indices: summaryData,
        marketSentiment: this.calculateMarketSentiment(summaryData),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Market summary error:', error);
      return {
        indices: [],
        marketSentiment: 'neutral',
        timestamp: new Date().toISOString()
      };
    }
  }

  calculateMarketSentiment(marketData) {
    const avgChange = marketData.reduce((sum, data) => sum + data.changePercent, 0) / marketData.length;
    
    if (avgChange > 1) return 'bullish';
    if (avgChange < -1) return 'bearish';
    return 'neutral';
  }
}

module.exports = new MarketService();
