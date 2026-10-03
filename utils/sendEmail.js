const nodemailer = require('nodemailer');

// Sender config from env (MAIL_* or SMTP_*). Missing/wrong creds must NEVER
// crash boot or block register/login — sendWelcomeEmail() only warns + skips.
function resolveMailConfig() {
  const provider = String(
    process.env.MAIL_PROVIDER || process.env.SMTP_PROVIDER || ''
  ).trim().toLowerCase();
  const user = (process.env.MAIL_USER || process.env.SMTP_USER || '').trim();
  const rawPass = (process.env.MAIL_PASS || process.env.SMTP_PASS || '').trim();
  const from = (process.env.MAIL_FROM || process.env.SMTP_FROM || user).trim();
  const hostEnv = (process.env.MAIL_HOST || process.env.SMTP_HOST || '').trim();
  const portEnv = Number(process.env.MAIL_PORT || process.env.SMTP_PORT) || 0;
  const secureEnv = String(process.env.MAIL_SECURE ?? process.env.SMTP_SECURE ?? '').toLowerCase();

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

  // Gmail app passwords are shown with spaces — strip them.
  const pass = ['gmail', 'google'].includes(effectiveProvider)
    ? rawPass.replace(/\s+/g, '')
    : rawPass;

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
async function checkSmtpOnBoot() {
  const cfg = resolveMailConfig();
  if (!cfg.configured) {
    console.log('[Mail] Skipped — MAIL_USER/MAIL_PASS not set. Register/login still work; no email will be sent.');
    return { ready: false, reason: 'not-configured' };
  }
  try {
    await buildTransporter().verify();
    console.log(`[Mail] SMTP ready (provider=${cfg.provider}, as=${cfg.from}).`);
    return { ready: true };
  } catch (err) {
    console.warn('[Mail] SMTP verify failed — continuing WITHOUT email. Register/login unaffected. Reason:', err.message);
    if (cfg.provider === 'gmail' || cfg.provider === 'google') {
      console.warn('[Mail] Gmail fix: Google Account > Security > 2-Step Verification ON > App passwords > create one > paste as MAIL_PASS (not your login password).');
    }
    return { ready: false, reason: err.message };
  }
}
checkSmtpOnBoot().catch((err) => console.warn('[Mail] SMTP check error (non-fatal):', err.message));

// Best-effort welcome email to the address the USER typed at register.
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
    const fromAddr = cfg.from || cfg.user;
    const info = await buildTransporter().sendMail({
      from: `"${appName}" <${fromAddr}>`,
      to,
      subject: `Welcome to ${appName} — your account is ready`,
      text: `Hello,\n\nYour ${appName} account (${to}) was created and you can log in right away. Optional confirm link: ${verifyUrl} If you did not create this account, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px"><h2 style="color:#1ed760">Welcome</h2><p>Your account <b>${to}</b> is ready — <b>log in right away</b>.</p><p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#1ed760;color:#000;text-decoration:none;border-radius:6px;font-weight:bold">Confirm email (optional)</a></p></div>`
    });
    console.log(`[Mail] Welcome email sent to ${to} via ${cfg.provider} (id=${info.messageId || 'n/a'}).`);
    return { sent: true, messageId: info.messageId, provider: cfg.provider };
  } catch (err) {
    console.warn(`[Mail] Could not send to ${to} via ${cfg.provider} (non-fatal, account already created):`, err.message);
    console.log(`[Mail] Verify link fallback for ${to}: ${verifyUrl}`);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendWelcomeEmail, buildTransporter, resolveMailConfig, checkSmtpOnBoot };
