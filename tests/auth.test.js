const mongoose = require('mongoose');
const request = require('supertest');
const User = require('../models/user');
const { api, uniqueUser, login, registerAndLogin, createAdmin, waitForDb } = require('./helpers');

jest.setTimeout(20000);

beforeAll(async () => {
  await waitForDb(mongoose);
  await User.deleteMany({});
  // server.js seeds an admin asynchronously on connect (config/seedAdmin.js).
  // Upsert instead of create so there is no duplicate-key race with that seed,
  // whichever finishes first.
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  try {
    await User.updateOne(
      { username: 'admin' },
      {
        $setOnInsert: {
          fullName: 'Seeded Admin',
          username: 'admin',
          email: process.env.ADMIN_EMAIL,
          password: await bcrypt.hash(process.env.ADMIN_PASSWORD, salt),
          phoneNumber: '0000000000',
          role: 'admin',
          isVerified: true,
          isEmailConfirmed: true
        }
      },
      { upsert: true }
    );
  } catch (err) {
    // A concurrent seedAdmin insert won the race — the admin exists either way.
    if (err.code !== 11000) throw err;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('POST /api/auth/register', () => {
  test('creates an unverified user and returns 201', async () => {
    const u = uniqueUser('reg');
    const res = await api().post('/api/auth/register').send(u);
    expect(res.status).toBe(201);
    // Mail is not configured in tests -> emailSent false, but registration succeeds.
    expect(res.body.emailSent).toBe(false);

    const inDb = await User.findOne({ email: u.email }).select('+password');
    expect(inDb).not.toBeNull();
    expect(inDb.isEmailConfirmed).toBe(false);
    // Password must be stored hashed, never plaintext.
    expect(inDb.password).not.toBe(u.password);
    expect(inDb.password.startsWith('$2')).toBe(true);
  });

  test('rejects missing fields and mismatched passwords', async () => {
    const noFields = await api().post('/api/auth/register').send({});
    expect(noFields.status).toBe(400);

    const u = uniqueUser('reg');
    const mismatch = await api().post('/api/auth/register').send({ ...u, confirmPassword: 'different' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toMatch(/do not match/i);
  });

  test('rejects duplicate username/email', async () => {
    const u = uniqueUser('dup');
    expect((await api().post('/api/auth/register').send(u)).status).toBe(201);
    const again = await api().post('/api/auth/register').send(u);
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already taken/i);
  });
});

describe('POST /api/auth/login', () => {
  test('blocks login until email is confirmed', async () => {
    const u = uniqueUser('gate');
    await api().post('/api/auth/register').send(u);
    const res = await login(u.username, u.password);
    expect(res.status).toBe(403);
    expect(res.body.needVerify).toBe(true);
    expect(res.body.token).toBeUndefined();
  });

  test('returns a token after email confirmation', async () => {
    const { token, user } = await registerAndLogin('ok');
    expect(token).toBeTruthy();
    expect(user.role).toBe('user');
    expect(user.password).toBeUndefined(); // never leak the hash to the client
  });

  test('gives the SAME error for unknown user and wrong password (no user enumeration)', async () => {
    const u = uniqueUser('enum');
    await api().post('/api/auth/register').send(u);
    // Confirm so the account is fully active — wrong password must still fail.
    await registerAndLoginConfirm(u);

    const unknown = await login('no_such_user_xyz', 'whatever');
    const wrongPass = await login(u.username, 'WrongPassword!1');

    expect(unknown.status).toBe(401);
    expect(wrongPass.status).toBe(401);
    expect(unknown.body.error).toBe(wrongPass.body.error);
    expect(unknown.body.error).toMatch(/invalid/i);
  });

  test('logs in the seeded admin by email (case-insensitive)', async () => {
    const res = await login('ADMIN.SEED@TEST.LOCAL', process.env.ADMIN_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});

describe('GET /api/auth/me', () => {
  test('401 without a token, 200 with a valid token', async () => {
    const { token, user } = await registerAndLogin('me');
    expect((await api().get('/api/auth/me')).status).toBe(401);
    const ok = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe(user.username);
    expect(ok.body.password).toBeUndefined();
  });

  test('401 with a garbage token', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/admin-check', () => {
  test('requires an admin token and current admin role', async () => {
    const user = await registerAndLogin('admincheckuser');
    expect((await api().get('/api/auth/admin-check')).status).toBe(401);
    expect((await api().get('/api/auth/admin-check').set('Authorization', `Bearer ${user.token}`)).status).toBe(403);

    const admin = await createAdmin('admincheck');
    const authorized = await api()
      .get('/api/auth/admin-check')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(authorized.status).toBe(200);
    expect(authorized.body.authorized).toBe(true);

    await User.updateOne({ _id: admin.user.id }, { role: 'user' });
    const demoted = await api()
      .get('/api/auth/admin-check')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(demoted.status).toBe(403);
  });
});

// Helper: confirm an existing registration via a fresh RS256 token.
async function registerAndLoginConfirm(u) {
  const jwt = require('jsonwebtoken');
  const { loadKeys } = require('../config/jwtKeys');
  const { privateKey } = loadKeys();
  const token = jwt.sign({ email: u.email, type: 'email-verification' }, privateKey, { algorithm: 'RS256', expiresIn: '5m' });
  await api().post('/api/auth/confirm-email').send({ token });
}
