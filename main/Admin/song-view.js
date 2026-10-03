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

function consumeFlash() {
  try {
    const msg = sessionStorage.getItem('admin:flash');
    if (!msg) return;
    const kind = sessionStorage.getItem('admin:flash-kind') || 'ok';
    sessionStorage.removeItem('admin:flash');
    sessionStorage.removeItem('admin:flash-kind');
    setTimeout(() => showToast(msg, kind, 6000), 60);
  } catch { /* ignore */ }
}

// Song detail page: GET /api/tracks/:id (public). Edit/Delete still need admin JWT.
const TRACKS_API = `${window.location.origin}/api/tracks`;
const songId = new URLSearchParams(window.location.search).get('id');
const $ = (x) => document.getElementById(x);

function fmtDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return '-';
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')} (${n}s)`;
}
function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? '-' : d.toLocaleString();
}

if (!songId) {
  $('songTitle').textContent = 'Missing song id';
  $('songSub').textContent = 'Open this page from the Songs table View button.';
} else {
  fetch(`${TRACKS_API}/${encodeURIComponent(songId)}`)
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Song not found (HTTP ${res.status}).`);
      return data;
    })
    .then((t) => {
      document.title = `${t.title || 'Song'} - music_Online Admin`;
      $('songTitle').textContent = t.title || '(untitled)';
      $('songSub').textContent = t.artist ? `by ${t.artist}` : '';
      $('f-title').textContent = t.title || '-';
      $('f-artist').textContent = t.artist || '-';
      $('f-album').textContent = t.album || '-';
      $('f-genre').textContent = t.genre || '-';
      $('f-duration').textContent = fmtDuration(t.durationSec);
      $('f-audioUrl').textContent = t.audioUrl || '-';
      $('f-coverUrl').textContent = t.coverArtUrl || '-';
      $('f-id').textContent = t._id || songId;
      $('f-created').textContent = fmtDate(t.createdAt);
      $('f-updated').textContent = fmtDate(t.updatedAt);
      if (t.coverArtUrl) $('songCover').src = t.coverArtUrl;
      if (t.audioUrl) $('songAudio').src = t.audioUrl;
      // Toast set by song-edit.js after a successful save (was a tiny sub-line).
      consumeFlash();
      $('editLink').href = `song-edit.html?id=${encodeURIComponent(t._id)}`;
      $('deleteLink').href = `song-delete.html?id=${encodeURIComponent(t._id)}`;
    })
    .catch((err) => {
      $('songTitle').textContent = 'Could not load song';
      $('songSub').textContent = String(err.message || err);
    });
}
