// Shared toast notice: floating top-center banner, auto-hide, easy to see.
// Pages set sessionStorage 'admin:flash' (+ optional 'admin:flash-kind')
// before redirecting here; view pages set it before going to their target.
function showToast(msg, kind = 'ok', ms = 5000) {
  if (!msg) return;
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.prepend(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind === 'err' ? 'err' : 'ok'}`;
  el.setAttribute('role', 'status');
  const icon = kind === 'err' ? '✕' : '✓';
  el.innerHTML = `<span aria-hidden="true">${icon}</span><span></span><button class="x" type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('span:nth-child(2)').textContent = msg;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  el.querySelector('.x').addEventListener('click', kill);
  stack.appendChild(el);
  setTimeout(kill, ms);
}

function consumeFlash(defaultKind = 'ok') {
  try {
    const msg = sessionStorage.getItem('admin:flash');
    if (!msg) return;
    const kind = sessionStorage.getItem('admin:flash-kind') || defaultKind;
    sessionStorage.removeItem('admin:flash');
    sessionStorage.removeItem('admin:flash-kind');
    showToast(msg, kind);
  } catch { /* ignore */ }
}

function setFlash(msg, kind = 'ok') {
  try {
    sessionStorage.setItem('admin:flash', msg);
    sessionStorage.setItem('admin:flash-kind', kind);
  } catch { /* ignore */ }
}

// Admin dashboard: tables + filters. Add/Edit/Delete live on
// their own pages (song-add/edit/delete.html, user-add/edit/delete.html).
const TRACKS_API = `${window.location.origin}/api/tracks`;
const USERS_API = `${window.location.origin}/api/auth/users`;

const songsBody = document.getElementById('songsBody');
const usersBody = document.getElementById('usersBody');

let tracksCache = [];
let usersCache = [];

function adminHeaders(isJson = true) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../verify/login.html';
    throw new Error('Not logged in as admin.');
  }
  const headers = { Authorization: `Bearer ${token}` };
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (HTTP ${res.status}). Is 'node server.js' running?`);
  }
}

function setMsg(el, msg, isError = true) {
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = msg ? (isError ? '#ff5a7d' : '#1db954') : '';
}
// ---------- Songs table (same fields as config/seed.js) ----------
function songRow(t) {
  return `<tr>
    <td><img class="cov" src="${escapeHtml(t.coverArtUrl || '')}" alt=""></td>
    <td><div class="t">${escapeHtml(t.title)}</div><div class="m">${escapeHtml(t.artist)}</div></td>
    <td>${escapeHtml(t.album || '—')}</td>
    <td><span class="tag">${escapeHtml(t.genre || '—')}</span></td>
    <td><audio controls preload="none" src="${escapeHtml(t.audioUrl || '')}"></audio></td>
    <td><div class="acts">
      <a class="btn s" href="song-view.html?id=${t._id}">View</a>
      <a class="btn s" href="song-edit.html?id=${t._id}">Edit</a>
      <a class="btn s d" href="song-delete.html?id=${t._id}">Delete</a>
    </div></td>
  </tr>`;
}

async function loadSongs() {
  const genreEl = document.getElementById('songGenreFilter');
  const searchEl = document.getElementById('songSearchInput');
  const genre = genreEl ? genreEl.value : '';
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  try {
    // Server-side genre filter (matches GET /api/tracks?genre=...); the
    // dropdown options themselves come from GET /api/tracks/genres,
    // so the list always equals the genres actually in the DB.
    const url = genre ? `${TRACKS_API}?genre=${encodeURIComponent(genre)}` : TRACKS_API;
    const res = await fetch(url);
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load songs.');
    let list = Array.isArray(data) ? data : [];
    if (q) {
      list = list.filter((t) =>
        `${t.title || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase().includes(q)
      );
    }
    tracksCache = list;
    songsBody.innerHTML = tracksCache.length
      ? tracksCache.map(songRow).join('')
      : '<tr><td colspan="6" class="m">No tracks yet — run node config/seed.js or Add song.</td></tr>';
  } catch (err) {
    songsBody.innerHTML = `<tr><td colspan="6" class="m">${escapeHtml(err.message)}</td></tr>`;
  }
}

function openSongForm() {
  // Legacy hook: song add/edit now live on song-add.html / song-edit.html.
  window.location.href = 'song-add.html';
}

if (songsBody) {
  songsBody.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-del-song]');
    if (!delBtn) return;
    const delId = delBtn.dataset.delSong;
    window.location.href = `song-delete.html?id=${encodeURIComponent(delId)}`;
  });
}

// ---------- Users table (mirrors Users columns; shows seeded users) ----------
function userRow(u) {
  const adminTag = u.role === 'admin' ? ' <span class="tag">admin</span>' : '';
  return `<tr>
    <td class="t">${escapeHtml(u.fullName)}${adminTag}</td>
    <td>@${escapeHtml(u.username)}</td>
    <td>${escapeHtml(u.phoneNumber || '—')}</td>
    <td>${escapeHtml(u.email)}</td>
    <td class="m">••••••••</td>
    <td><div class="acts">
      <a class="btn s" href="user-view.html?id=${u._id}">View</a>
      <a class="btn s" href="user-edit.html?id=${u._id}">Edit</a>
      <a class="btn s d" href="user-delete.html?id=${u._id}">Delete</a>
    </div></td>
  </tr>`;
}

async function loadUsers() {
  // Same pattern as loadSongs(): fetch full list once, then apply the
  // role dropdown (server has no /users?role=...) + live text search
  // (fullName + username + email + phone) on the client.
  const roleEl = document.getElementById('userRoleFilter');
  const searchEl = document.getElementById('userSearchInput');
  const role = roleEl ? roleEl.value : '';
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  try {
    const res = await fetch(USERS_API, { headers: adminHeaders(true) });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load users.');
    let list = Array.isArray(data) ? data : [];
    if (role) {
      list = list.filter((u) => String(u.role || '').toLowerCase() === role.toLowerCase());
    }
    if (q) {
      list = list.filter((u) =>
        `${u.fullName || ''} ${u.username || ''} ${u.email || ''} ${u.phoneNumber || ''}`.toLowerCase().includes(q)
      );
    }
    usersCache = list;
    usersBody.innerHTML = usersCache.length
      ? usersCache.map(userRow).join('')
      : '<tr><td colspan="6" class="m">No users match — try another keyword or Add user.</td></tr>';
  } catch (err) {
    let msg = err.message;
    if (msg.includes('API route not found')) {
      msg = 'Backend is running old code (no GET /api/auth/users yet). Restart it: stop server (Ctrl+C / kill PID) then run "node server.js" in Online_music, and hard-refresh this page.';
    } else if (msg.includes('Admin role required')) {
      msg = 'Login as an admin account to manage users.';
    }
    usersBody.innerHTML = `<tr><td colspan="6" class="m">${escapeHtml(msg)}</td></tr>`;
  }
}

function openUserForm(user) {
  // Legacy hook: user add/edit now live on user-add.html / user-edit.html.
  if (user && user._id) window.location.href = `user-edit.html?id=${encodeURIComponent(user._id)}`;
  else window.location.href = 'user-add.html';
}

if (usersBody) {
  usersBody.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-del-user]');
    if (!delBtn) return;
    const delId = delBtn.dataset.delUser;
    window.location.href = `user-delete.html?id=${encodeURIComponent(delId)}`;
  });
}

// Genre filter dropdown: options built from distinct genres in the DB
// (config/seed.js seeds Pop, Anime, Soundtrack) — never a stale hardcoded list.
async function loadGenreFilter() {
  const genreEl = document.getElementById('songGenreFilter');
  if (!genreEl) return;
  try {
    const res = await fetch(`${TRACKS_API}/genres`);
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load genres.');
    const current = genreEl.value;
    genreEl.innerHTML = '<option value="">All genres</option>' +
      (Array.isArray(data) ? data : []).map((g) =>
        `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (current && data.includes(current)) genreEl.value = current;
  } catch (err) {
    genreEl.innerHTML = '<option value="">All genres</option>';
    console.warn('Genre filter fallback:', err.message);
  }
}

const songFilterBar = document.getElementById('songFilterBar');
if (songFilterBar) {
  songFilterBar.addEventListener('submit', (e) => {
    e.preventDefault();
    loadSongs();
  });
  songFilterBar.querySelector('#songGenreFilter')?.addEventListener('change', loadSongs);
  songFilterBar.querySelector('#songSearchInput')?.addEventListener('input', () => {
    clearTimeout(songFilterBar._t);
    songFilterBar._t = setTimeout(loadSongs, 250);
  });
}

// Same wiring as the Songs filter bar: submit button + role change reload,
// typing in the search box reloads with a 250ms debounce.
const userFilterBar = document.getElementById('userFilterBar');
if (userFilterBar) {
  userFilterBar.addEventListener('submit', (e) => {
    e.preventDefault();
    loadUsers();
  });
  userFilterBar.querySelector('#userRoleFilter')?.addEventListener('change', loadUsers);
  userFilterBar.querySelector('#userSearchInput')?.addEventListener('input', () => {
    clearTimeout(userFilterBar._t);
    userFilterBar._t = setTimeout(loadUsers, 250);
  });
}

// Keep the Add/Edit song genre datalist in sync with DB genres too
async function syncGenreDatalist() {
  const list = document.getElementById('genreList');
  if (!list) return;
  try {
    const res = await fetch(`${TRACKS_API}/genres`);
    const data = await readJson(res);
    if (!res.ok || !Array.isArray(data)) return;
    list.innerHTML = data.map((g) => `<option value="${escapeHtml(g)}"></option>`).join('');
  } catch { /* keep static fallback options */ }
}

async function initSongsSection() {
  await loadGenreFilter();
  await loadSongs();
  syncGenreDatalist();
}

initSongsSection();
loadUsers();

// Toast notice carried from add/edit/delete pages (also scrolls to the
// right tab so the result row is visible next to the toast).
(function showFlash() {
  try {
    const msg = sessionStorage.getItem('admin:flash');
    if (!msg) return;
    const kind = sessionStorage.getItem('admin:flash-kind') || 'ok';
    const tab = sessionStorage.getItem('admin:flash-tab');
    sessionStorage.removeItem('admin:flash');
    sessionStorage.removeItem('admin:flash-kind');
    sessionStorage.removeItem('admin:flash-tab');
    if (tab === 'songs' || tab === 'users') window.location.hash = tab;
    setTimeout(() => showToast(msg, kind, 6000), 60);
  } catch { /* ignore */ }
})();

// Legacy deep-link from detail pages (kept): song-view.html / user-view.html
// may store the id to edit in sessionStorage; open the NEW edit page instead.
(function openPendingEditFromDetail() {
  try {
    const songId = sessionStorage.getItem('admin:edit-song');
    if (songId) {
      sessionStorage.removeItem('admin:edit-song');
      window.location.href = `song-edit.html?id=${encodeURIComponent(songId)}`;
      return;
    }
    const userId = sessionStorage.getItem('admin:edit-user');
    if (userId) {
      sessionStorage.removeItem('admin:edit-user');
      window.location.href = `user-edit.html?id=${encodeURIComponent(userId)}`;
    }
  } catch { /* sessionStorage unavailable — ignore */ }
})();