const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

// Public chat endpoints (rate-limit friendly: small payloads, no auth needed)
router.post('/chat', aiController.chat);
router.get('/suggestions', aiController.suggestions);

module.exports = router;
