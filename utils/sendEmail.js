// dotenv must load before reading MAIL_*/SMTP_* — server.js already calls
// config() first, but loading here too makes this module safe when required
// standalone (tests, scripts) and is a no-op when already loaded.
require('dotenv').config();
const nodemailer = require('nodemailer');

// Sender config from env (MAIL_* or SMTP_*). Missing/wrong creds must NEVER
// crash boot or block register/login — sendWelcomeEmail() only warns + skips.
function isPlaceholderValue(v) {
  const s = String(v || '').trim();
  if (!s) return true;
  const low = s.toLowerCase();
  // Obvious template text that is NOT a real DNS host / credential.
  const markers = [
    'the-provider', 'provider-host', 'your-',
    'your_', 'example.com', 'replace', 'xxxx', 'real-smtp',
    'sender-address', 'yourpassword', 'yourmail', 'changeme', 'placeholder'
  ];
  if (markers.some((m) => low.includes(m))) return true;
  // Hosts with spaces / quotes / apostrophes can never resolve (ENOTFOUND).
  // e.g. the-provider's-SMTP-host
  return /[\s'"`]/.test(s);
}

function isValidSmtpHost(host) {
  const h = String(host || '').trim();
  if (!h || isPlaceholderValue(h)) return false;
  if (h.toLowerCase() === 'localhost') return true;
  // Must look like a DNS name or IP: letters/digits/dots/hyphens + at least one dot,
  // or a plain IPv4 address. Anything else would just ENOTFOUND.
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) return true;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(h);
}

function resolveMailConfig() {
  const provider = String(
    process.env.MAIL_PROVIDER || process.env.SMTP_PROVIDER || ''
  ).trim().toLowerCase();
  const rawUser = (process.env.MAIL_USER || process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
  const rawPassRaw = (process.env.MAIL_PASS || process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
  const rawFrom = (process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.EMAIL_FROM || rawUser).trim();
  const rawHost = (process.env.MAIL_HOST || process.env.SMTP_HOST || '').trim();
  const portEnv = Number(process.env.MAIL_PORT || process.env.SMTP_PORT) || 0;
  const secureEnv = String(process.env.MAIL_SECURE ?? process.env.SMTP_SECURE ?? '').toLowerCase();

  // Treat template text as unset so boot logs "Skipped" instead of DNS ENOTFOUND.
  // e.g. MAIL_HOST=the-provider's-SMTP-host, MAIL_USER=your-...@gmail.com
  // Explicit guard: user/pass/host are sanitized via isPlaceholderValue() —
  // a single-word check like user.includes('placeholder') is NOT enough
  // (it misses 'your-', 'the-provider', 'yourmail', etc.) so keep full check.
  const user = isPlaceholderValue(rawUser) ? '' : rawUser;
  const from = isPlaceholderValue(rawFrom) ? user : rawFrom;
  const hostEnv = isValidSmtpHost(rawHost) ? rawHost : '';

  const presets = {
    gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
    google: { host: 'smtp.gmail.com', port: 587, secure: false },
    hotmail: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    outlook: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    live: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    office365: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    yahoo: { host: 'smtp.mail.yahoo.com', port: 587, secure: false }
  };

  let effectiveProvider = provider;
  if (!effectiveProvider && user.includes('@')) {
    const domain = user.split('@')[1].toLowerCase();
    if (domain === 'gmail.com' || domain === 'googlemail.com') effectiveProvider = 'gmail';
    else if (['hotmail.com', 'outlook.com', 'live.com'].includes(domain)) effectiveProvider = 'hotmail';
    else if (domain === 'yahoo.com') effectiveProvider = 'yahoo';
  }

  // Gmail app passwords are shown with spaces — strip them before placeholder validation.
  const normalizedPass = ['gmail', 'google'].includes(effectiveProvider)
    ? rawPassRaw.replace(/\s+/g, '')
    : rawPassRaw;
  const pass = isPlaceholderValue(normalizedPass) ? '' : normalizedPass;

  if (presets[effectiveProvider]) {
    const preset = presets[effectiveProvider];
    return {
      configured: Boolean(user && pass),
      provider: effectiveProvider || 'custom',
      host: hostEnv || preset.host,
      port: portEnv || preset.port,
      secure: secureEnv ? secureEnv === 'true' : preset.secure,
      user, pass, from
    };
  }

  const port = portEnv || 587;
  return {
    configured: Boolean(user && pass && hostEnv),
    provider: 'custom',
    host: hostEnv,
    port,
    secure: secureEnv ? secureEnv === 'true' : port === 465,
    user, pass, from
  };
}

function buildTransporter() {
  const cfg = resolveMailConfig();
  if (!cfg.configured) {
    const err = new Error('Email sender not configured. Set MAIL_USER + MAIL_PASS in .env (see .env.example).');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

// Non-blocking boot check: logs status, never throws (no more 535 crash).
// IMPORTANT: require()ing this module must NEVER open a network connection
// by itself — server.js calls checkSmtpOnBoot() explicitly. The direct call
// below is kept only for backward-compat when the module is the entry point.
async function checkSmtpOnBoot() {
  const cfg = resolveMailConfig();
  if (!cfg.configured) {
    console.log('[Mail] Skipped — sender not configured (or still placeholder). Register/login still work; no email will be sent.');
    return { ready: false, reason: 'not-configured' };
  }
  try {
    await buildTransporter().verify();
    console.log(`[Mail] SMTP ready (provider=${cfg.provider}, host=${cfg.host}:${cfg.port}, as=${cfg.from}).`);
    return { ready: true };
  } catch (err) {
    const msg = String(err && err.message || err);
    console.warn('[Mail] SMTP verify failed — continuing WITHOUT email. Register/login unaffected. Reason:', msg);
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) {
      console.warn(`[Mail] DNS fix: "${cfg.host}" did not resolve. For custom SMTP set a real host, e.g. MAIL_HOST=mail.yourdomain.com MAIL_PORT=587 MAIL_SECURE=false MAIL_USER=you@yourdomain.com MAIL_PASS=<smtp-password> MAIL_FROM=you@yourdomain.com`);
    } else if (cfg.provider === 'gmail' || cfg.provider === 'google') {
      console.warn('[Mail] Gmail fix: Google Account > Security > 2-Step Verification ON > App passwords > create one > paste as MAIL_PASS (not your login password).');
    } else if (/Invalid login|535|EAUTH/i.test(msg)) {
      console.warn('[Mail] Auth fix: SMTP rejected the username/password. Double-check MAIL_USER + MAIL_PASS (for custom hosts this is your mailbox password or provider API key, not a placeholder).');
    }
    return { ready: false, reason: msg };
  }
}
if (require.main === module) {
  checkSmtpOnBoot().catch((err) => console.warn('[Mail] SMTP check error (non-fatal):', err.message));
}

// Best-effort verification email to the address the USER typed at register.
// Sends your "Verify My Account" button (RS256 JWT link, 20m expiry).
// Returns { sent:true } or { sent:false, reason } — NEVER throws for SMTP errors.
async function sendWelcomeEmail(toEmail, verifyUrl) {
  const to = String(toEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(to)) return { sent: false, reason: 'Invalid recipient.' };
  const cfg = resolveMailConfig();
  if (!cfg.configured) {
    console.log(`[Mail] Skip send to ${to} — sender not configured. Link (dev fallback): ${verifyUrl}`);
    return { sent: false, reason: 'Email sender not configured.' };
  }
  try {
    const appName = process.env.APP_NAME || 'Online Music';
    const safeAppName = appName.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
    const safeVerifyUrl = verifyUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const fromAddr = cfg.from || cfg.user;
    const info = await buildTransporter().sendMail({
      from: `"${appName} Support" <${fromAddr}>`,
      to,
      subject: `Verify your email to activate your ${appName} account`,
      text: `Welcome to ${appName}!\n\nThank you for signing up. Verify your email to activate your account:\n${verifyUrl}\n\nThis registration link will expire in 20 minutes. If you did not request this email, please safely ignore it.`,
      html: `
      <!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:24px 12px;background-color:#eaf5ff;font-family:Arial,Helvetica,sans-serif;color:#263238;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;margin:0 auto;background-color:#dceeff;border-radius:18px;">
            <tr>
              <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;">
                  <tr>
                    <td align="center" style="padding:28px 24px 12px;">
                      <div style="font-size:22px;font-weight:bold;letter-spacing:-0.5px;color:#17251c;">
                        <span style="color:#1db954;">&#9835;</span> ${safeAppName}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 20px 20px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f7f5;border-radius:14px;">
                        <tr>
                          <td align="center" style="padding:30px 24px 10px;">
                            <div style="font-size:52px;line-height:1;color:#1db954;">&#9835;</div>
                            <h1 style="margin:20px 0 18px;font-size:24px;line-height:1.35;color:#31443a;">Your music journey starts here</h1>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 26px 28px;font-size:14px;line-height:1.65;color:#59665f;">
                            <p style="margin:0 0 14px;">Hi there,</p>
                            <p style="margin:0 0 14px;">Thanks for joining ${safeAppName}. You’re one step away from activating your account.</p>
                            <p style="margin:0 0 14px;">Confirm your email address to finish setting up your account and start enjoying your music.</p>
                            <p style="margin:0 0 22px;">This verification link expires in 20 minutes.</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                              <tr>
                                <td align="center" bgcolor="#1db954" style="border-radius:24px;">
                                  <a href="${safeVerifyUrl}" style="display:inline-block;padding:13px 26px;border:1px solid #1db954;border-radius:24px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Verify My Account</a>
                                </td>
                              </tr>
                            </table>
                            <p style="margin:24px 0 0;font-size:12px;color:#748078;">If the button doesn’t work, copy and paste this link into your browser:</p>
                            <p style="margin:6px 0 0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${safeVerifyUrl}" style="color:#16883e;">${safeVerifyUrl}</a></p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 26px;font-size:12px;line-height:1.6;color:#78827c;">
                      <p style="margin:0 0 12px;">Stay tuned,<br>The ${safeAppName} Team</p>
                      <p style="margin:0;text-align:center;">If you didn’t create this account, you can safely ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>`
    });
    console.log(`[Mail] Verification email sent to ${to} via ${cfg.provider} (id=${info.messageId || 'n/a'}).`);
    return { sent: true, messageId: info.messageId, provider: cfg.provider };
  } catch (err) {
    console.warn(`[Mail] Could not send to ${to} via ${cfg.provider} (non-fatal, account already created):`, err.message);
    console.log(`[Mail] Verify link fallback for ${to}: ${verifyUrl}`);
    return { sent: false, reason: err.message };
  }
}

async function sendResetEmail(toEmail, resetUrl) {
  const to = String(toEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(to)) return { sent: false, reason: 'Invalid recipient.' };
  const cfg = resolveMailConfig();
  if (!cfg.configured) {
    console.log(`[Mail] Skip reset send to ${to} — sender not configured. Link (dev fallback): ${resetUrl}`);
    return { sent: false, reason: 'Email sender not configured.' };
  }
  try {
    const appName = process.env.APP_NAME || 'Online Music';
    const fromAddr = cfg.from || cfg.user;
    const info = await buildTransporter().sendMail({
      from: `"${appName} Support" <${fromAddr}>`,
      to,
      subject: `Reset your ${appName} password`,
      text: `Reset your password:\n${resetUrl}\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.`,
      html: `<p>Reset your password (expires in 15 minutes):</p><p><a href="${resetUrl}">Reset Password</a></p><p>If the button doesn't work: ${resetUrl}</p>`
    });
    console.log(`[Mail] Reset email sent to ${to} (id=${info.messageId || 'n/a'}).`);
    return { sent: true, messageId: info.messageId, provider: cfg.provider };
  } catch (err) {
    console.warn(`[Mail] Could not send reset to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendTestEmail(toEmail) {
  const to = String(toEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(to)) {
    const err = new Error('Valid recipient email required.');
    err.code = 'INVALID_RECIPIENT';
    throw err;
  }

  const cfg = resolveMailConfig();
  const appName = process.env.APP_NAME || 'Online Music';
  const info = await buildTransporter().sendMail({
    from: `"${appName} Test" <${cfg.from || cfg.user}>`,
    to,
    subject: `${appName} SMTP test`,
    text: `This is a test email from ${appName}. Your SMTP configuration can send mail.`
  });

  console.log(`[Mail] SMTP test email sent to ${to} via ${cfg.provider} (id=${info.messageId || 'n/a'}).`);
  return { messageId: info.messageId, provider: cfg.provider };
}

module.exports = { sendWelcomeEmail, sendResetEmail, sendTestEmail, buildTransporter, resolveMailConfig, checkSmtpOnBoot, isPlaceholderValue, isValidSmtpHost };
