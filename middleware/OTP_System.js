const nodemailer = require('nodemailer');

// Transporter built lazily so missing env vars don't crash server start.
// Configure via .env: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
function buildTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  // Dev fallback: if no SMTP configured, use Ethereal-style stub that logs instead of sending.
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[OTP] SMTP not configured — OTP will be logged to console only.');
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE) === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

// In-memory store: email -> { code, expiresAt, attempts, pendingUser }
// pendingUser holds the register payload until OTP is verified (first-time register flow).
const otpStore = new Map();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

// Generate a 6-digit numeric OTP as string (100000–999999)
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOTPEmail(toEmail, code) {
  const transporter = buildTransporter();
  const subject = 'Your Spotify verification code';
  const text = `Your verification code is: ${code}\nIt expires in 5 minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
      <h2 style="color:#1ed760">Verify your email</h2>
      <p>Your 6-digit verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p>
      <p style="color:#888;font-size:13px">It expires in 5 minutes. If you did not request this, ignore this email.</p>
    </div>`;

  if (!transporter) {
    console.log(`[OTP] To: ${toEmail} | Code: ${code}`);
    return { delivered: false, previewCode: code };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject,
    text,
    html
  });
  return { delivered: true };
}

// Request OTP for a first-time registration: validate payload, stash it, email the code.
// Usage: router.post('/request-otp', requestOTP)
async function requestOTP(req, res) {
  try {
    let { fullName, username, email, password, confirmPassword, phoneNumber } = req.body || {};

    if (!fullName || !username || !email || !password || !confirmPassword || !phoneNumber) {
      return res.status(400).json({ error: 'All fields required.' });
    }
    // Normalize + validate email format explicitly (clear message instead of silent fail)
    email = String(email).trim().toLowerCase();
    username = String(username).trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format. Example: name@example.com' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // Fail fast on duplicate username/email BEFORE sending OTP
    try {
      const User = require('../models/user');
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        return res.status(400).json({ error: 'Username or Email already taken.' });
      }
    } catch (dbErr) {
      return res.status(500).json({ error: `Database unavailable: ${dbErr.message}` });
    }

    const code = generateOTP();
    otpStore.set(email, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
      pendingUser: { fullName, username, email, password, phoneNumber }
    });

    const result = await sendOTPEmail(email, code);
    res.json({
      message: 'OTP sent to email. Verify within 5 minutes.',
      // Only expose hint in dev when no SMTP is configured
      ...(result.delivered ? {} : { devPreview: 'Check server console for OTP (SMTP not configured).' })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Verify OTP: checks code + expiry, returns the pendingUser payload for the controller
// to create the account. Returns { ok, pendingUser, error, status }.
function verifyOTPCode(email, code) {
  if (!email || !code) return { ok: false, status: 400, error: 'Email and OTP code required.' };

  const record = otpStore.get(String(email).toLowerCase());
  if (!record) return { ok: false, status: 400, error: 'No OTP requested for this email. Register first.' };
  if (Date.now() > record.expiresAt) {
    otpStore.delete(String(email).toLowerCase());
    return { ok: false, status: 400, error: 'OTP expired. Please request a new code.' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(String(email).toLowerCase());
    return { ok: false, status: 429, error: 'Too many attempts. Please request a new code.' };
  }
  if (String(record.code) !== String(code).trim()) {
    record.attempts += 1;
    return { ok: false, status: 400, error: 'Invalid OTP code.' };
  }
  otpStore.delete(String(email).toLowerCase());
  return { ok: true, pendingUser: record.pendingUser };
}

// Express middleware: validates { email, otp } in body, attaches req.pendingUser.
// Usage: router.post('/verify-otp', verifyOTPMiddleware, authController.verifyAndRegister)
function verifyOTPMiddleware(req, res, next) {
  const { email, otp } = req.body;
  const result = verifyOTPCode(email, otp);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  req.pendingUser = result.pendingUser;
  next();
}

// Resend a fresh OTP (reuses stashed pendingUser if present)
async function resendOTP(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required.' });
    const record = otpStore.get(String(email).toLowerCase());
    if (!record?.pendingUser) {
      return res.status(400).json({ error: 'No pending registration. Register first.' });
    }
    const code = generateOTP();
    otpStore.set(String(email).toLowerCase(), {
      ...record,
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0
    });
    await sendOTPEmail(email, code);
    res.json({ message: 'New OTP sent to email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  generateOTP,
  sendOTPEmail,
  requestOTP,
  resendOTP,
  verifyOTPCode,
  verifyOTPMiddleware
};
