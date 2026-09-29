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
    throw new Error(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 120)}... Is the backend running with the new OTP routes? Restart 'node server.js'.`);
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

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = data.user.role === 'admin' ? '../admin.html' : '../Main.html';
    } catch (err) {
      showError(err.message);
    }
  });
}

// 2. REGISTER with OTP (first-time): Send OTP -> Verify & Register
const regForm = document.getElementById('regForm');
if (regForm) {
  const otpSection = document.getElementById('otpSection');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const resendOtpBtn = document.getElementById('resendOtpBtn');

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
    // Client-side email format check with clear message (before hitting server)
    if (!/^\S+@\S+\.\S+$/.test(payload.email)) return showError('Invalid email format. Example: name@example.com');
    if (payload.password !== payload.confirmPassword) return showError('Passwords do not match.');
    try {
      sendOtpBtn.disabled = true;
      sendOtpBtn.textContent = 'Sending OTP...';
      const res = await fetch(`${API_URL}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
      otpSection.classList.remove('d-none');
      sendOtpBtn.textContent = 'OTP Sent - Check Email';
      alert('OTP sent to your email. Enter the 6-digit code to complete registration.');
    } catch (err) {
      showError(err.message);
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'Send OTP';
    }
  });

  if (resendOtpBtn) resendOtpBtn.addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_URL}/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('regEmail').value.trim() })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Resend failed');
      alert('New OTP sent.');
    } catch (err) { showError(err.message); }
  });

  if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', async () => {
    const payload = regPayload();
    const otp = document.getElementById('regOtp').value.trim();
    if (!/^\d{6}$/.test(otp)) return showError('Enter the 6-digit OTP code.');
    try {
      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = 'Verifying...';
      const res = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, otp })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        if (data.error && data.error.includes('already taken')) {
          alert('Email/Username already exists. Redirecting to home...');
          window.location.href = '../Main.html';
          return;
        }
        throw new Error(data.error || 'Register failed');
      }
      alert('Registration successful (email verified). Please login.');
      window.location.href = 'login.html';
    } catch (err) { showError(err.message); }
    finally { verifyOtpBtn.disabled = false; verifyOtpBtn.textContent = 'Verify & Register'; }
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
