const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== '') {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        this.model = this.genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash-exp',
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        });
        
        console.log('✅ Gemini AI initialized successfully with gemini-2.0-flash-exp');
        this.isGeminiActive = true;
      } catch (error) {
        console.error('❌ Gemini initialization failed:', error.message);
        console.log('⚠️  Falling back to mock responses');
        this.model = null;
        this.isGeminiActive = false;
      }
    } else {
      console.log('⚠️  No GEMINI_API_KEY found - using mock responses');
      this.model = null;
      this.isGeminiActive = false;
    }
  }

  async generateResponse(message, context) {
    try {
      if (this.isGeminiActive && this.model) {
        try {
          const geminiResponse = await this.generateGeminiResponse(message, context);
          console.log('✅ Gemini response generated successfully');
          return geminiResponse;
        } catch (error) {
          console.error('Gemini API Error:', error.message);
          
          if (error.message.includes('429') || error.message.includes('quota')) {
            return {
              text: `⚠️ **Rate Limit Reached**\n\nGemini API has temporarily hit its rate limit (15 requests/minute on free tier).\n\nPlease wait a moment and try again.`,
              type: 'text',
              suggestions: ['Try again', 'Market summary', 'Help'],
              isError: true
            };
          }
          
          console.log('🔄 Falling back to formatted response with real data');
          return this.generateFormattedResponse(message, context);
        }
      }
      
      return this.generateFormattedResponse(message, context);

    } catch (error) {
      console.error('AI Service Error:', error);
      return this.generateFormattedResponse(message, context);
    }
  }

  async generateGeminiResponse(message, context) {
    try {
      const prompt = this.buildEnhancedPrompt(message, context);
      
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      
      let text = '';
      try {
        text = response.text();
      } catch (textError) {
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            text = candidate.content.parts[0].text || '';
          }
        }
        
        if (!text) {
          throw new Error('Unable to extract text from response');
        }
      }

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid or empty response text');
      }

      const suggestions = this.extractSuggestionsFromText(text);

      return {
        text: text,
        type: this.determineMessageType(message),
        suggestions: suggestions.length > 0 ? suggestions : this.getContextualSuggestions(message, context),
        marketData: context.marketContext || null,
        source: 'gemini'
      };
      
    } catch (error) {
      console.error('Gemini response error:', error.message);
      throw error;
    }
  }

  buildEnhancedPrompt(message, context) {
    let prompt = `You are Sentivest AI, an expert financial advisor and trading assistant. Provide clear, accurate, and actionable financial insights.\n\n`;
    
    // CRITICAL: Add real-time market data prominently
    if (context.marketContext && context.marketContext.relevantData && Array.isArray(context.marketContext.relevantData)) {
      prompt += `**📊 REAL-TIME MARKET DATA (${new Date().toLocaleString()}):**\n`;
      
      context.marketContext.relevantData.forEach(stock => {
        const priceChange = stock.regularMarketChange || stock.change || 0;
        const changePercent = stock.regularMarketChangePercent || stock.changePercent || 0;
        const price = stock.regularMarketPrice || stock.price || 0;
        const volume = stock.regularMarketVolume || stock.volume || 0;
        const high = stock.regularMarketDayHigh || stock.high || price;
        const low = stock.regularMarketDayLow || stock.low || price;
        
        const emoji = changePercent >= 0 ? '📈🟢' : '📉🔴';
        
        prompt += `\n${emoji} **${stock.symbol}** (${stock.shortName || stock.longName || stock.name || stock.symbol})\n`;
        prompt += `   • Current Price: $${price.toFixed(2)}\n`;
        prompt += `   • Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
        prompt += `   • Day Range: $${low.toFixed(2)} - $${high.toFixed(2)}\n`;
        prompt += `   • Volume: ${this.formatVolume(volume)}\n`;
        
        if (stock.marketCap) {
          prompt += `   • Market Cap: ${this.formatMarketCap(stock.marketCap)}\n`;
        }
        if (stock.pe) {
          prompt += `   • P/E Ratio: ${stock.pe.toFixed(2)}\n`;
        }
      });
      
      prompt += `\n**⚠️ IMPORTANT: Use ONLY the above real-time data in your response. Do NOT say you don't have access to real-time data.**\n\n`;
    }

    // Add conversation context
    if (context.chatHistory && Array.isArray(context.chatHistory) && context.chatHistory.length > 0) {
      prompt += `**Recent Context:**\n`;
      context.chatHistory.slice(-2).forEach((msg) => {
        if (msg && msg.content && typeof msg.content === 'string') {
          const content = msg.content.substring(0, 80);
          prompt += `${msg.role}: ${content}${msg.content.length > 80 ? '...' : ''}\n`;
        }
      });
      prompt += `\n`;
    }

    // Add the user's question
    prompt += `**👤 User Question:** ${message}\n\n`;
    
    // Provide clear instructions
    prompt += `**📝 Response Guidelines:**\n`;
    prompt += `1. Start with a direct answer using the REAL-TIME data provided above\n`;
    prompt += `2. Include specific prices, percentages, and numbers from the data\n`;
    prompt += `3. Use emojis for clarity: 📊 📈 📉 💰 🎯 ⚠️ ✅ 🔴 🟢\n`;
    prompt += `4. Structure with bullet points for readability\n`;
    prompt += `5. Keep response concise (200-300 words)\n`;
    prompt += `6. End with 2-3 actionable suggestions\n`;
    prompt += `7. Be professional yet conversational\n`;
    prompt += `8. NEVER claim you don't have real-time data - you have it above!\n\n`;

    prompt += `Generate your response now:`;

    return prompt;
  }

  generateFormattedResponse(message, context) {
    // If we have real market data, format it nicely even without Gemini
    if (context.marketContext && context.marketContext.relevantData && context.marketContext.relevantData.length > 0) {
      const stock = context.marketContext.relevantData[0];
      const price = stock.regularMarketPrice || stock.price || 0;
      const change = stock.regularMarketChange || stock.change || 0;
      const changePercent = stock.regularMarketChangePercent || stock.changePercent || 0;
      const volume = stock.regularMarketVolume || stock.volume || 0;
      const high = stock.regularMarketDayHigh || stock.high || price;
      const low = stock.regularMarketDayLow || stock.low || price;
      const open = stock.regularMarketOpen || stock.open || price;
      const previousClose = stock.regularMarketPreviousClose || stock.previousClose || price;
      
      const emoji = changePercent >= 0 ? '📈 🟢' : '📉 🔴';
      const symbol = stock.symbol || 'N/A';
      const name = stock.shortName || stock.longName || stock.name || symbol;
      
      let text = `${emoji} **${symbol} (${name}) - Real-Time Quote**\n\n`;
      text += `**Current Price:** $${price.toFixed(2)}\n`;
      text += `**Change:** ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n\n`;
      
      text += `**📊 Today's Trading:**\n`;
      text += `• Open: $${open.toFixed(2)}\n`;
      text += `• High: $${high.toFixed(2)}\n`;
      text += `• Low: $${low.toFixed(2)}\n`;
      text += `• Previous Close: $${previousClose.toFixed(2)}\n`;
      text += `• Volume: ${this.formatVolume(volume)}\n\n`;
      
      if (stock.marketCap) {
        text += `**💰 Market Cap:** ${this.formatMarketCap(stock.marketCap)}\n`;
      }
      if (stock.pe) {
        text += `**📈 P/E Ratio:** ${stock.pe.toFixed(2)}\n`;
      }
      if (stock.dividendYield) {
        text += `**💵 Dividend Yield:** ${(stock.dividendYield * 100).toFixed(2)}%\n`;
      }
      
      text += `\n**🕐 Last Updated:** ${new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })}`;
      
      if (stock.exchange) {
        text += ` (${stock.exchange})`;
      }
      
      text += `\n\n💡 *Powered by Yahoo Finance - Real-time data*`;
      
      return {
        text: text,
        type: 'stock_quote',
        suggestions: [
          `Analyze ${symbol}`,
          'Compare with competitors',
          'Show historical chart',
          'Set price alert'
        ],
        marketData: context.marketContext,
        source: 'formatted'
      };
    }
    
    // Fallback to mock if no real data
    return this.generateMockResponse(message, context);
  }

  generateMockResponse(message, context) {
    console.log('📝 Using mock response (No real data available)');
    
    const responses = {
      default: {
        text: `👋 **Sentivest AI Trading Assistant**\n\n**I can help you with:**\n\n📊 Real-time stock quotes & analysis\n💹 Market trends & insights\n📈 Portfolio recommendations\n🎯 Trading strategies\n💰 Risk assessment\n\n💡 *Ask me about any stock symbol (e.g., "AAPL price", "analyze TSLA")*\n\nWhat would you like to explore?`,
        type: 'text',
        suggestions: ['Market summary', 'Analyze AAPL', 'Show MSFT price', 'Trading tips']
      }
    };

    const response = responses.default;
    response.source = 'mock';
    return response;
  }

  formatVolume(volume) {
    if (volume >= 1000000000) {
      return `${(volume / 1000000000).toFixed(2)}B`;
    } else if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toString();
  }

  formatMarketCap(marketCap) {
    if (marketCap >= 1000000000000) {
      return `$${(marketCap / 1000000000000).toFixed(2)}T`;
    } else if (marketCap >= 1000000000) {
      return `$${(marketCap / 1000000000).toFixed(2)}B`;
    } else if (marketCap >= 1000000) {
      return `$${(marketCap / 1000000).toFixed(2)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  }

  extractSuggestionsFromText(text) {
    if (!text || typeof text !== 'string') return [];

    const suggestions = [];
    
    try {
      const lines = text.split('\n');
      
      lines.forEach(line => {
        if (line.match(/^\d+\.\s+[A-Z]/) || line.includes('Would you like to') || line.includes('Try:')) {
          const cleaned = line.replace(/^\d+\.\s+/, '').replace(/[?:]$/,'').trim();
          if (cleaned.length > 0 && cleaned.length < 50) {
            suggestions.push(cleaned);
          }
        }
      });
    } catch (error) {
      console.error('Error extracting suggestions:', error.message);
    }

    return suggestions.slice(0, 3);
  }

  getContextualSuggestions(message, context) {
    const lower = (message || '').toLowerCase();
    
    // If we have market data, provide relevant suggestions
    if (context.marketContext && context.marketContext.extractedSymbols && context.marketContext.extractedSymbols.length > 0) {
      const symbol = context.marketContext.extractedSymbols[0];
      return [
        `Analyze ${symbol} in detail`,
        `Compare ${symbol} with peers`,
        `Show ${symbol} chart`,
        'Set price alert'
      ];
    }
    
    if (lower.includes('market') || lower.includes('summary')) {
      return ['Top gainers today', 'Sector performance', 'Market news'];
    } else if (lower.includes('portfolio')) {
      return ['Show holdings', 'Add new stock', 'Rebalance advice'];
    } else {
      return ['Market overview', 'Analyze AAPL', 'Show MSFT price', 'Trading tips'];
    }
  }

  async generateAnalysis(symbol, marketData, analysisType) {
    if (this.isGeminiActive && this.model) {
      try {
        const prompt = `Provide a ${analysisType} analysis for ${symbol}:\n\nCurrent Price: $${marketData?.price}\nChange: ${marketData?.changePercent}%\nVolume: ${marketData?.volume}\nP/E: ${marketData?.pe}\n\nInclude:\n1. Technical indicators\n2. Buy/Sell/Hold recommendation\n3. Price targets\n4. Risk level\n\nKeep under 250 words with bullet points.`;
        
        const result = await this.model.generateContent(prompt);
        const text = result.response.text();

        return {
          text: text,
          recommendation: this.extractRecommendation(text),
          confidence: 0.80,
          keyPoints: this.extractKeyPoints(text),
          source: 'gemini'
        };
      } catch (error) {
        console.error('Gemini analysis error:', error.message);
      }
    }

    return {
      text: `**${analysisType.toUpperCase()} Analysis for ${symbol}**\n\n📊 Current: $${marketData?.price}\n📈 Trend: ${marketData?.changePercent >= 0 ? 'Bullish' : 'Bearish'}\n🎯 Target: $${(marketData?.price * 1.10).toFixed(2)}\n⚠️ Stop: $${(marketData?.price * 0.95).toFixed(2)}`,
      recommendation: marketData?.changePercent >= 2 ? 'BUY' : marketData?.changePercent <= -2 ? 'SELL' : 'HOLD',
      confidence: 0.75,
      keyPoints: [`Price: $${marketData?.price}`, `Change: ${marketData?.changePercent}%`],
      source: 'formatted'
    };
  }

  async generateRecommendations(user, category) {
    const recommendations = {
      general: [
        { symbol: 'AAPL', reason: 'Market leader, strong fundamentals', confidence: 0.85 },
        { symbol: 'MSFT', reason: 'Cloud growth, AI integration', confidence: 0.88 },
        { symbol: 'GOOGL', reason: 'AI advancements, ad recovery', confidence: 0.82 }
      ]
    };

    return {
      items: recommendations[category] || recommendations.general,
      basedOn: `${category} strategy`
    };
  }

  determineMessageType(message) {
    const lower = (message || '').toLowerCase();
    if (lower.includes('price') || lower.includes('quote')) return 'stock_quote';
    if (lower.includes('market') || lower.includes('summary')) return 'market_data';
    if (lower.includes('analyze') || lower.includes('analysis')) return 'analysis';
    return 'text';
  }

  extractRecommendation(text) {
    if (!text || typeof text !== 'string') return 'HOLD';
    
    const lower = text.toLowerCase();
    if (lower.includes('strong buy') || lower.includes('buy')) return 'BUY';
    if (lower.includes('sell')) return 'SELL';
    return 'HOLD';
  }

  extractKeyPoints(text) {
    if (!text || typeof text !== 'string') return [];
    
    try {
      const lines = text.split('\n').filter(line => 
        line.trim().startsWith('•') || 
        line.trim().startsWith('-') ||
        line.trim().match(/^\d+\./)
      );
      return lines.slice(0, 4).map(line => line.trim());
    } catch (error) {
      return [];
    }
  }
}

module.exports = new AIService();
