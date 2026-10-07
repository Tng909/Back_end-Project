require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const initUploadDirs = require('./config/initDirs');
const trackRoutes = require('./routes/track.route');
const authRoutes = require('./routes/auth.route');
const seedAdmin = require('./config/seedAdmin');
const { checkSmtpOnBoot } = require('./utils/sendEmail');
const app = express();

connectDB().then(() => seedAdmin());
initUploadDirs();

// Non-blocking: verifies SMTP, never crashes boot. Register/login work either way.
checkSmtpOnBoot().catch((err) => console.warn('[Mail] SMTP check error (non-fatal):', err.message));

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);

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

app.use(express.static(path.join(__dirname, 'main')));

app.get('/', (req, res) => {res.sendFile(path.join(__dirname, 'main', 'Main.html'));
});
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port http:localhost:${PORT}`));