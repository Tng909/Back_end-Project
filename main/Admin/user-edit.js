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

// User edit page: loads GET /api/auth/users/:id, saves with PUT (admin JWT).
const USERS_API = `${window.location.origin}/api/auth/users`;
const userId = new URLSearchParams(window.location.search).get('id');
const $ = (x) => document.getElementById(x);

function authHeaders() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '../verify/login.html'; throw new Error('Not logged in.'); }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
function setMsg(msg, ok = false) {
  $('editMsg').textContent = msg || '';
  $('editMsg').style.color = msg ? (ok ? '#1db954' : '#ff5a7d') : '';
}

if (!userId) {
  $('editSub').textContent = 'Missing user id. Open this page from the Users table Edit button.';
  $('saveBtn').disabled = true;
} else {
  $('backBtn').href = `user-view.html?id=${encodeURIComponent(userId)}`;
  $('cancelBtn').href = `user-view.html?id=${encodeURIComponent(userId)}`;
  fetch(`${USERS_API}/${encodeURIComponent(userId)}`, {
    headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `User not found (HTTP ${res.status}).`);
      return data;
    })
    .then((u) => {
      document.title = `Edit ${u.username || 'user'} - music_Online Admin`;
      $('editSub').textContent = `Editing "@${u.username || userId}" — save to update.`;
      $('u-name').value = u.fullName || '';
      $('u-user').value = u.username || '';
      $('u-phone').value = u.phoneNumber || '';
      $('u-mail').value = u.email || '';
      $('u-role').value = u.role || 'user';
    })
    .catch((err) => {
      if (String(err.message || '').includes('Not logged in')) return;
      $('editSub').textContent = String(err.message || err);
      $('saveBtn').disabled = true;
    });

  $('userEditForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      $('saveBtn').disabled = true;
      $('saveBtn').textContent = 'Saving...';
      const payload = {
        fullName: $('u-name').value.trim(),
        username: $('u-user').value.trim(),
        phoneNumber: $('u-phone').value.trim(),
        email: $('u-mail').value.trim(),
        role: $('u-role').value
      };
      const pw = $('u-pass').value;
      if (pw) payload.password = pw;
      const res = await fetch(`${USERS_API}/${encodeURIComponent(userId)}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setFlash(`User "@${data.username || userId}" đã được chỉnh sửa.`, 'ok');
      window.location.href = `user-view.html?id=${encodeURIComponent(userId)}`;
    } catch (err) {
      showToast(err.message, 'err', 6000);
      setMsg(err.message, false);
    } finally {
      $('saveBtn').disabled = false;
      $('saveBtn').textContent = 'Save changes';
    }
  });
}
