# 🎵 Online Music — Backend API

A full-stack **music streaming backend** built with **Node.js, Express, and MongoDB**.
It provides user authentication with email verification, a track library with search/pagination, user-owned playlists, admin management, file uploads, and an AI chat assistant — plus a bundled static frontend served by the same server.

---

## ✨ Features

| Area | What it does |
|------|--------------|
| **Auth** | Register, login (username *or* email), email verification via one-click link, forgot/reset password, profile + avatar update |
| **Tracks** | Public list with search, genre filter, sorting, optional pagination; admin create/edit/delete with audio + cover upload |
| **Playlists** | Create albums/playlists, add/remove tracks, owner-only mutations (admin bypass) |
| **Favorites** | Like/unlike tracks, per-user, duplicate-proof via a DB unique index |
| **History** | Auto-logged play history per user, newest first, auto-pruned to the last 50 plays |
| **Admin** | Full user management (list/create/edit/delete) guarded by role + optional password re-confirmation |
| **Uploads** | Multer disk storage for audio, covers, avatars — type-filtered, 15 MB cap |
| **AI chat** | "Boxie" assistant: Gemini API when a key is set, otherwise a 100% local fallback brain |
| **Email** | Nodemailer (Gmail/custom SMTP), graceful degradation — **register/login always work even if SMTP is misconfigured** |
| **Frontend** | Static HTML/CSS/JS app in `main/` served by Express (main player, admin dashboard, auth pages) |

---

## 🛡️ Security Highlights

- **bcrypt** password hashing (never stores plaintext)
- **RS256 JWT** (asymmetric): tokens are *signed with a private key* and *verified with a public key* — the private key never leaves the server and is **gitignored**
- **Email verification** with short-lived tokens (20 min) sent as a one-click link
- **Single-use password-reset tokens** — the token hash is stored, so each new request rotates it and old links die
- **Anti user-enumeration login** — identical `401` response and timing for "unknown user" vs "wrong password"
- **Role-based access control** — `verifyToken` / `verifyAdmin` / `verifyAdminPassword` middleware
- **Ownership checks** — users can only mutate their own playlists
- **Regex escaping** on all search inputs (no injection / ReDoS)
- **helmet** security headers, **CORS allow-list**, and **rate limiting** (stricter on `/api/auth`)
- **No secrets in git** — `.env` and `config/jwtPrivate.pem` are gitignored; only `.env.example` is committed

---

## 📁 Project Structure

```
├── server.js               # App entry: middleware, routes, error handling
├── config/
│   ├── db.js               # Mongoose connection
│   ├── jwtKeys.js          # Loads RS256 keys (env or PEM files)
│   ├── jwtPrivate.pem      # (gitignored) RSA private key
│   ├── jwtPublic.pem       # RSA public key (safe to commit)
│   ├── initDirs.js         # Creates uploads/ folders on boot
│   ├── seedAdmin.js        # Ensures an admin exists (runs on boot)
│   ├── seed.js / seedUsers.js / seedPlaylists.js   # Demo data
├── models/                 # Mongoose schemas: user, track, playlist
├── routes/                 # Express routers: auth, tracks, playlists, ai
├── controllers/            # Request handlers
├── middleware/             # auth (JWT/role) + upload (multer)
├── utils/sendEmail.js      # Nodemailer helpers + SMTP health check
├── main/                   # Static frontend (HTML/CSS/JS)
├── uploads/                # audio/, covers/, avatars/ (gitignored)
└── tests/                  # Jest + Supertest integration tests
```

---

## 🚀 Quick Start

**Prerequisites:** Node.js 18+, MongoDB running locally (or an Atlas URI).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#    then edit .env - at minimum set MONGO_URI and APP_URL.
#    Mail (MAIL_USER/MAIL_PASS) and GEMINI_API_KEY are OPTIONAL.

# 3. (Optional) generate RSA keys for RS256 if config/ has none:
openssl genrsa -out config/jwtPrivate.pem 2048
openssl rsa -in config/jwtPrivate.pem -pubout -out config/jwtPublic.pem

# 4. (Optional) seed demo data
npm run seed           # tracks
npm run seed:users     # demo users
npm run seed:playlists # demo playlists/albums

# 5. Run
npm start              # production
npm run dev            # development (nodemon auto-reload)
```

Open **http://localhost:3000** for the frontend, or hit the API directly.

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | no | Server port (default `3000`) |
| `MONGO_URI` | **yes** | MongoDB connection string |
| RSA keys in `config/` | **yes** | RS256 token signing (see Quick Start step 3) |
| `APP_URL` | yes | Base URL used in email links |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Seeded admin account |
| `MAIL_PROVIDER`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | no | SMTP sender (Gmail app password or custom host) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | no | AI chat (falls back to local brain if unset) |
| `CORS_ORIGIN` | no | Extra allowed browser origins (comma-separated) |
| `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | no | Requests per IP per 15 min (defaults 300 / 50) |

See [`.env.example`](.env.example) for the full annotated list.

---

## 🧪 Testing

```bash
npm test
```

Integration tests run with **Jest + Supertest** against an **isolated test database** (`musicdb_test`) - your real data is never touched. SMTP and Gemini are disabled during tests, so **no real emails are sent and no external API is called**. A local `mongod` must be running.

The suite covers:
- **Auth** - register -> email-confirm -> login flow, the verify-before-login gate, **anti-enumeration** (same 401 for unknown user vs wrong password), token-protected `/me`
- **Tracks** - public list/search/pagination, regex-safe search, admin-only create/update/delete
- **Playlists** - owner forced from JWT (spoof-proof), add/remove tracks, **403 for non-owners**

> **Note:** `package.json` pins `mongodb@7.5.0` via npm `overrides` to avoid a known mongodb-driver-7.6 + Jest handshake bug ([NODE-7832](https://jira.mongodb.org/browse/NODE-7832)). It does not affect the app itself - only Jest.

---

## 📡 API Reference

Base URL: `http://localhost:3000/api`
Protected routes expect `Authorization: Bearer <token>` (returned by login).

### Auth - `/api/auth`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/register` | public | Create account (sends verification email) |
| POST | `/login` | public | Login with `identifier` (username/email) + `password` |
| GET/POST | `/confirm-email` | public | Confirm email via `?token=` from the email link |
| POST | `/resend-verify` | public | Resend verification email |
| POST | `/forgot-password` | public | Request password-reset link |
| POST | `/reset-password` | public | Set new password with reset `token` |
| GET | `/me` | user | Get current profile |
| PUT | `/me` | user | Update profile / avatar (`multipart/form-data`) |
| GET | `/public-key` | public | Public key for external RS256 verification |
| GET | `/mail-status` | public | SMTP configuration status (no secrets) |
| GET | `/users` | admin | List all users |
| GET/PUT/DELETE | `/users/:id` | admin | Get / update / delete a user |
| POST | `/users` | admin | Create a user |
| POST | `/test-email` | admin | Send a test email |

### Tracks - `/api/tracks`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/` | public | List tracks (`?search=&genre=&artist=&sort=&page=&limit=`) |
| GET | `/genres` | public | Distinct genres in the library |
| GET | `/:id` | public | Get one track |
| POST | `/` | admin | Create track (multipart: `audio`, `cover`; or URL fields) |
| PUT | `/:id` | admin | Update track |
| DELETE | `/:id` | admin | Delete track |

### Playlists - `/api/playlists`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/` | public | List playlists (tracks + owner populated) |
| GET | `/:id` | public | Get one playlist |
| POST | `/` | user | Create playlist (owner = logged-in user) |
| PUT | `/:id` | owner/admin | Rename / edit description |
| POST | `/:id/tracks` | owner/admin | Add one or more tracks |
| DELETE | `/:id/tracks/:trackId` | owner/admin | Remove a track |
| DELETE | `/:id` | owner/admin | Delete playlist |

### AI - `/api/ai`
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/chat` | public | Chat with Boxie (`{ message, history }`) |
| GET | `/suggestions` | public | Quick suggestion chips |

---

## 🔧 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the server |
| `npm run dev` | Run with nodemon (auto-reload) |
| `npm test` | Run the Jest integration suite |
| `npm run seed` | Seed demo tracks |
| `npm run seed:users` | Seed demo users |
| `npm run seed:playlists` | Seed demo playlists |

---

---

## ⚡ Performance & Deployment

| Feature | How it's implemented |
|---------|---------------------|
| **Redis caching** | `services/cache.js` — hot public GETs (`/api/tracks`, `/genres`, `/api/playlists`) are cached 60–300s under `tracks:`/`playlists:` namespaces; any admin/owner write sweeps the namespace. Uses **Redis** when `REDIS_URL` is set (Render Key Value), otherwise an in-memory TTL map. Disabled automatically under `NODE_ENV=test`. Responses carry `X-Cache: HIT/MISS`. |
| **Load balancing** | **PM2 cluster mode** for VPS/self-hosting: `npm run start:cluster` (`ecosystem.config.js`, one worker per CPU core, round-robin). On Render, load balancing is built into the platform across scaled instances. |
| **Database optimization** | Indexes matching real query patterns: `track` (`createdAt`, `genre+createdAt`, `artist`, `title`), `playlist` (`createdAt`, `user+createdAt`), plus the existing unique/compound indexes on `favorite`/`history`/`user`. Mongoose pool tuned in `config/db.js` (`MONGO_MAX_POOL_SIZE`, default 20 instead of the driver's 100). |
| **CDN integration** | Set `CDN_BASE_URL` and `/uploads/...` requests are 302'd to the CDN origin. Static cache headers: uploads `immutable, max-age=1yr` (filenames are unique per upload), JS/CSS 1h, HTML `no-cache`. |
| **Auto scaling (Render)** | `render.yaml` Blueprint: web service + **Render Key Value** (Redis) with `scaling: { minInstances: 1, maxInstances: 3, targetCPUPercent: 70 }`, `healthCheckPath: /health` (returns 503 until Mongo is connected so the LB never routes to a cold instance). ⚠️ Note: autoscaling needs a paid Render plan, and a service with a `disk:` can't scale — move uploads to object storage (S3/R2) before raising `maxInstances` past 1 if you rely on local `uploads/`. |
| **Performance dashboard** | Admin-only `GET /api/metrics` (`middleware/metrics.middleware.js`: request/status counters, avg/p95 latency window, per-route stats, memory) rendered at **`/Admin/performance.html`** — stat cards, status doughnut, latency + memory line charts (Chart.js), top-routes table, 5s auto-refresh. Linked from the admin sidebar. |

**Fresh env vars** (see `.env.example`): `REDIS_URL`, `CACHE_TTL_SECONDS`, `CDN_BASE_URL`, `MONGO_MAX_POOL_SIZE`.

### Deploying to Render

1. Push this repo to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo (it picks up `render.yaml`).
3. In the service's **Environment** tab fill the `sync: false` secrets: `MONGO_URI`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, `ADMIN_PASSWORD`, `MAIL_*`, `GEMINI_API_KEY`, `APP_URL`.
4. Deploy — `/health` gates traffic, Redis caching activates via the injected `REDIS_URL`, and instances autoscale 1→3 on CPU.

---

## 📝 Notes & Assumptions

- Uploaded files are stored on **local disk** (`uploads/`) - fine for development; use cloud storage (S3/Cloudinary) for production.
- Email verification and password reset work without SMTP in **development** (the token is returned in the response / console) so the flow is always testable.
- The static frontend is served from `main/`; the API returns JSON for `/api/*` and HTML error pages for browser navigation.

## 📄 License

ISC - see [LICENSE](LICENSE).
