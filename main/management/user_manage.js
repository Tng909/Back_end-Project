// Account Manager: view + edit profile (fullname, username, email, phonenumber)
const API_URL = `${window.location.origin}/api/auth`;
const alertBox = document.getElementById('alertBox');
const loadingBox = document.getElementById('loadingBox');
const profileForm = document.getElementById('profileForm');
const fullNameInput = document.getElementById('fullNameInput');
const usernameInput = document.getElementById('usernameInput');
const emailInput = document.getElementById('emailInput');
const phoneInput = document.getElementById('phoneInput');
const cancelBtn = document.getElementById('cancelBtn');
const submitBtn = document.getElementById('submitBtn');
const avatarCircle = document.getElementById('avatarCircle');

// Avatar viewer popup elements
const avatarModalEl = document.getElementById('avatarModal');
const avatarViewerCircle = document.getElementById('avatarViewerCircle');
const avatarViewerImg = document.getElementById('avatarViewerImg');
const avatarViewerHint = document.getElementById('avatarViewerHint');
const avatarFileInput = document.getElementById('avatarFileInput');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const avatarCancelBtn = document.getElementById('avatarCancelBtn');
const avatarConfirmBtn = document.getElementById('avatarConfirmBtn');

let original = null; // snapshot before user changes (Cancel restores this)
let avatarPreviewUrl = null;
let avatarPickedFile = null;

function showMsg(msg, ok = false) {
  if (!alertBox) return;
  alertBox.textContent = msg;
  alertBox.classList.remove('d-none', 'alert-danger', 'alert-success');
  alertBox.classList.add(ok ? 'alert-success' : 'alert-danger');
}

function hideMsg() {
  if (!alertBox) return;
  alertBox.classList.add('d-none');
}

function authHeaders(isJson = true) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../verify/login.html';
    throw new Error('Not logged in.');
  }
  const headers = { Authorization: `Bearer ${token}` };
  if (isJson) headers['Content-Type'] = 'application/json';
  return headers;
}

function currentValues() {
  return {
    fullName: fullNameInput.value.trim(),
    username: usernameInput.value.trim(),
    email: emailInput.value.trim(),
    phoneNumber: phoneInput.value.trim()
  };
}

function hasChanges() {
  if (!original) return false;
  const cur = currentValues();
  return (
    cur.fullName !== original.fullName ||
    cur.username !== original.username ||
    cur.email !== original.email ||
    cur.phoneNumber !== original.phoneNumber
  );
}

// Submit disabled until user changes something
function refreshSubmitState() {
  submitBtn.disabled = !hasChanges();
}

function fillForm(user) {
  original = {
    fullName: user.fullName || '',
    username: user.username || '',
    email: user.email || '',
    phoneNumber: user.phoneNumber || '',
    avatarUrl: user.avatarUrl || ''
  };
  fullNameInput.value = original.fullName;
  usernameInput.value = original.username;
  emailInput.value = original.email;
  phoneInput.value = original.phoneNumber;
  renderAvatarCircle();
  // keep localStorage user in sync (username + avatar shown in Main.html dropdown)
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...stored, ...original }));
  } catch { /* ignore */ }
  refreshSubmitState();
}

function avatarInitial() {
  return (original?.fullName || original?.username || '?').charAt(0).toUpperCase();
}

function renderAvatarCircle() {
  if (!avatarCircle) return;
  avatarCircle.innerHTML = '';
  if (original?.avatarUrl) {
    const img = document.createElement('img');
    img.src = original.avatarUrl;
    img.alt = 'Avatar';
    avatarCircle.appendChild(img);
  } else {
    avatarCircle.textContent = avatarInitial();
  }
}

async function loadProfile() {
  try {
    const res = await fetch(`${API_URL}/me`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load profile.');
    loadingBox.classList.add('d-none');
    profileForm.classList.remove('d-none');
    fillForm(data);
  } catch (err) {
    loadingBox.innerHTML = `<span class="small text-danger">${err.message} <a href="../verify/login.html" class="text-success">Login again</a></span>`;
  }
}

[fullNameInput, usernameInput, emailInput, phoneInput].forEach((el) =>
  el.addEventListener('input', () => {
    hideMsg();
    // inline email hint
    if (el === emailInput && el.value.trim() && !/^\S+@\S+\.\S+$/.test(el.value.trim())) {
      showMsg('Invalid email format. Example: name@example.com');
    }
    refreshSubmitState();
  })
);

// Cancel: restore previous values (before user change), disable submit again
cancelBtn.addEventListener('click', () => {
  if (!original) return;
  fullNameInput.value = original.fullName;
  usernameInput.value = original.username;
  emailInput.value = original.email;
  phoneInput.value = original.phoneNumber;
  hideMsg();
  refreshSubmitState();
});

// Submit: save changes, then show success popup
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!hasChanges()) return;
  const cur = currentValues();
  if (!cur.fullName || !cur.username || !cur.email || !cur.phoneNumber) {
    return showMsg('All fields are required.');
  }
  if (!/^\S+@\S+\.\S+$/.test(cur.email)) {
    return showMsg('Invalid email format. Example: name@example.com');
  }
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    const res = await fetch(`${API_URL}/me`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(cur)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed.');
    fillForm(data.user); // new snapshot = saved data
    hideMsg();
    const modal = new bootstrap.Modal(document.getElementById('successModal'));
    modal.show();
  } catch (err) {
    showMsg(err.message);
  } finally {
    submitBtn.textContent = 'Save Changes';
    refreshSubmitState();
  }
});

// ---- Avatar viewer popup (click header avatar -> transparent overlay viewer) ----
function getAvatarModal() {
  if (!avatarModalEl) return null;
  return bootstrap.Modal.getOrCreateInstance(avatarModalEl);
}

function showAvatarFallback() {
  if (!avatarViewerImg || !avatarViewerCircle) return;
  avatarViewerImg.classList.add('d-none');
  avatarViewerImg.removeAttribute('src');
  avatarViewerCircle.classList.remove('d-none');
  avatarViewerCircle.textContent = avatarInitial();
}

function showAvatarImage(src) {
  if (!avatarViewerImg || !avatarViewerCircle) return;
  avatarViewerCircle.classList.add('d-none');
  avatarViewerImg.classList.remove('d-none');
  avatarViewerImg.src = src;
}

function resetAvatarPicker() {
  if (avatarPreviewUrl) {
    URL.revokeObjectURL(avatarPreviewUrl);
    avatarPreviewUrl = null;
  }
  avatarPickedFile = null;
  if (avatarFileInput) avatarFileInput.value = '';
  if (avatarConfirmBtn) avatarConfirmBtn.disabled = true;
  if (avatarViewerHint) {
    avatarViewerHint.textContent = 'Click "Change avatar" to pick a picture from your device.';
    avatarViewerHint.classList.remove('text-danger');
    avatarViewerHint.classList.add('text-secondary');
  }
}

function openAvatarViewer() {
  if (!avatarModalEl) return;
  resetAvatarPicker();
  if (original?.avatarUrl) showAvatarImage(original.avatarUrl);
  else showAvatarFallback();
  avatarModalEl.addEventListener('shown.bs.modal', () => {
    document.querySelectorAll('.modal-backdrop').forEach((el) => {
      el.classList.add('avatar-transparent-backdrop');
    });
  }, { once: true });
  getAvatarModal()?.show();
}

if (avatarCircle) avatarCircle.addEventListener('click', openAvatarViewer);
if (changeAvatarBtn && avatarFileInput) {
  changeAvatarBtn.addEventListener('click', () => avatarFileInput.click());
}
if (avatarFileInput) {
  avatarFileInput.addEventListener('change', () => {
    const file = avatarFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      if (avatarViewerHint) {
        avatarViewerHint.textContent = 'Please choose an image file (PNG, JPG, ...).';
        avatarViewerHint.classList.remove('text-secondary');
        avatarViewerHint.classList.add('text-danger');
      }
      avatarFileInput.value = '';
      return;
    }
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    avatarPickedFile = file;
    avatarPreviewUrl = URL.createObjectURL(file);
    showAvatarImage(avatarPreviewUrl);
    if (avatarViewerHint) {
      avatarViewerHint.textContent = `Preview: ${file.name} — press Confirm to apply.`;
      avatarViewerHint.classList.remove('text-danger');
      avatarViewerHint.classList.add('text-secondary');
    }
    if (avatarConfirmBtn) avatarConfirmBtn.disabled = false;
  });
}

if (avatarCancelBtn) {
  avatarCancelBtn.addEventListener('click', () => {
    resetAvatarPicker();
    if (original?.avatarUrl) showAvatarImage(original.avatarUrl);
    else showAvatarFallback();
  });
}
if (avatarModalEl) {
  avatarModalEl.addEventListener('hidden.bs.modal', () => {
    resetAvatarPicker();
    if (original?.avatarUrl) showAvatarImage(original.avatarUrl);
    else showAvatarFallback();
  });
}
if (avatarConfirmBtn) {
  avatarConfirmBtn.addEventListener('click', async () => {
    if (!avatarPickedFile) return;
    avatarConfirmBtn.disabled = true;
    const prevLabel = avatarConfirmBtn.innerHTML;
    avatarConfirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Uploading...';
    try {
      const formData = new FormData();
      formData.append('avatar', avatarPickedFile);
      // NOTE: both /me and /me/avatar accept the avatar file.
      // /me/avatar needs a server restart after the new route was added;
      // try it first, fall back to /me for an already-running old server.
      let res = await fetch(`${API_URL}/me/avatar`, {
        method: 'PUT',
        headers: authHeaders(false),
        body: formData
      });
      if (res.status === 404) {
        res = await fetch(`${API_URL}/me`, {
          method: 'PUT',
          headers: authHeaders(false),
          body: formData
        });
      }
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 404 && (data.error || '').includes('API route not found')) {
          throw new Error('Server needs restart: stop it (Ctrl+C) and run "node server.js" again, then Confirm again.');
        }
        throw new Error(data.error || 'Avatar upload failed.');
      }
      fillForm(data.user);
      hideMsg();
      showMsg('Avatar updated successfully.', true);
      getAvatarModal()?.hide();
    } catch (err) {
      if (avatarViewerHint) {
        avatarViewerHint.textContent = err.message;
        avatarViewerHint.classList.remove('text-secondary');
        avatarViewerHint.classList.add('text-danger');
      }
    } finally {
      avatarConfirmBtn.innerHTML = prevLabel;
      avatarConfirmBtn.disabled = !avatarPickedFile;
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
        avatarPreviewUrl = null;
      }
    }
  });
}

loadProfile();
