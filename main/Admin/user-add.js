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

// Add-user page: creates with POST /api/auth/users (admin JWT).
const USERS_API = `${window.location.origin}/api/auth/users`;
const $ = (x) => document.getElementById(x);

function setMsg(msg, ok = false) {
  $('addMsg').textContent = msg || '';
  $('addMsg').style.color = msg ? (ok ? '#1db954' : '#ff5a7d') : '';
}

$('userAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '../verify/login.html'; return; }
  try {
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Adding...';
    const res = await fetch(USERS_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: $('u-name').value.trim(),
        username: $('u-user').value.trim(),
        phoneNumber: $('u-phone').value.trim(),
        email: $('u-mail').value.trim(),
        password: $('u-pass').value,
        role: $('u-role').value
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Add user failed.');
    setFlash(`User "@${data.username || ''}" đã được thêm.`, 'ok');
    try { sessionStorage.setItem('admin:flash-tab', 'users'); } catch { /* ignore */ }
    window.location.href = 'Admin_dashbroad.html#users';
  } catch (err) {
    setMsg(err.message, false);
  } finally {
    $('saveBtn').disabled = false;
    $('saveBtn').textContent = 'Add user';
  }
});
