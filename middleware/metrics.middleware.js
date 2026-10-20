// Lightweight in-process metrics: request counts, status buckets, avg response
// time over a rolling window, and a per-route top list. Feeds GET /api/metrics
// (admin) which the performance dashboard page renders. No external deps.
const START = Date.now();
const WINDOW = 200; // rolling response-time samples kept for avg/p95

const counters = {
  total: 0,
  '2xx': 0,
  '3xx': 0,
  '4xx': 0,
  '5xx': 0
};
const durations = []; // ms samples, newest last
const routes = new Map(); // "GET /api/tracks" -> { count, totalMs, errors }

function record(req, res, ms) {
  const status = res.statusCode;
  counters.total++;
  const bucket = status >= 500 ? '5xx' : status >= 400 ? '4xx' : status >= 300 ? '3xx' : '2xx';
  counters[bucket]++;

  durations.push(ms);
  if (durations.length > WINDOW) durations.shift();

  const key = `${req.method} ${req.baseUrl}${req.route?.path || req.path}`;
  const r = routes.get(key) || { count: 0, totalMs: 0, errors: 0 };
  r.count++;
  r.totalMs += ms;
  if (status >= 500) r.errors++;
  routes.set(key, r);
}

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    record(req, res, Number(process.hrtime.bigint() - start) / 1e6);
  });
  next();
}

function snapshot() {
  const sorted = [...durations].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);
  const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

  const topRoutes = [...routes.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([route, r]) => ({
      route,
      count: r.count,
      avgMs: Math.round((r.totalMs / r.count) * 10) / 10,
      errors: r.errors
    }));

  const mem = process.memoryUsage();
  return {
    uptimeSec: Math.round((Date.now() - START) / 1000),
    requests: {
      ...counters,
      avgMs: Math.round(avg * 10) / 10,
      p95Ms: Math.round(pct(95) * 10) / 10,
      inWindow: sorted.length
    },
    memory: {
      rssMB: Math.round(mem.rss / 1048576),
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576)
    },
    topRoutes
  };
}

module.exports = { metricsMiddleware, snapshot };
