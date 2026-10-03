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

// Song delete confirm page: shows the song, deletes with DELETE (admin JWT).
const TRACKS_API = `${window.location.origin}/api/tracks`;
const songId = new URLSearchParams(window.location.search).get('id');
const $ = (x) => document.getElementById(x);

function setMsg(msg) {
  $('delMsg').textContent = msg || '';
  $('delMsg').style.color = msg ? '#ff5a7d' : '';
}

if (!songId) {
  $('delName').textContent = 'Missing song id.';
  $('confirmDelBtn').disabled = true;
} else {
  $('backBtn').href = `song-view.html?id=${encodeURIComponent(songId)}`;
  $('cancelBtn').href = `song-view.html?id=${encodeURIComponent(songId)}`;
  let songTitle = songId;
  fetch(`${TRACKS_API}/${encodeURIComponent(songId)}`)
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Song not found (HTTP ${res.status}).`);
      return data;
    })
    .then((t) => {
      songTitle = t.title || songId;
      $('delName').textContent = `"${songTitle}"`;
      $('delSub').textContent = t.artist ? `by ${t.artist}` : '';
      if (t.coverArtUrl) $('delCover').src = t.coverArtUrl;
    })
    .catch((err) => {
      setMsg(err.message);
      $('confirmDelBtn').disabled = true;
    });

  $('confirmDelBtn').addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '../verify/login.html'; return; }
    try {
      $('confirmDelBtn').disabled = true;
      $('confirmDelBtn').textContent = 'Deleting...';
      const res = await fetch(`${TRACKS_API}/${encodeURIComponent(songId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setFlash(`Song "${songTitle}" đã được xóa.`, 'ok');
      try { sessionStorage.setItem('admin:flash-tab', 'songs'); } catch { /* ignore */ }
      window.location.href = 'Admin_dashbroad.html#songs';
    } catch (err) {
      showToast(err.message, 'err', 6000);
      setMsg(err.message);
      $('confirmDelBtn').disabled = false;
      $('confirmDelBtn').textContent = 'Yes, delete';
    }
  });
}
