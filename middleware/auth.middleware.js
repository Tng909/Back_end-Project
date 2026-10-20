const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const { loadKeys } = require('../config/jwtKeys');

// RS256 public-use: verify with PUBLIC key only (safe to share).
// Private key NEVER leaves auth server — it only signs at login.
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Access denied. No token provided.' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. Malformed token.' });
  try {
    const { publicKey } = loadKeys();
    if (!publicKey) return res.status(500).json({ error: 'RS256 public key not configured.' });
    const verified = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Check the current database role so an old token cannot keep admin access
// after the account is demoted or deleted.
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    User.findOne({ _id: req.user._id, role: 'admin' })
      .select('_id')
      .lean()
      .then((admin) => {
        if (admin) return next();
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      })
      .catch(next);
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