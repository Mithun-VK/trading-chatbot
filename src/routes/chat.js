const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Bind all methods to the controller instance
router.post('/message', (req, res) => chatController.sendMessage(req, res));
router.get('/history/:userId', (req, res) => chatController.getChatHistoryEndpoint(req, res));
router.delete('/history/:userId', (req, res) => chatController.clearChatHistory(req, res));

// Market data endpoints
router.get('/market/:symbol', (req, res) => chatController.getMarketData(req, res));

// Analysis endpoints
router.post('/analyze', (req, res) => chatController.getAnalysis(req, res));
router.get('/recommendations', (req, res) => chatController.getRecommendations(req, res));

// Health check
router.get('/health', (req, res) => chatController.healthCheck(req, res));

// Not implemented features
router.post('/watchlist', (req, res) => chatController.addToWatchlist(req, res));
router.get('/watchlist/:userId', (req, res) => chatController.getWatchlist(req, res));
router.delete('/watchlist/:userId/:symbol', (req, res) => chatController.removeFromWatchlist(req, res));
router.get('/portfolio/:userId', (req, res) => chatController.getPortfolio(req, res));
router.post('/portfolio', (req, res) => chatController.updatePortfolio(req, res));

module.exports = router;
