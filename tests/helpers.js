const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server'); // connects to the test DB on require
const User = require('../models/user');
const { loadKeys } = require('../config/jwtKeys');

const api = () => request(app);

let seq = 0;
function uniqueUser(prefix = 'user') {
  seq += 1;
  const n = `${prefix}${seq}_${Date.now()}`;
  return {
    fullName: 'Test Person',
    username: n,
    email: `${n}@test.local`,
    password: 'Passw0rd!test',
    confirmPassword: 'Passw0rd!test',
    phoneNumber: '0900000000'
  };
}

// Register + click-the-email-button (signed RS256 token, like the real flow) + login.
async function registerAndLogin(prefix) {
  const creds = uniqueUser(prefix);
  const reg = await api().post('/api/auth/register').send(creds);
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const { privateKey } = loadKeys();
  const token = jwt.sign(
    { email: creds.email, type: 'email-verification' },
    privateKey,
    { algorithm: 'RS256', expiresIn: '5m' }
  );
  const conf = await api().post('/api/auth/confirm-email').send({ token });
  if (conf.status !== 200) throw new Error(`confirm failed: ${conf.status} ${JSON.stringify(conf.body)}`);
  const log = await login(creds.username, creds.password);
  if (log.status !== 200) throw new Error(`login failed: ${log.status} ${JSON.stringify(log.body)}`);
  return { creds, token: log.body.token, user: log.body.user };
}

async function login(identifier, password) {
  return api().post('/api/auth/login').send({ identifier, password });
}

// Admin created directly in the DB (role is deliberately NOT settable via the
// public register endpoint), then logged in through the real login endpoint.
async function createAdmin(prefix = 'admin') {
  const a = uniqueUser(prefix);
  const salt = await bcrypt.genSalt(10);
  await User.create({
    fullName: a.fullName,
    username: a.username,
    email: a.email,
    password: await bcrypt.hash(a.password, salt),
    phoneNumber: a.phoneNumber,
    role: 'admin',
    isVerified: true,
    isEmailConfirmed: true
  });
  const log = await login(a.username, a.password);
  if (log.status !== 200) throw new Error(`admin login failed: ${log.status} ${JSON.stringify(log.body)}`);
  return { creds: a, token: log.body.token, user: log.body.user };
}

// Wait until the connection opened by server.js is actually established.
async function waitForDb(mongoose) {
  for (let i = 0; i < 100 && mongoose.connection.readyState !== 1; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (mongoose.connection.readyState !== 1) throw new Error('MongoDB not connected (is mongod running?).');
}

module.exports = { api, uniqueUser, registerAndLogin, login, createAdmin, waitForDb };
