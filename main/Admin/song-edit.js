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

// Song edit page: loads GET /api/tracks/:id, saves with PUT (admin JWT).
const TRACKS_API = `${window.location.origin}/api/tracks`;
const songId = new URLSearchParams(window.location.search).get('id');
const $ = (x) => document.getElementById(x);

function authHeaders(isJson = true) {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '../verify/login.html'; throw new Error('Not logged in.'); }
  const h = { Authorization: `Bearer ${token}` };
  if (isJson) h['Content-Type'] = 'application/json';
  return h;
}
function setMsg(msg, ok = false) {
  $('editMsg').textContent = msg || '';
  $('editMsg').style.color = msg ? (ok ? '#1db954' : '#ff5a7d') : '';
}

if (!songId) {
  $('editSub').textContent = 'Missing song id. Open this page from the Songs table Edit button.';
  $('saveBtn').disabled = true;
} else {
  $('backBtn').href = `song-view.html?id=${encodeURIComponent(songId)}`;
  $('cancelBtn').href = `song-view.html?id=${encodeURIComponent(songId)}`;
  fetch(`${TRACKS_API}/${encodeURIComponent(songId)}`)
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Song not found (HTTP ${res.status}).`);
      return data;
    })
    .then((t) => {
      document.title = `Edit ${t.title || 'song'} - music_Online Admin`;
      $('editSub').textContent = `Editing "${t.title || songId}" — save to update.`;
      $('s-title').value = t.title || '';
      $('s-artist').value = t.artist || '';
      $('s-album').value = t.album || '';
      $('s-genre').value = t.genre || '';
      $('s-producer').value = t.producer || '';
      $('s-lyrics').value = t.lyrics || '';
      $('s-audioUrl').value = t.audioUrl || '';
      $('s-coverUrl').value = t.coverArtUrl || '';
      $('s-duration').value = t.durationSec ?? '';
    })
    .catch((err) => {
      $('editSub').textContent = String(err.message || err);
      $('saveBtn').disabled = true;
    });

  $('songEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const audioFile = $('s-audio').files[0];
    const coverFile = $('s-cover').files[0];
    try {
      $('saveBtn').disabled = true;
      $('saveBtn').textContent = 'Saving...';
      let res;
      if (audioFile || coverFile) {
        const fd = new FormData();
        fd.append('title', $('s-title').value.trim());
        fd.append('artist', $('s-artist').value.trim());
        fd.append('album', $('s-album').value.trim());
        fd.append('genre', $('s-genre').value.trim());
        fd.append('producer', $('s-producer').value.trim());
        fd.append('lyrics', $('s-lyrics').value.trim());
        const dur = $('s-duration').value;
        if (dur) fd.append('durationSec', dur);
        if (audioFile) fd.append('audio', audioFile);
        if (coverFile) fd.append('cover', coverFile);
        const aUrl = $('s-audioUrl').value.trim();
        const cUrl = $('s-coverUrl').value.trim();
        if (aUrl && !audioFile) fd.append('audioUrl', aUrl);
        if (cUrl && !coverFile) fd.append('coverArtUrl', cUrl);
        res = await fetch(`${TRACKS_API}/${encodeURIComponent(songId)}`, {
          method: 'PUT', headers: authHeaders(false), body: fd
        });
      } else {
        res = await fetch(`${TRACKS_API}/${encodeURIComponent(songId)}`, {
          method: 'PUT',
          headers: authHeaders(true),
          body: JSON.stringify({
            title: $('s-title').value.trim(),
            artist: $('s-artist').value.trim(),
            album: $('s-album').value.trim(),
            genre: $('s-genre').value.trim(),
            producer: $('s-producer').value.trim(),
            lyrics: $('s-lyrics').value.trim(),
            audioUrl: $('s-audioUrl').value.trim(),
            coverArtUrl: $('s-coverUrl').value.trim(),
            durationSec: Number($('s-duration').value) || undefined
          })
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setFlash(`Song "${data.title || songId}" đã được chỉnh sửa.`, 'ok');
      window.location.href = `song-view.html?id=${encodeURIComponent(songId)}`;
    } catch (err) {
      showToast(err.message, 'err', 6000);
      setMsg(err.message, false);
    } finally {
      $('saveBtn').disabled = false;
      $('saveBtn').textContent = 'Save changes';
    }
  });
}
