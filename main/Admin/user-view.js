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

// User detail page: GET /api/auth/users/:id (admin JWT required).
const USERS_API = `${window.location.origin}/api/auth/users`;
const userId = new URLSearchParams(window.location.search).get('id');
const $ = (x) => document.getElementById(x);

function authHeaders() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '../verify/login.html'; throw new Error('Not logged in.'); }
  return { Authorization: `Bearer ${token}` };
}
function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  return isNaN(d) ? '-' : d.toLocaleString();
}

if (!userId) {
  $('userTitle').textContent = 'Missing user id';
  $('userSub').textContent = 'Open this page from the Users table View button.';
} else {
  fetch(`${USERS_API}/${encodeURIComponent(userId)}`, { headers: authHeaders() })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `User not found (HTTP ${res.status}).`);
      return data;
    })
    .then((u) => {
      document.title = `${u.username || 'User'} - music_Online Admin`;
      $('userTitle').textContent = u.fullName || u.username || '(unknown)';
      $('userSub').textContent = u.username ? `@${u.username}` : '';
      $('f-name').textContent = u.fullName || '-';
      $('f-username').textContent = u.username ? `@${u.username}` : '-';
      $('f-email').textContent = u.email || '-';
      $('f-phone').textContent = u.phoneNumber || '-';
      $('f-role').textContent = u.role || '-';
      $('f-verified').textContent = u.isVerified ? 'yes' : 'no';
      $('f-confirmed').textContent = u.isEmailConfirmed ? 'yes' : 'no';
      $('f-id').textContent = u._id || userId;
      $('f-created').textContent = fmtDate(u.createdAt);
      $('f-updated').textContent = fmtDate(u.updatedAt);
      if (u.avatarUrl) $('userAvatar').src = u.avatarUrl;
      // Toast set by user-edit.js after a successful save (was a tiny sub-line).
      consumeFlash();
      $('editLink').href = `user-edit.html?id=${encodeURIComponent(u._id)}`;
      $('deleteLink').href = `user-delete.html?id=${encodeURIComponent(u._id)}`;
    })
    .catch((err) => {
      $('userTitle').textContent = 'Could not load user';
      $('userSub').textContent = String(err.message || err);
    });
}
