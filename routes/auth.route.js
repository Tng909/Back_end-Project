const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, verifyAdmin } = require('../middleware/auth.middleware');
const { resolveMailConfig } = require('../utils/sendEmail');
const upload = require('../middleware/upload.middleware');

// Public: register + login. Login is NEVER gated on email confirm.
router.post('/register', authController.register);
router.post('/confirm-email', authController.confirmEmail);
router.post('/login', authController.login);
router.post('/reset-password', authController.resetPassword);

// Debug: sender status only (never leaks password). Helps diagnose 535.
router.get('/mail-status', (req, res) => {
  try {
    const cfg = resolveMailConfig();
    res.json({
      provider: cfg.provider, host: cfg.host, port: cfg.port, secure: cfg.secure,
      from: cfg.from, userSet: Boolean(cfg.user), passSet: Boolean(cfg.pass),
      ready: Boolean(cfg.configured)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PROTECTED user paths: require valid JWT (bcrypt-checked at login).
router.get('/me', verifyToken, authController.getProfile);
router.put('/me', verifyToken, upload.single('avatar'), authController.updateProfile);
// Alias kept for clarity: multipart/form-data with field "avatar"
router.put('/me/avatar', verifyToken, upload.single('avatar'), authController.updateProfile);
// Admin user management (dashboard table: real DB data incl. seeded users)
router.get('/users', verifyAdmin, authController.getAllUsers);
router.get('/users/:id', verifyAdmin, authController.getUserById);
router.post('/users', verifyAdmin, authController.createUserByAdmin);
router.put('/users/:id', verifyAdmin, authController.updateUserByAdmin);
router.delete('/users/:id', verifyAdmin, authController.deleteUserByAdmin);
module.exports = router;