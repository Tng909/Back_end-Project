const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

// Any route using this only runs AFTER login, and login itself does
// bcrypt.compare(password, user.passwordHash) — seeded admin password is
// stored hashed, so the admin path is bcrypt-protected at the credential check.
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Access denied. No token provided.' });

  const token = authHeader.split(' ')[1];
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Admin-only path guard: valid JWT + role === 'admin'.
// The admin's seed password is bcrypt-hashed (see config/seedAdmin.js),
// so reaching here proves the caller passed the bcrypt password check at login.
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role === 'admin') next();
    else res.status(403).json({ error: 'Access denied. Admin role required.' });
  });
};

// Extra step-up guard for sensitive admin paths: re-verify password with bcrypt.
// Usage: router.post('/admin/sensitive', verifyAdmin, verifyAdminPassword, handler)
// Body: { adminPassword: '...' } — compared via bcrypt against the admin's hash.
const verifyAdminPassword = async (req, res, next) => {
  try {
    const adminPassword = String(req.body?.adminPassword || '');
    if (!adminPassword) return res.status(401).json({ error: 'Admin password confirmation required.' });
    const admin = await User.findOne({ _id: req.user._id, role: 'admin' });
    if (!admin) return res.status(403).json({ error: 'Access denied. Admin role required.' });
    const ok = await bcrypt.compare(adminPassword, admin.password);
    if (!ok) return res.status(401).json({ error: 'Admin password incorrect.' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { verifyToken, verifyAdmin, verifyAdminPassword };