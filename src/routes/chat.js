const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Chat endpoints
router.post('/message', chatController.sendMessage);
router.get('/history/:userId', chatController.getChatHistory);
router.delete('/history/:userId', chatController.clearChatHistory);

// Market data endpoints
router.get('/market/:symbol', chatController.getMarketData);
router.post('/watchlist', chatController.addToWatchlist);
router.get('/watchlist/:userId', chatController.getWatchlist);
router.delete('/watchlist/:userId/:symbol', chatController.removeFromWatchlist);

// Portfolio endpoints
router.get('/portfolio/:userId', chatController.getPortfolio);
router.post('/portfolio', chatController.updatePortfolio);

// Analysis endpoints
router.post('/analyze', chatController.getAnalysis);
router.get('/recommendations/:userId', chatController.getRecommendations);

module.exports = router;
