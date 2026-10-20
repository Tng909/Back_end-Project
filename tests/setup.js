// Test environment — MUST run before any app module is required.
// jest.config.js loads this via setupFiles for every test file.
process.env.NODE_ENV = 'test';
// Isolated test database (never touches the real musicdb).
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/musicdb_test';
// Neutralize external services: no real emails, no Gemini calls.
// (Empty values are treated as "not configured" by utils/sendEmail.js and
// controllers/ai.controller.js, so the local fallback paths are used.)
process.env.MAIL_PROVIDER = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASS = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
process.env.GEMINI_API_KEY = '';
// Deterministic admin seeded by config/seedAdmin.js on connect.
process.env.ADMIN_EMAIL = 'admin.seed@test.local';
process.env.ADMIN_PASSWORD = 'SeedAdmin123!';
// Generous rate limits so the suite never trips the limiter.
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
