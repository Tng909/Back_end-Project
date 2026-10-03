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

// User delete confirm page: shows the user, deletes with DELETE (admin JWT).
const USERS_API = `${window.location.origin}/api/auth/users`;
const userId = new URLSearchParams(window.location.search).get('id');
const $ = (x) => document.getElementById(x);

function setMsg(msg) {
  $('delMsg').textContent = msg || '';
  $('delMsg').style.color = msg ? '#ff5a7d' : '';
}

if (!userId) {
  $('delName').textContent = 'Missing user id.';
  $('confirmDelBtn').disabled = true;
} else {
  $('backBtn').href = `user-view.html?id=${encodeURIComponent(userId)}`;
  $('cancelBtn').href = `user-view.html?id=${encodeURIComponent(userId)}`;
  let userName = userId;
  const token0 = localStorage.getItem('token');
  if (!token0) { window.location.href = '../verify/login.html'; }
  else {
    fetch(`${USERS_API}/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token0}` }
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `User not found (HTTP ${res.status}).`);
        return data;
      })
      .then((u) => {
        userName = u.username || userId;
        $('delName').textContent = `"${u.fullName || userName}" (@${userName})`;
        $('delSub').textContent = u.email || '';
      })
      .catch((err) => {
        setMsg(err.message);
        $('confirmDelBtn').disabled = true;
      });
  }

  $('confirmDelBtn').addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '../verify/login.html'; return; }
    try {
      $('confirmDelBtn').disabled = true;
      $('confirmDelBtn').textContent = 'Deleting...';
      const res = await fetch(`${USERS_API}/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setFlash(`User "@${userName}" đã được xóa.`, 'ok');
      try { sessionStorage.setItem('admin:flash-tab', 'users'); } catch { /* ignore */ }
      window.location.href = 'Admin_dashbroad.html#users';
    } catch (err) {
      showToast(err.message, 'err', 6000);
      setMsg(err.message);
      $('confirmDelBtn').disabled = false;
      $('confirmDelBtn').textContent = 'Yes, delete';
    }
  });
}
