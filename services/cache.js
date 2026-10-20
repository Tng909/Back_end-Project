// Response cache: Redis (ioredis) when REDIS_URL is set, otherwise a small
// in-memory Map with TTL. Both share one API so routes never care which is on.
// Disabled entirely under NODE_ENV=test so the Jest suite always hits the DB.
//
// Keys are namespaced by prefix ("tracks:*", "playlists:*") so a write can
// invalidate everything in that group with one sweep (see invalidatePrefix).
const ENABLED = process.env.NODE_ENV !== 'test';
const DEFAULT_TTL = Number(process.env.CACHE_TTL_SECONDS) || 60;

// --- Redis (production on Render: REDIS_URL from the Key Value instance) ----
let redis = null;
if (ENABLED && process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1, // fail fast -> callers fall through to the DB
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000)
    });
    redis.on('error', (err) => {
      // Never crash the app because the cache is down — we just stop caching.
      console.warn('[Cache] Redis error (non-fatal):', err.message);
      redis = null;
    });
    redis.on('ready', () => console.log('[Cache] Redis connected'));
  } catch (err) {
    console.warn('[Cache] Redis unavailable, using in-memory cache:', err.message);
    redis = null;
  }
}

// --- In-memory fallback (dev / no REDIS_URL / Redis down) -------------------
const store = new Map(); // key -> { value, expiresAt }

function memGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt && hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

function memSet(key, value, ttl) {
  // Opportunistic sweep keeps the Map from growing without bound.
  if (store.size > 5000) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expiresAt && v.expiresAt <= now) store.delete(k);
  }
  store.set(key, { value, expiresAt: ttl ? Date.now() + ttl * 1000 : 0 });
}

// --- Stats for the performance dashboard ------------------------------------
const stats = { hits: 0, misses: 0, writes: 0, backend: 'memory' };
function backend() {
  if (!ENABLED) return 'disabled';
  if (redis) return 'redis';
  return 'memory';
}

// --- Public API --------------------------------------------------------------
async function get(key) {
  if (!ENABLED) return undefined;
  try {
    if (redis) {
      const raw = await redis.get(key);
      if (raw === null || raw === undefined) { stats.misses++; return undefined; }
      stats.hits++;
      return JSON.parse(raw);
    }
    const v = memGet(key);
    if (v === undefined) { stats.misses++; return undefined; }
    stats.hits++;
    return v;
  } catch {
    stats.misses++;
    return undefined;
  }
}

async function set(key, value, ttl = DEFAULT_TTL) {
  if (!ENABLED) return;
  stats.writes++;
  try {
    if (redis) {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
      return;
    }
    memSet(key, value, ttl);
  } catch (err) {
    console.warn('[Cache] set failed:', err.message);
  }
}

// Drop every key starting with `prefix` ("tracks:" matches "tracks:/api/tracks?...").
async function invalidatePrefix(prefix) {
  if (!ENABLED) return;
  try {
    if (redis) {
      const keys = await redis.keys(`${prefix}*`); // fine at this key count
      if (keys.length) await Promise.all(keys.map((k) => redis.del(k)));
      return;
    }
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  } catch (err) {
    console.warn('[Cache] invalidate failed:', err.message);
  }
}

// Express middleware for GET routes: serves the cached JSON when fresh and
// captures the handler's response otherwise. Only wraps 2xx JSON replies.
// Usage: router.get('/', cache('tracks'), controller)
function cache(namespace, ttl = DEFAULT_TTL) {
  return (req, res, next) => {
    if (!ENABLED || req.method !== 'GET') return next();
    const key = `${namespace}:${req.originalUrl}`;
    get(key).then((hit) => {
      if (hit !== undefined) {
        res.set('X-Cache', 'HIT');
        return res.json(hit);
      }
      res.set('X-Cache', 'MISS');
      const original = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300) set(key, body, ttl);
        return original(body);
      };
      next();
    }).catch(() => next());
  };
}

// Place BEFORE a mutation controller: once its response finishes successfully
// (< 400), the whole namespace is swept so no stale JSON survives the write.
// Controllers don't call next(), so this hooks res 'finish' instead of running
// after the handler.
// Usage: router.post('/', verifyAdmin, invalidateAfter('tracks'), controller)
function invalidateAfter(namespace) {
  return (req, res, next) => {
    if (!ENABLED) return next();
    res.on('finish', () => {
      if (res.statusCode < 400) invalidatePrefix(`${namespace}:`);
    });
    next();
  };
}

function getStats() {
  const total = stats.hits + stats.misses;
  return {
    enabled: ENABLED,
    backend: backend(),
    hits: stats.hits,
    misses: stats.misses,
    writes: stats.writes,
    hitRate: total ? Math.round((stats.hits / total) * 1000) / 10 : 0
  };
}

module.exports = { cache, invalidateAfter, get, set, invalidatePrefix, getStats, DEFAULT_TTL };
