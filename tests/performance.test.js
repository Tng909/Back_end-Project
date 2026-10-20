const mongoose = require('mongoose');
const { api, registerAndLogin, createAdmin, waitForDb } = require('./helpers');

jest.setTimeout(20000);

let adminToken;
let userToken;

beforeAll(async () => {
  await waitForDb(mongoose);
  adminToken = (await createAdmin('perfadmin')).token;
  userToken = (await registerAndLogin('perfuser')).token;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /health', () => {
  test('returns 200 with status ok while MongoDB is connected', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(typeof res.body.uptimeSec).toBe('number');
  });
});

describe('GET /api/metrics (admin only)', () => {
  test('401 without a token', async () => {
    const res = await api().get('/api/metrics');
    expect(res.status).toBe(401);
  });

  test('403 for a logged-in non-admin', async () => {
    const res = await api()
      .get('/api/metrics')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  test('200 for admin with the full metrics payload', async () => {
    const res = await api()
      .get('/api/metrics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Request counters + latency percentiles
    expect(res.body.requests.total).toBeGreaterThanOrEqual(1);
    expect(res.body.requests['2xx']).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.requests.avgMs).toBe('number');
    expect(typeof res.body.requests.p95Ms).toBe('number');

    // Memory + process info
    expect(res.body.memory.rssMB).toBeGreaterThan(0);
    expect(res.body.memory.heapUsedMB).toBeGreaterThan(0);
    expect(res.body.process.node).toMatch(/^v/);

    // Cache stats (enabled/disabled both fine, shape must exist)
    expect(typeof res.body.cache.backend).toBe('string');
    expect(typeof res.body.cache.hitRate).toBe('number');

    // DB section
    expect(res.body.db.state).toBe('connected');

    // Route table exists and includes this very request somewhere in the list
    expect(Array.isArray(res.body.topRoutes)).toBe(true);
    expect(res.body.topRoutes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.topRoutes.some((r) => r.route.includes('/api/metrics'))).toBe(true);
  });
});

describe('static asset cache headers', () => {
  test('HTML pages are served with Cache-Control: no-cache', async () => {
    const res = await api().get('/Main.html');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('non-HTML static assets get a short public cache', async () => {
    const res = await api().get('/Admin/admin.css');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
  });
});
