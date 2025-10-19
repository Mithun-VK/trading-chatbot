const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== '') {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Use the latest stable model
        this.model = this.genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash', // Latest stable model
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        });
        
        console.log('✅ Gemini AI initialized successfully with gemini-2.0-flash');
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
      // Try Gemini if available
      if (this.isGeminiActive && this.model) {
        try {
          const geminiResponse = await this.generateGeminiResponse(message, context);
          console.log('✅ Gemini response generated successfully');
          return geminiResponse;
        } catch (error) {
          console.error('Gemini API Error:', error.message);
          
          // If it's a rate limit error, inform the user
          if (error.message.includes('429') || error.message.includes('quota')) {
            return {
              text: `⚠️ **Rate Limit Reached**\n\nGemini API has temporarily hit its rate limit (15 requests/minute on free tier).\n\nPlease wait a moment and try again, or I can provide analysis based on market data.`,
              type: 'text',
              suggestions: ['Try again', 'Market summary', 'Help'],
              isError: true
            };
          }
          
          // For other errors, fall back to mock
          console.log('🔄 Falling back to mock response');
          return this.generateMockResponse(message, context);
        }
      }
      
      // Use mock responses if Gemini not available
      return this.generateMockResponse(message, context);

    } catch (error) {
      console.error('AI Service Error:', error);
      return this.generateMockResponse(message, context);
    }
  }

  async generateGeminiResponse(message, context) {
    const prompt = this.buildPrompt(message, context);
    
    const result = await this.model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parse suggestions from Gemini response if present
    const suggestions = this.extractSuggestionsFromText(text);

    return {
      text: text,
      type: this.determineMessageType(message),
      suggestions: suggestions.length > 0 ? suggestions : this.getDefaultSuggestions(message),
      marketData: context.marketContext || null,
      source: 'gemini'
    };
  }

  buildPrompt(message, context) {
    let prompt = `You are an expert financial advisor and trading assistant specializing in stock market analysis, portfolio management, and investment strategies.\n\n`;
    
    // Add user context
    if (context.userPreferences) {
      prompt += `**User Profile:**\n`;
      prompt += `- Risk Tolerance: ${context.userPreferences.riskTolerance}\n`;
      prompt += `- Investment Goals: ${context.userPreferences.investmentGoals?.join(', ') || 'general growth'}\n`;
      if (context.userPreferences.preferredSectors?.length > 0) {
        prompt += `- Preferred Sectors: ${context.userPreferences.preferredSectors.join(', ')}\n`;
      }
      prompt += `\n`;
    }

    // Add conversation history for context
    if (context.chatHistory && context.chatHistory.length > 0) {
      prompt += `**Recent Conversation:**\n`;
      context.chatHistory.slice(-3).forEach((msg, i) => {
        prompt += `User: ${msg.message}\nAssistant: ${msg.response.substring(0, 100)}...\n\n`;
      });
    }

    // Add market context if available
    if (context.marketContext) {
      prompt += `**Current Market Data:**\n`;
      prompt += `Symbol: ${context.marketContext.symbol}\n`;
      prompt += `Price: $${context.marketContext.price}\n`;
      prompt += `Change: ${context.marketContext.change} (${context.marketContext.changePercent}%)\n\n`;
    }

    // Add the user's question
    prompt += `**User Question:** ${message}\n\n`;
    
    // Provide guidance on response format
    prompt += `**Instructions:**\n`;
    prompt += `1. Provide clear, actionable insights in 150-200 words\n`;
    prompt += `2. Use emojis for visual clarity (📊 📈 💰 🎯 etc.)\n`;
    prompt += `3. Structure with bullet points for key information\n`;
    prompt += `4. End with 2-3 follow-up question suggestions\n`;
    prompt += `5. Be professional but friendly\n`;
    prompt += `6. Include specific numbers and data when relevant\n\n`;

    prompt += `Generate your response now:`;

    return prompt;
  }

  extractSuggestionsFromText(text) {
    // Try to extract suggestions from Gemini response
    const suggestions = [];
    const lines = text.split('\n');
    
    lines.forEach(line => {
      if (line.match(/^\d+\.\s+[A-Z]/) || line.includes('Would you like to') || line.includes('Try:')) {
        const cleaned = line.replace(/^\d+\.\s+/, '').replace(/[?:]$/,'').trim();
        if (cleaned.length > 0 && cleaned.length < 50) {
          suggestions.push(cleaned);
        }
      }
    });

    return suggestions.slice(0, 3);
  }

  getDefaultSuggestions(message) {
    const lower = message.toLowerCase();
    
    if (lower.includes('market') || lower.includes('summary')) {
      return ['Analyze top stocks', 'Show sector performance', 'View my portfolio'];
    } else if (lower.includes('portfolio')) {
      return ['Show all holdings', 'Add new stock', 'Get recommendations'];
    } else if (lower.includes('stock') || /[A-Z]{2,5}/.test(message)) {
      return ['Add to watchlist', 'Set price alert', 'Compare with peers'];
    } else {
      return ['Market summary', 'Analyze a stock', 'View portfolio'];
    }
  }

  generateMockResponse(message, context) {
    console.log('📝 Using mock response (Gemini not available)');
    
    const responses = {
      market: {
        text: `📊 **Market Summary** (Mock Data)\n\nToday's market highlights:\n\n• **S&P 500:** +1.24% (5,847) 🟢\n• **Nasdaq:** +1.82% (18,352) 🟢\n• **Dow Jones:** +0.95% (42,863) 🟢\n\n**Top Movers:**\n🟢 Tech sector leading (+2.1%)\n🟢 AI stocks surging\n🔴 Energy sector down (-0.8%)\n\n*Note: This is demo data. Add GEMINI_API_KEY for real analysis.*`,
        type: 'market_data',
        suggestions: ['Analyze tech stocks', 'Show my portfolio', 'Get recommendations']
      },
      stock: {
        text: `📈 **${this.extractSymbol(message) || 'Stock'} Analysis** (Mock)\n\n**Current Status:**\n• Price: Strong uptrend ✅\n• Volume: Above average 📊\n• Momentum: Bullish 🚀\n• Rating: 4.3/5 ⭐\n\n**Recommendation:** Suitable for your moderate risk profile.\n\n*Add GEMINI_API_KEY for AI-powered analysis.*`,
        type: 'analysis',
        suggestions: ['Add to watchlist', 'Set price alert', 'Compare stocks']
      },
      portfolio: {
        text: `💼 **Portfolio Performance** (Mock)\n\n**Overall:** +5.4% (Last 30 days)\n\n**Top Holdings:**\n🟢 AAPL: +12.3%\n🟢 MSFT: +8.7%\n🔴 TSLA: -2.1%\n\n**Allocation:** Tech 60% | Healthcare 25% | Finance 15%\n\n*Connect Gemini for personalized insights.*`,
        type: 'analysis',
        suggestions: ['View all holdings', 'Rebalance portfolio', 'Add stock']
      },
      default: {
        text: `👋 **Trading Assistant** (Demo Mode)\n\nI can help with:\n\n📊 Stock analysis & recommendations\n💰 Portfolio tracking\n📈 Market trends & news\n🎯 Price alerts & watchlist\n\n*Add your GEMINI_API_KEY to unlock AI-powered insights!*\n\nWhat would you like to explore?`,
        type: 'text',
        suggestions: ['Market summary', 'Analyze AAPL', 'Check portfolio']
      }
    };

    const lower = message.toLowerCase();
    let response;

    if (lower.includes('market') || lower.includes('summary')) {
      response = responses.market;
    } else if (lower.includes('portfolio') || lower.includes('holdings')) {
      response = responses.portfolio;
    } else if (lower.includes('stock') || lower.includes('analyze') || /[A-Z]{2,5}/.test(message)) {
      response = responses.stock;
      
      const symbol = this.extractSymbol(message) || 'AAPL';
      response.marketData = [{
        symbol: symbol,
        price: (Math.random() * 300 + 100).toFixed(2),
        change: (Math.random() * 10 - 5).toFixed(2),
        changePercent: (Math.random() * 5 - 2.5).toFixed(2),
        volume: Math.floor(Math.random() * 100000000),
        high: (Math.random() * 305 + 105).toFixed(2),
        low: (Math.random() * 295 + 95).toFixed(2),
        open: (Math.random() * 300 + 100).toFixed(2),
        previousClose: (Math.random() * 300 + 100).toFixed(2),
        timestamp: new Date().toISOString(),
        isMockData: true
      }];
    } else {
      response = responses.default;
    }

    response.source = 'mock';
    return response;
  }

  async generateAnalysis(symbol, marketData, analysisType) {
    if (this.isGeminiActive && this.model) {
      try {
        const prompt = `Provide a detailed ${analysisType} analysis for ${symbol} stock:\n\nCurrent Price: $${marketData?.price}\nChange: ${marketData?.change}%\n\nInclude:\n1. Technical indicators\n2. Buy/Sell/Hold recommendation\n3. Price targets\n4. Risk assessment\n\nKeep response under 200 words with bullet points.`;
        
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

    // Mock fallback
    return {
      text: `**${analysisType.toUpperCase()} Analysis for ${symbol}**\n\n📊 Price: $${marketData?.price}\n📈 Trend: Bullish\n💪 Strength: Strong (RSI: 62)\n🎯 Target: $${(marketData?.price * 1.12).toFixed(2)}\n⚠️ Stop Loss: $${(marketData?.price * 0.94).toFixed(2)}\n\n**Key Factors:**\n• Volume increasing\n• Breaking resistance\n• Strong momentum\n\n**Verdict:** Strong BUY signal.`,
      recommendation: 'BUY',
      confidence: 0.75,
      keyPoints: [
        'Price above 50-day MA',
        'RSI in favorable zone',
        'Strong volume',
        'Positive momentum'
      ],
      source: 'mock'
    };
  }

  async generateRecommendations(user, category) {
    // You can add Gemini-powered recommendations here later
    const recommendations = {
      general: [
        { symbol: 'AAPL', reason: 'Market leader with strong fundamentals', confidence: 0.85 },
        { symbol: 'MSFT', reason: 'Cloud growth and AI integration', confidence: 0.88 },
        { symbol: 'GOOGL', reason: 'Ad revenue recovery, AI advancements', confidence: 0.82 }
      ],
      growth: [
        { symbol: 'NVDA', reason: 'AI chip demand explosion', confidence: 0.92 },
        { symbol: 'TSLA', reason: 'EV market expansion', confidence: 0.74 },
        { symbol: 'AMD', reason: 'Data center market share gains', confidence: 0.79 }
      ],
    };

    return {
      items: recommendations[category] || recommendations.general,
      basedOn: `${category} strategy aligned with ${user?.preferences?.riskTolerance || 'moderate'} risk`
    };
  }

  determineMessageType(message) {
    const lower = message.toLowerCase();
    if (lower.includes('market') || lower.includes('summary')) return 'market_data';
    if (lower.includes('analyze') || lower.includes('analysis')) return 'analysis';
    if (lower.includes('recommend')) return 'recommendation';
    return 'text';
  }

  extractRecommendation(text) {
    const lower = text.toLowerCase();
    if (lower.includes('strong buy') || lower.includes('buy')) return 'BUY';
    if (lower.includes('sell')) return 'SELL';
    return 'HOLD';
  }

  extractSymbol(message) {
    const match = message.match(/\b[A-Z]{2,5}\b/);
    return match ? match[0] : null;
  }

  extractKeyPoints(text) {
    const lines = text.split('\n').filter(line => 
      line.trim().startsWith('•') || 
      line.trim().startsWith('-') ||
      line.trim().match(/^\d+\./)
    );
    return lines.slice(0, 4).map(line => line.trim());
  }
}

module.exports = new AIService();
