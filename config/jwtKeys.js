const fs = require('fs');
const path = require('path');

function normalizePem(v) {
  if (!v) return null;
  let s = String(v).trim();
  // allow base64 env
  if (!s.includes('BEGIN')) {
    try {
      const dec = Buffer.from(s, 'base64').toString('utf8');
      if (dec.includes('BEGIN')) return dec;
    } catch { /* ignore */ }
    return null;
  }
  // allow \n escaped in env
  if (s.includes('\\n')) s = s.replace(/\\n/g, '\n');
  return s;
}

function loadKeys() {
  const privPath = process.env.JWT_PRIVATE_PATH || path.join(__dirname, 'jwtPrivate.pem');
  const pubPath = process.env.JWT_PUBLIC_PATH || path.join(__dirname, 'jwtPublic.pem');

  let privateKey = normalizePem(process.env.JWT_PRIVATE_KEY);
  let publicKey = normalizePem(process.env.JWT_PUBLIC_KEY);

  if (!privateKey && fs.existsSync(privPath)) privateKey = fs.readFileSync(privPath, 'utf8');
  if (!publicKey && fs.existsSync(pubPath)) publicKey = fs.readFileSync(pubPath, 'utf8');

  return { privateKey, publicKey, privPath, pubPath };
}

module.exports = { loadKeys, normalizePem };
