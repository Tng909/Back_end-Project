const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, verifyAdmin } = require('../middleware/auth.middleware');
const { requestOTP, resendOTP } = require('../middleware/OTP_System');
const upload = require('../middleware/upload.middleware');

router.post('/request-otp', requestOTP);
router.post('/resend-otp', resendOTP);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/reset-password', authController.resetPassword);
router.get('/me', verifyToken, authController.getProfile);
router.put('/me', verifyToken, upload.single('avatar'), authController.updateProfile);
// Alias kept for clarity: multipart/form-data with field "avatar"
router.put('/me/avatar', verifyToken, upload.single('avatar'), authController.updateProfile);
// Admin user management (dashboard table: real DB data incl. seeded users)
router.get('/users', verifyAdmin, authController.getAllUsers);
router.post('/users', verifyAdmin, authController.createUserByAdmin);
router.put('/users/:id', verifyAdmin, authController.updateUserByAdmin);
router.delete('/users/:id', verifyAdmin, authController.deleteUserByAdmin);
module.exports = router;