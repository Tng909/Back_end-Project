const API_URL = `${window.location.origin}/api/auth`;
const alertBox = document.getElementById('alertBox');
const noticeBox = document.getElementById('noticeBox');

function showError(msg) {
  if (!alertBox) return;
  alertBox.classList.remove('d-none', 'alert-success', 'alert-warning');
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
  alertBox.classList.remove('d-none', 'alert-danger', 'alert-warning');
  alertBox.classList.add('alert-success');
}

// Prominent info/notice banner (top of the card) used for guard messages such
// as "Please log in to access this page" passed via ?message=.
function showNotice(msg) {
  if (!noticeBox) { alert(msg); return; }
  noticeBox.innerHTML = msg;
  noticeBox.classList.remove('d-none');
}

// A banner letting an unconfirmed user request a fresh verification email
// without re-typing anything. `email` is the account address from the server.
function showResendNotice(message, email) {
  if (!noticeBox) return;
  noticeBox.innerHTML = `
    <div class="d-flex flex-column gap-2">
      <div><i class="fa-solid fa-envelope-circle-check me-2"></i>${message}</div>
      <div>
        <button type="button" id="resendNoticeBtn" class="btn btn-sm btn-info fw-semibold">
          <i class="fa-solid fa-paper-plane me-1"></i>Resend verification email
        </button>
        <span id="resendNoticeStatus" class="ms-2 small text-secondary"></span>
      </div>
    </div>`;
  noticeBox.classList.remove('d-none');
  const btn = document.getElementById('resendNoticeBtn');
  const status = document.getElementById('resendNoticeStatus');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (status) status.textContent = 'Sending…';
    try {
      const r = await fetch(`${API_URL}/resend-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const d = await parseJsonSafe(r);
      if (!r.ok) throw new Error(d.error || 'Resend failed.');
      if (status) status.textContent = d.message || 'Verification email sent. Check your inbox.';
    } catch (err) {
      if (status) status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

// 1. LOGIN
const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const loginId = document.getElementById('loginIdentifier');
    const params = new URLSearchParams(window.location.search);
    if (params.get('registered') === '1') {
      showOk('Verification email sent. Check your inbox and verify your account before logging in.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // Guard banner: protected pages redirect here with ?message=... so the user
    // sees a prominent "Please log in to access this page." notice up top.
    const guardMessage = params.get('message');
    if (guardMessage) {
      showNotice(guardMessage);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
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
        if (!res.ok) {
          // Unverified login: this account exists but the email was never
          // confirmed. Block access and surface a prominent banner that
          // explains why, plus a one-click resend to the same email.
          if (data.needVerify && data.email) {
            showResendNotice(
              '<b>Verify your email to finish setting up your account.</b> ' +
              'We sent a <b>Verify My Account</b> link to <b>' + data.email + '</b>. ' +
              'You must confirm it before you can log in. ' +
              'Didn\u2019t get it, or did the 20\u2011minute link expire? Resend it below.',
              data.email
            );
            return;
          }
          throw new Error(data.error || 'Login failed');
        }
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

// 2. REGISTER: create account + trigger RS256 "Verify My Account" email to form email.
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

  let awaitingVerificationEmail = false;
  function finishRegistration(message) {
    awaitingVerificationEmail = false;
    Array.from(regForm.elements).forEach((control) => { control.disabled = false; });
    regForm.reset();
    document.getElementById('resendBtn')?.classList.add('d-none');
    showOk(message);
    window.setTimeout(() => window.location.replace('login.html?registered=1'), 1200);
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
      if (data.emailSent === true) {
        finishRegistration(data.message || 'Registration successful. Verification email sent.');
        return;
      }
      showError((data.message || 'Registration successful, but the verification email was not sent.')
        + ' Your form details are kept here. Retry sending after email service is available.');
      // If mail failed (no SMTP), show resend so user can retry after sender is configured.
      const resendBtn = document.getElementById('resendBtn');
      if (resendBtn) {
        awaitingVerificationEmail = true;
        Array.from(regForm.elements).forEach((control) => {
          if (control !== resendBtn) control.disabled = true;
        });
        resendBtn.classList.remove('d-none');
        resendBtn.onclick = async () => {
          try {
            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending...';
            const r = await fetch(`${API_URL}/resend-verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: payload.email })
            });
            const d = await parseJsonSafe(r);
            if (!r.ok) throw new Error(d.error || 'Resend failed.');
            finishRegistration(d.message || 'Verification email sent.');
            resendBtn.classList.add('d-none');
          } catch (err) { showError(err.message); }
          finally {
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend verify email';
          }
        };
      }
    } catch (err) {
      showError(err.message);
    } finally {
      registerBtn.disabled = awaitingVerificationEmail;
      registerBtn.textContent = 'Register';
    }
  });
}

// 3. RESET PASSWORD (secure 2-step: request email link -> use token)
// Step A: no ?token= -> show the "send reset link" form.
// Step B: ?token= from the email link -> show the new-password form directly.
const forgotForm = document.getElementById('forgotForm');
const resetForm = document.getElementById('resetForm');
const urlToken = new URLSearchParams(window.location.search).get('token') || '';

if (forgotForm || resetForm) {
  if (urlToken) {
    // Arrived via emailed link — straight to setting the new password.
    if (forgotForm) forgotForm.classList.add('d-none');
    if (resetForm) {
      resetForm.classList.remove('d-none');
      document.getElementById('resetToken').value = urlToken;
      showNotice('Reset link verified in URL. Choose a new password (link expires in 15 minutes).');
    }
  } else if (forgotForm) {
    // No token yet — ask for the account email first.
    forgotForm.classList.remove('d-none');
    showNotice('Enter your account email and we\'ll send a reset link (valid for 15 minutes).');
  }

  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim();
    try {
      const r = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const d = await parseJsonSafe(r);
      if (!r.ok) throw new Error(d.error || 'Could not send reset link.');
      showOk(d.message || 'If this email exists, a reset link was sent.');
      // Dev mode: SMTP not configured -> server returns devToken/resetUrl.
      if (d.devToken && resetForm) {
        forgotForm.classList.add('d-none');
        resetForm.classList.remove('d-none');
        document.getElementById('resetToken').value = d.devToken;
        showOk('Email not configured — token auto-filled for development.');
      }
    } catch (err) {
      showError(err.message);
    }
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('resetToken').value.trim();
    const newPass = document.getElementById('resetPassword').value;
    const confirmPass = document.getElementById('resetConfirmPassword').value;

    if (!token) return showError('Reset token is required. Request a new link first.');
    if (newPass !== confirmPass) return showError('New passwords do not match.');
    if (newPass.length < 6) return showError('Password must be at least 6 characters.');

    try {
      const res = await fetch(`${API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newPass, confirmPassword: confirmPass })
      });

      const data = await parseJsonSafe(res);
      if (!res.ok) throw new Error(data.error || 'Reset failed');

      alert(data.message || 'Password updated successfully. Please login.');
      window.location.href = 'login.html';
    } catch (err) {
      showError(err.message);
    }
  });
}
