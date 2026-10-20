require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');
const initUploadDirs = require('./config/initDirs');
const trackRoutes = require('./routes/track.route');
const authRoutes = require('./routes/auth.route');
const aiRoutes = require('./routes/ai.route');
const playlistRoutes = require('./routes/playlist.route');
const favoriteRoutes = require('./routes/favorite.route');
const historyRoutes = require('./routes/history.route');
const seedAdmin = require('./config/seedAdmin');
const { checkSmtpOnBoot } = require('./utils/sendEmail');
const { metricsMiddleware } = require('./middleware/metrics.middleware');
const metricsRoutes = require('./routes/metrics.route');
const app = express();
const PORT = process.env.PORT || 3000;

connectDB().then(() => seedAdmin());
initUploadDirs();

// Non-blocking: verifies SMTP, never crashes boot. Register/login work either way.
checkSmtpOnBoot().catch((err) => console.warn('[Mail] SMTP check error (non-fatal):', err.message));

// --- Security hardening -----------------------------------------------------
// Helmet: safe HTTP headers. CSP is disabled on purpose — the static frontend
// in /main uses inline scripts + CDN assets, so a strict CSP would break it.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: only the app itself + localhost dev origins may call the API from a
// browser. Override/extend with CORS_ORIGIN=http://a.com,http://b.com in .env.
// Requests WITHOUT an Origin header (same-origin page, curl, mobile app) pass.
const allowedOrigins = [
  ...(process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  ...(process.env.APP_URL ? [String(process.env.APP_URL).replace(/\/+$/, '')] : []),
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`
];
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false); // browser blocks the response (no CORS headers)
  }
}));

app.use(express.json());

// --- Performance metrics (request counts / timings for the admin dashboard) ---
app.use(metricsMiddleware);

// Liveness/readiness probe used by Render's healthCheckPath (and any LB).
// Returns 503 until MongoDB is actually connected so traffic is not routed
// to an instance that cannot serve requests.
app.get('/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    db: dbUp ? 'connected' : 'disconnected'
  });
});

// Rate limiting: brute-force protection (tune via .env; tests raise the caps).
// Standard + legacy headers off => draft-7 "RateLimit-*" headers only.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
// Stricter cap on auth endpoints (login/register/reset) where guessing hurts most.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' }
});
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);
// ----------------------------------------------------------------------------

app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/metrics', metricsRoutes);

// Helper: trả JSON cho fetch()/API, trả trang HTML cho trình duyệt vào URL web.
// (Tránh lỗi frontend "Unexpected token '<'" khi gọi API, và cho người dùng
// trang lỗi đẹp thay vì JSON khô khi mở URL trực tiếp.)
function sendError(req, res, status, page, message) {
  if (req.path.startsWith('/api/') || req.xhr || (req.headers.accept || '').includes('application/json')) {
    return res.status(status).json({ error: message });
  }
  return res.status(status).sendFile(path.join(__dirname, 'main', page));
}

// Return JSON (not HTML) for unknown API routes so frontend res.json() never gets <!DOCTYPE
app.use('/api', (req, res) => res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` }));

// JSON error handler (e.g. multer: wrong file type / too large) so frontend gets JSON
// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => {
  if (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err.message || 'Upload failed.' });
  }
  next();
});

// --- Static assets: CDN + cache headers -------------------------------------
// CDN_BASE_URL (optional, e.g. https://cdn.yourdomain.com): when set, every
// request under /uploads is 302'd to the CDN origin, which should be pointed
// at this service's origin (or an S3/R2 bucket synced with uploads/).
// Without it, files are served locally with long-lived cache headers.
const CDN_BASE_URL = String(process.env.CDN_BASE_URL || '').replace(/\/+$/, '');

// Uploaded files get unique names on every upload (timestamp+random), so they
// are immutable: tell browsers/CDN to cache them for a year.
app.use('/uploads', (req, res, next) => {
  if (CDN_BASE_URL) return res.redirect(302, `${CDN_BASE_URL}${req.originalUrl}`);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// HTML must stay fresh (no long cache). JS/CSS get only a short window (5 min)
// because files are NOT content-hashed here — a longer max-age would keep
// users on stale scripts for up to an hour after every deploy. ETags still
// make revalidation a cheap 304.
app.use(express.static(path.join(__dirname, 'main'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
    else res.set('Cache-Control', 'public, max-age=300');
  }
}));

app.get('/', (req, res) => {res.sendFile(path.join(__dirname, 'main', 'Main.html'));
});

// Trang lỗi trực tiếp: /400 /401 /500 (để test + cho frontend redirect tới).
app.get('/400', (req, res) => sendError(req, res, 400, '400.html', 'Bad request.'));
app.get('/401', (req, res) => sendError(req, res, 401, '401.html', 'Unauthorized. Please log in.'));
app.get('/500', (req, res) => sendError(req, res, 500, '500.html', 'Internal server error.'));

// 404 cho mọi đường dẫn web không tồn tại -> giao diện 404.html.
// Đặt SAU static/api/uploads để không chặn route hợp lệ.
// (Route /api không tồn tại vẫn trả JSON ở trên để frontend parse được.)
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  }
  res.status(404).sendFile(path.join(__dirname, 'main', '404.html'));
});

// Bắt mọi lỗi chưa xử lý (crash handler) -> 500.html cho web, JSON cho API.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Server] Unhandled error:', err && err.message);
  const status = err && err.status ? err.status : 500;
  const page = status === 400 ? '400.html' : status === 401 ? '401.html' : '500.html';
  sendError(req, res, status, page, (err && err.message) || 'Internal server error.');
});

// Start the HTTP server only when run directly (`node server.js` / `npm start`).
// Tests import the Express app via `module.exports` without binding a port.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server on port http://localhost:${PORT}`));
}

module.exports = app;