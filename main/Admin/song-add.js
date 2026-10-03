// Shared toast notice (same look as the dashboard): floating top-center,
// auto-hide after a few seconds, with a dismiss button.
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
  el.innerHTML = `<span aria-hidden="true">${kind === 'err' ? '✕' : '✓'}</span><span></span><button class="x" type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('span:nth-child(2)').textContent = msg;
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  el.querySelector('.x').addEventListener('click', kill);
  stack.appendChild(el);
  setTimeout(kill, ms);
}

function setFlash(msg, kind = 'ok') {
  try {
    sessionStorage.setItem('admin:flash', msg);
    sessionStorage.setItem('admin:flash-kind', kind);
  } catch { /* ignore */ }
}

// Add-song page: creates with POST /api/tracks (admin JWT).
const TRACKS_API = `${window.location.origin}/api/tracks`;
const $ = (x) => document.getElementById(x);

function authHeaders(isJson = true) {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '../verify/login.html'; throw new Error('Not logged in.'); }
  const h = { Authorization: `Bearer ${token}` };
  if (isJson) h['Content-Type'] = 'application/json';
  return h;
}
function setMsg(msg, ok = false) {
  $('addMsg').textContent = msg || '';
  $('addMsg').style.color = msg ? (ok ? '#1db954' : '#ff5a7d') : '';
}
// Keep genre suggestions in sync with the DB (same source as the dashboard).
fetch(`${TRACKS_API}/genres`).then((r) => r.json()).then((data) => {
  if (!Array.isArray(data)) return;
  $('genreList').innerHTML = data.map((g) =>
    `<option value="${String(g).replace(/"/g, '&quot;')}"></option>`).join('');
}).catch(() => { /* keep static fallback options */ });

$('songAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const audioFile = $('s-audio').files[0];
  const coverFile = $('s-cover').files[0];
  try {
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Adding...';
    let res;
    if (audioFile || coverFile) {
      const fd = new FormData();
      fd.append('title', $('s-title').value.trim());
      fd.append('artist', $('s-artist').value.trim());
      fd.append('album', $('s-album').value.trim());
      fd.append('genre', $('s-genre').value.trim());
      const dur = $('s-duration').value;
      if (dur) fd.append('durationSec', dur);
      if (audioFile) fd.append('audio', audioFile);
      if (coverFile) fd.append('cover', coverFile);
      const aUrl = $('s-audioUrl').value.trim();
      const cUrl = $('s-coverUrl').value.trim();
      if (aUrl && !audioFile) fd.append('audioUrl', aUrl);
      if (cUrl && !coverFile) fd.append('coverArtUrl', cUrl);
      res = await fetch(TRACKS_API, { method: 'POST', headers: authHeaders(false), body: fd });
    } else {
      res = await fetch(TRACKS_API, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          title: $('s-title').value.trim(),
          artist: $('s-artist').value.trim(),
          album: $('s-album').value.trim(),
          genre: $('s-genre').value.trim(),
          audioUrl: $('s-audioUrl').value.trim(),
          coverArtUrl: $('s-coverUrl').value.trim(),
          durationSec: Number($('s-duration').value) || undefined
        })
      });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Add song failed.');
    setFlash(`Song "${data.title || ''}" đã được thêm.`, 'ok');
    try { sessionStorage.setItem('admin:flash-tab', 'songs'); } catch { /* ignore */ }
    window.location.href = 'Admin_dashbroad.html#songs';
  } catch (err) {
    setMsg(err.message, false);
  } finally {
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = 'Add song';
  }
});
