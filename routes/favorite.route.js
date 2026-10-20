const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favorite.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All favorite routes are per-user and require login.
router.use(verifyToken);

router.get('/', favoriteController.getMyFavorites);
router.get('/ids', favoriteController.getFavoriteIds);
router.get('/check/:trackId', favoriteController.checkFavorite);
router.post('/:trackId', favoriteController.addFavorite);
router.delete('/:trackId', favoriteController.removeFavorite);

module.exports = router;
