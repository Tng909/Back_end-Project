const API_URL = `${window.location.origin}/api/auth`;
const alertBox = document.getElementById('alertBox');

function showError(msg) {
  if (!alertBox) return;
  alertBox.classList.remove('d-none', 'alert-success');
  alertBox.classList.add('alert-danger');
  alertBox.textContent = msg;
}

// Safe JSON parse: if server returns HTML (proxy/404 page) show real status instead of crashing
async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 120)}... Is the backend running with the current API routes? Restart 'node server.js'.`);
  }
}

function showOk(msg) {
  if (!alertBox) { alert(msg); return; }
  alertBox.textContent = msg;
  alertBox.classList.remove('d-none', 'alert-danger');
  alertBox.classList.add('alert-success');
}

// 1. LOGIN
const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const loginId = document.getElementById('loginIdentifier');
    const verifyExistingSession = (async () => {
      const token = localStorage.getItem('token');
      if (!token) return false;

      try {
        const res = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if ([400, 401, 403, 404].includes(res.status)) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          return false;
        }

        const user = await parseJsonSafe(res);
        if (!res.ok) throw new Error(user.error || `Could not verify session (HTTP ${res.status}).`);
        if (!user.role || !user._id) throw new Error('Server returned an invalid user profile.');

        localStorage.setItem('user', JSON.stringify(user));
        window.location.replace(user.role === 'admin' ? '../Admin/Admin_dashbroad.html' : '../Main.html');
        return true;
      } catch (err) {
        showError(`Could not verify your current session: ${err.message}`);
        return false;
      }
    })();

    // Live hint: tell user whether input is detected as email or username
    const idHint = document.createElement('div');
    idHint.className = 'form-text text-secondary style-subtext';
    loginId.after(idHint);
    const updateHint = () => {
      const v = loginId.value.trim();
      if (!v) { idHint.textContent = ''; return; }
      idHint.textContent = /^\S+@\S+\.\S+$/.test(v)
        ? 'Detected as Email'
        : (v.includes('@') ? 'Looks like an email but invalid format (need name@domain.com)' : 'Detected as Username');
      idHint.classList.toggle('text-warning', v.includes('@') && !/^\S+@\S+\.\S+$/.test(v));
    };
    loginId.addEventListener('input', updateHint);

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = loginId.value.trim();
      if (!identifier) return showError('Enter username or email.');
      try {
        if (await verifyExistingSession) return;
        const res = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            password: document.getElementById('loginPassword').value
          })
        });
        const data = await parseJsonSafe(res);
        if (!res.ok) throw new Error(data.error || 'Login failed');
        if (!data.token || !data.user || !['user', 'admin'].includes(data.user.role)) {
          throw new Error('Server returned an invalid login response.');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.replace(data.user.role === 'admin' ? '../Admin/Admin_dashbroad.html' : '../Main.html');
      } catch (err) {
        showError(err.message);
    }
  });
}

// 2. REGISTER: create an active account (no email verification — SMTP removed).
const regForm = document.getElementById('regForm');
if (regForm) {
  function regPayload() {
    return {
      fullName: document.getElementById('regFullName').value.trim(),
      username: document.getElementById('regUsername').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      phoneNumber: document.getElementById('regPhone').value.trim(),
      password: document.getElementById('regPassword').value,
      confirmPassword: document.getElementById('regConfirmPassword').value
    };
  }

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = regPayload();
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) return showError('Invalid email format. Example: name@example.com');
    if (payload.password !== payload.confirmPassword) return showError('Passwords do not match.');
    const registerBtn = document.getElementById('registerBtn');
    try {
      registerBtn.disabled = true;
      registerBtn.textContent = 'Creating account...';
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Registration failed.');
      showOk(data.message || 'Registration successful. You can now log in.');
      regForm.reset();
    } catch (err) {
      showError(err.message);
    } finally {
      registerBtn.disabled = false;
      registerBtn.textContent = 'Register';
    }
  });
}

// 3. RESET PASSWORD
const resetForm = document.getElementById('resetForm');
if (resetForm) {
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('resetPassword').value;
    const confirmPass = document.getElementById('resetConfirmPassword').value;

    if (newPass !== confirmPass) {
      return showError('New passwords do not match.');
    }

    try {
      const res = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: document.getElementById('resetIdentifier').value,
          newPassword: newPass
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');

      alert('Password updated successfully. Please login.');
      window.location.href = 'login.html';
    } catch (err) {
      showError(err.message);
    }
  });
}
