const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
  constructor() {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== '') {
      try {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Use the correct, stable Gemini model
        this.model = this.genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash', // CORRECTED: Use stable model instead of experimental
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        });
        
        console.log('✅ Gemini AI initialized successfully with gemini-1.5-flash');
        this.isGeminiActive = true;
      } catch (error) {
        console.error('❌ Gemini initialization failed:', error.message);
        console.log('⚠️  Falling back to formatted responses');
        this.model = null;
        this.isGeminiActive = false;
      }
    } else {
      console.log('⚠️  No GEMINI_API_KEY found - using formatted responses');
      this.model = null;
      this.isGeminiActive = false;
    }
  }

  async generateResponse(message, context) {
    try {
      // Always try to format with real data first if available
      if (context.marketContext && context.marketContext.relevantData && context.marketContext.relevantData.length > 0) {
        // If we have real market data, use Gemini to enhance the response
        if (this.isGeminiActive && this.model) {
          try {
            const geminiResponse = await this.generateGeminiResponse(message, context);
            console.log('✅ Gemini response generated successfully');
            return geminiResponse;
          } catch (error) {
            console.error('Gemini API Error:', error.message);
            
            // Handle rate limits gracefully
            if (error.message.includes('429') || error.message.includes('quota')) {
              console.log('⚠️ Rate limit hit, using formatted response');
            } else if (error.message.includes('404') || error.message.includes('not found')) {
              console.log('⚠️ Model not found, using formatted response');
            }
            
            // Fall back to formatted response with real data
            return this.generateFormattedResponse(message, context);
          }
        }
        
        // No Gemini, but we have data - format it nicely
        return this.generateFormattedResponse(message, context);
      }
      
      // No market data available
      return this.generateMockResponse(message, context);

    } catch (error) {
      console.error('AI Service Error:', error);
      return this.generateMockResponse(message, context);
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
        console.warn('Error extracting text, trying alternative method:', textError.message);
        
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            text = candidate.content.parts[0].text || '';
          }
        }
        
        if (!text) {
          throw new Error('Unable to extract text from Gemini response');
        }
      }

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid or empty response from Gemini');
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
      console.error('Gemini response generation error:', error.message);
      throw error;
    }
  }

  buildEnhancedPrompt(message, context) {
    let prompt = `You are Sentivest AI, an expert financial advisor and trading assistant specializing in stock market analysis.\n\n`;
    
    // Add real-time market data prominently
    if (context.marketContext && context.marketContext.relevantData && Array.isArray(context.marketContext.relevantData)) {
      prompt += `**📊 REAL-TIME MARKET DATA (Live from Yahoo Finance):**\n\n`;
      
      context.marketContext.relevantData.forEach(stock => {
        const price = stock.regularMarketPrice || stock.price || 0;
        const change = stock.regularMarketChange || stock.change || 0;
        const changePercent = stock.regularMarketChangePercent || stock.changePercent || 0;
        const volume = stock.regularMarketVolume || stock.volume || 0;
        const high = stock.regularMarketDayHigh || stock.high || price;
        const low = stock.regularMarketDayLow || stock.low || price;
        
        const emoji = changePercent >= 0 ? '📈🟢' : '📉🔴';
        const symbol = stock.symbol || 'UNKNOWN';
        const name = stock.shortName || stock.longName || stock.name || symbol;
        
        prompt += `${emoji} **${symbol}** - ${name}\n`;
        prompt += `• Current Price: $${price.toFixed(2)}\n`;
        prompt += `• Today's Change: ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
        prompt += `• Day Range: $${low.toFixed(2)} - $${high.toFixed(2)}\n`;
        prompt += `• Volume: ${this.formatVolume(volume)}\n`;
        
        if (stock.marketCap) {
          prompt += `• Market Cap: ${this.formatMarketCap(stock.marketCap)}\n`;
        }
        if (stock.pe) {
          prompt += `• P/E Ratio: ${stock.pe.toFixed(2)}\n`;
        }
        if (stock.dividendYield) {
          prompt += `• Dividend Yield: ${(stock.dividendYield * 100).toFixed(2)}%\n`;
        }
        
        prompt += `\n`;
      });
      
      prompt += `**⚠️ CRITICAL: You HAVE live real-time data above. Use these exact numbers in your response. Do NOT claim you lack real-time data.**\n\n`;
    }

    // Add conversation history for context
    if (context.chatHistory && Array.isArray(context.chatHistory) && context.chatHistory.length > 0) {
      prompt += `**Conversation History:**\n`;
      context.chatHistory.slice(-2).forEach((msg) => {
        if (msg && msg.content && typeof msg.content === 'string') {
          const content = msg.content.substring(0, 100);
          prompt += `${msg.role === 'user' ? '👤 User' : '🤖 Assistant'}: ${content}${msg.content.length > 100 ? '...' : ''}\n`;
        }
      });
      prompt += `\n`;
    }

    // Add the current user question
    prompt += `**👤 Current Question:** ${message}\n\n`;
    
    // Provide response guidelines
    prompt += `**📝 Response Instructions:**\n`;
    prompt += `1. Answer directly using the LIVE DATA provided above\n`;
    prompt += `2. Include specific prices, percentages, and metrics from the data\n`;
    prompt += `3. Use emojis strategically: 📊 📈 📉 💰 🎯 ⚠️ ✅ 🔴 🟢\n`;
    prompt += `4. Format with clear bullet points\n`;
    prompt += `5. Keep response 200-300 words\n`;
    prompt += `6. End with 2-3 actionable next steps\n`;
    prompt += `7. Be conversational yet professional\n`;
    prompt += `8. NEVER say you lack real-time data - you have it above!\n\n`;

    prompt += `Generate your expert response now:`;

    return prompt;
  }

  generateFormattedResponse(message, context) {
    // Format real market data into a professional response
    if (context.marketContext && context.marketContext.relevantData && context.marketContext.relevantData.length > 0) {
      const stock = context.marketContext.relevantData[0];
      
      // Safely extract all data points
      const symbol = stock.symbol || 'N/A';
      const name = stock.shortName || stock.longName || stock.name || symbol;
      const price = stock.regularMarketPrice || stock.price || 0;
      const change = stock.regularMarketChange || stock.change || 0;
      const changePercent = stock.regularMarketChangePercent || stock.changePercent || 0;
      const volume = stock.regularMarketVolume || stock.volume || 0;
      const high = stock.regularMarketDayHigh || stock.high || price;
      const low = stock.regularMarketDayLow || stock.low || price;
      const open = stock.regularMarketOpen || stock.open || price;
      const previousClose = stock.regularMarketPreviousClose || stock.previousClose || price;
      
      const emoji = changePercent >= 0 ? '📈 🟢' : '📉 🔴';
      const trend = changePercent >= 0 ? 'up' : 'down';
      
      let text = `${emoji} **${symbol} - ${name}**\n\n`;
      
      // Current Price Section
      text += `**💵 Current Price:** $${price.toFixed(2)}\n`;
      text += `**📊 Change:** ${change >= 0 ? '+' : ''}$${change.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%) ${emoji}\n\n`;
      
      // Trading Data Section
      text += `**📈 Today's Trading:**\n`;
      text += `• Open: $${open.toFixed(2)}\n`;
      text += `• High: $${high.toFixed(2)}\n`;
      text += `• Low: $${low.toFixed(2)}\n`;
      text += `• Previous Close: $${previousClose.toFixed(2)}\n`;
      text += `• Volume: ${this.formatVolume(volume)}\n\n`;
      
      // Additional Metrics
      if (stock.marketCap) {
        text += `**💰 Market Cap:** ${this.formatMarketCap(stock.marketCap)}\n`;
      }
      if (stock.pe) {
        text += `**📊 P/E Ratio:** ${stock.pe.toFixed(2)}\n`;
      }
      if (stock.dividendYield) {
        text += `**💵 Dividend Yield:** ${(stock.dividendYield * 100).toFixed(2)}%\n`;
      }
      if (stock.fiftyTwoWeekHigh) {
        text += `**📈 52-Week High:** $${stock.fiftyTwoWeekHigh.toFixed(2)}\n`;
      }
      if (stock.fiftyTwoWeekLow) {
        text += `**📉 52-Week Low:** $${stock.fiftyTwoWeekLow.toFixed(2)}\n`;
      }
      
      // Trading insight
      text += `\n**💡 Quick Insight:**\n`;
      text += `${symbol} is trading ${trend} today`;
      if (Math.abs(changePercent) > 2) {
        text += ` with significant movement (${Math.abs(changePercent).toFixed(2)}%)`;
      } else if (Math.abs(changePercent) < 0.5) {
        text += ` with minimal volatility`;
      }
      text += `.`;
      
      // Timestamp and source
      text += `\n\n**🕐 Updated:** ${new Date().toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })}`;
      
      if (stock.exchange) {
        text += ` • ${stock.exchange}`;
      }
      
      text += `\n\n💡 *Real-time data powered by Yahoo Finance*`;
      
      return {
        text: text,
        type: 'stock_quote',
        suggestions: [
          `Detailed analysis of ${symbol}`,
          `Compare ${symbol}`,
          `Historical chart`,
          'Set price alert'
        ],
        marketData: context.marketContext,
        source: 'formatted'
      };
    }
    
    // No real data available
    return this.generateMockResponse(message, context);
  }

  generateMockResponse(message, context) {
    console.log('📝 Using mock response (No market data available)');
    
    const lower = (message || '').toLowerCase();
    
    let text = `👋 **Sentivest AI - Your Trading Assistant**\n\n`;
    
    if (lower.includes('price') || lower.includes('stock') || lower.includes('quote')) {
      text += `I can help you get real-time stock information!\n\n`;
      text += `**Try asking:**\n`;
      text += `• "What's the stock price of AAPL?"\n`;
      text += `• "Show me MSFT quote"\n`;
      text += `• "TSLA stock price"\n`;
      text += `• "How is GOOGL performing?"\n\n`;
      text += `💡 I'll fetch live data from Yahoo Finance for you!`;
    } else {
      text += `**I can help you with:**\n\n`;
      text += `📊 Real-time stock quotes & prices\n`;
      text += `💹 Market trends & analysis\n`;
      text += `📈 Portfolio insights\n`;
      text += `🎯 Trading strategies\n`;
      text += `💰 Investment recommendations\n\n`;
      text += `💡 *Ask me about any stock symbol (AAPL, MSFT, TSLA, etc.)*`;
    }
    
    return {
      text: text,
      type: 'text',
      suggestions: ['Show AAPL price', 'Analyze MSFT', 'Market summary', 'Help'],
      source: 'mock'
    };
  }

  formatVolume(volume) {
    if (!volume || volume === 0) return 'N/A';
    
    if (volume >= 1000000000) {
      return `${(volume / 1000000000).toFixed(2)}B`;
    } else if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(2)}K`;
    }
    return volume.toLocaleString();
  }

  formatMarketCap(marketCap) {
    if (!marketCap || marketCap === 0) return 'N/A';
    
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
        const cleaned = line.trim();
        
        // Match numbered suggestions or questions
        if (cleaned.match(/^\d+\.\s+[A-Z]/) || 
            cleaned.includes('Would you like') || 
            cleaned.includes('Try:') ||
            cleaned.includes('Next steps:')) {
          const suggestion = cleaned
            .replace(/^\d+\.\s+/, '')
            .replace(/[?:]/g, '')
            .trim();
            
          if (suggestion.length > 5 && suggestion.length < 60) {
            suggestions.push(suggestion);
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
    
    // If we have market data, provide symbol-specific suggestions
    if (context.marketContext && context.marketContext.extractedSymbols && context.marketContext.extractedSymbols.length > 0) {
      const symbol = context.marketContext.extractedSymbols[0];
      return [
        `Detailed analysis of ${symbol}`,
        `Compare ${symbol} with peers`,
        `${symbol} historical chart`,
        'Set price alert'
      ];
    }
    
    // Context-based suggestions
    if (lower.includes('market') || lower.includes('summary')) {
      return ['Top gainers today', 'Sector performance', 'Market indices'];
    } else if (lower.includes('portfolio')) {
      return ['Show my holdings', 'Add new stock', 'Portfolio analysis'];
    } else if (lower.includes('analyze') || lower.includes('analysis')) {
      return ['Technical analysis', 'Fundamental analysis', 'Price targets'];
    } else {
      return ['Show AAPL price', 'Analyze MSFT', 'Market summary', 'Trading tips'];
    }
  }

  async generateAnalysis(symbol, marketData, analysisType) {
    if (this.isGeminiActive && this.model) {
      try {
        const prompt = `Provide a concise ${analysisType} analysis for ${symbol}:\n\nPrice: $${marketData?.price}\nChange: ${marketData?.changePercent}%\nVolume: ${this.formatVolume(marketData?.volume)}\nP/E: ${marketData?.pe || 'N/A'}\n\nInclude:\n1. Technical outlook\n2. Recommendation (Buy/Hold/Sell)\n3. Price target\n4. Risk level\n\nKeep under 200 words with bullets.`;
        
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

    // Fallback analysis
    const trend = (marketData?.changePercent || 0) >= 0 ? 'Bullish' : 'Bearish';
    return {
      text: `**${analysisType.toUpperCase()} Analysis - ${symbol}**\n\n📊 Current: $${marketData?.price}\n📈 Trend: ${trend}\n🎯 Target: $${((marketData?.price || 0) * 1.10).toFixed(2)}\n⚠️ Stop Loss: $${((marketData?.price || 0) * 0.95).toFixed(2)}`,
      recommendation: (marketData?.changePercent || 0) >= 2 ? 'BUY' : (marketData?.changePercent || 0) <= -2 ? 'SELL' : 'HOLD',
      confidence: 0.70,
      keyPoints: [`Current Price: $${marketData?.price}`, `Change: ${marketData?.changePercent}%`],
      source: 'formatted'
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
    if (lower.includes('strong buy') || (lower.includes('buy') && !lower.includes('dont buy'))) return 'BUY';
    if (lower.includes('sell') && !lower.includes('dont sell')) return 'SELL';
    return 'HOLD';
  }

  extractKeyPoints(text) {
    if (!text || typeof text !== 'string') return [];
    
    try {
      const lines = text.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('•') || 
               trimmed.startsWith('-') ||
               trimmed.match(/^\d+\./);
      });
      return lines.slice(0, 5).map(line => line.trim());
    } catch (error) {
      return [];
    }
  }
}

module.exports = new AIService();
