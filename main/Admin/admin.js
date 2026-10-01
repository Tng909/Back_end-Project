// Admin dashboard: render real DB data (tracks from config/seed.js shape,
// users incl. config/seedUsers.js) + wire Add/Edit/Delete forms to the API.
const TRACKS_API = `${window.location.origin}/api/tracks`;
const USERS_API = `${window.location.origin}/api/auth/users`;

const songsBody = document.getElementById('songsBody');
const usersBody = document.getElementById('usersBody');
const songForm = document.getElementById('songForm');
const userForm = document.getElementById('userForm');
const songFormTitle = document.getElementById('songFormTitle');
const userFormTitle = document.getElementById('userFormTitle');
const songFormMsg = document.getElementById('songFormMsg');
const userFormMsg = document.getElementById('userFormMsg');

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
      <button class="btn s" type="button" data-edit-song="${t._id}">Edit</button>
      <button class="btn s d" type="button" data-del-song="${t._id}">Delete</button>
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

function openSongForm(track) {
  document.getElementById('s-id').value = track?._id || '';
  document.getElementById('s-title').value = track?.title || '';
  document.getElementById('s-artist').value = track?.artist || '';
  document.getElementById('s-album').value = track?.album || '';
  document.getElementById('s-genre').value = track?.genre || '';
  document.getElementById('s-audioUrl').value = track?.audioUrl || '';
  document.getElementById('s-coverUrl').value = track?.coverArtUrl || '';
  document.getElementById('s-duration').value = track?.durationSec ?? '';
  document.getElementById('s-audio').value = '';
  document.getElementById('s-cover').value = '';
  songFormTitle.textContent = track ? 'Edit song' : 'Add song';
  setMsg(songFormMsg, '');
  window.location.hash = 'song-form';
}

if (songForm) {
  songForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('s-id').value;
    const audioFile = songForm.querySelector('#s-audio').files[0];
    const coverFile = songForm.querySelector('#s-cover').files[0];
    try {
      let res;
      if (audioFile || coverFile) {
        const fd = new FormData();
        fd.append('title', document.getElementById('s-title').value.trim());
        fd.append('artist', document.getElementById('s-artist').value.trim());
        fd.append('album', document.getElementById('s-album').value.trim());
        fd.append('genre', document.getElementById('s-genre').value.trim());
        const dur = document.getElementById('s-duration').value;
        if (dur) fd.append('durationSec', dur);
        if (audioFile) fd.append('audio', audioFile);
        if (coverFile) fd.append('cover', coverFile);
        const aUrl = document.getElementById('s-audioUrl').value.trim();
        const cUrl = document.getElementById('s-coverUrl').value.trim();
        if (aUrl && !audioFile) fd.append('audioUrl', aUrl);
        if (cUrl && !coverFile) fd.append('coverArtUrl', cUrl);
        res = await fetch(id ? `${TRACKS_API}/${id}` : TRACKS_API, {
          method: id ? 'PUT' : 'POST',
          headers: adminHeaders(false),
          body: fd
        });
      } else {
        res = await fetch(id ? `${TRACKS_API}/${id}` : TRACKS_API, {
          method: id ? 'PUT' : 'POST',
          headers: adminHeaders(true),
          body: JSON.stringify({
            title: document.getElementById('s-title').value.trim(),
            artist: document.getElementById('s-artist').value.trim(),
            album: document.getElementById('s-album').value.trim(),
            genre: document.getElementById('s-genre').value.trim(),
            audioUrl: document.getElementById('s-audioUrl').value.trim(),
            coverArtUrl: document.getElementById('s-coverUrl').value.trim(),
            durationSec: Number(document.getElementById('s-duration').value) || undefined
          })
        });
      }
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Save song failed.');
      setMsg(songFormMsg, id ? 'Song updated.' : 'Song added.', false);
      await loadSongs();
      setTimeout(() => { window.location.hash = 'songs'; }, 600);
    } catch (err) {
      setMsg(songFormMsg, err.message, true);
    }
  });
}

if (songsBody) {
  songsBody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-song]');
    const delBtn = e.target.closest('[data-del-song]');
    if (editBtn) {
      openSongForm(tracksCache.find((t) => t._id === editBtn.dataset.editSong));
    } else if (delBtn) {
      const delId = delBtn.dataset.delSong;
      const t = tracksCache.find((x) => x._id === delId);
      if (!confirm(`Delete song "${t?.title || delId}"?`)) return;
      try {
        const res = await fetch(`${TRACKS_API}/${delId}`, {
          method: 'DELETE',
          headers: adminHeaders(true)
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || 'Delete failed.');
        await loadSongs();
      } catch (err) {
        alert(err.message);
      }
    }
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
      <button class="btn s" type="button" data-edit-user="${u._id}">Edit</button>
      <button class="btn s d" type="button" data-del-user="${u._id}">Delete</button>
    </div></td>
  </tr>`;
}

async function loadUsers() {
  try {
    const res = await fetch(USERS_API, { headers: adminHeaders(true) });
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load users.');
    usersCache = Array.isArray(data) ? data : [];
    usersBody.innerHTML = usersCache.length
      ? usersCache.map(userRow).join('')
      : '<tr><td colspan="6" class="m">No users yet.</td></tr>';
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
  document.getElementById('u-id').value = user?._id || '';
  document.getElementById('u-name').value = user?.fullName || '';
  document.getElementById('u-user').value = user?.username || '';
  document.getElementById('u-phone').value = user?.phoneNumber || '';
  document.getElementById('u-mail').value = user?.email || '';
  document.getElementById('u-pass').value = '';
  document.getElementById('u-pass').required = !user;
  document.getElementById('u-role').value = user?.role || 'user';
  userFormTitle.textContent = user ? 'Edit user' : 'Add user';
  setMsg(userFormMsg, '');
  window.location.hash = 'user-form';
}

if (userForm) {
  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('u-id').value;
    const payload = {
      fullName: document.getElementById('u-name').value.trim(),
      username: document.getElementById('u-user').value.trim(),
      phoneNumber: document.getElementById('u-phone').value.trim(),
      email: document.getElementById('u-mail').value.trim(),
      role: document.getElementById('u-role').value
    };
    const pw = document.getElementById('u-pass').value;
    if (pw) payload.password = pw;
    try {
      const res = await fetch(id ? `${USERS_API}/${id}` : USERS_API, {
        method: id ? 'PUT' : 'POST',
        headers: adminHeaders(true),
        body: JSON.stringify(payload)
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Save user failed.');
      setMsg(userFormMsg, id ? 'User updated.' : 'User added.', false);
      await loadUsers();
      setTimeout(() => { window.location.hash = 'users'; }, 600);
    } catch (err) {
      setMsg(userFormMsg, err.message, true);
    }
  });
}

if (usersBody) {
  usersBody.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-user]');
    const delBtn = e.target.closest('[data-del-user]');
    if (editBtn) {
      openUserForm(usersCache.find((u) => u._id === editBtn.dataset.editUser));
    } else if (delBtn) {
      const delId = delBtn.dataset.delUser;
      const u = usersCache.find((x) => x._id === delId);
      if (!confirm(`Delete user "${u?.username || delId}"?`)) return;
      try {
        const res = await fetch(`${USERS_API}/${delId}`, {
          method: 'DELETE',
          headers: adminHeaders(true)
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || 'Delete failed.');
        await loadUsers();
      } catch (err) {
        alert(err.message);
      }
    }
  });
}

document.querySelectorAll('a[href="#song-form"].btn.p').forEach((a) => {
  a.addEventListener('click', () => openSongForm(null));
});
document.querySelectorAll('a[href="#user-form"].btn.p').forEach((a) => {
  a.addEventListener('click', () => openUserForm(null));
});

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