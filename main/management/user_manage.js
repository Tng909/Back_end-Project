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

let original = null; // snapshot before user changes (Cancel restores this)

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

function authHeaders() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../verify/login.html';
    throw new Error('Not logged in.');
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
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
    phoneNumber: user.phoneNumber || ''
  };
  fullNameInput.value = original.fullName;
  usernameInput.value = original.username;
  emailInput.value = original.email;
  phoneInput.value = original.phoneNumber;
  if (avatarCircle) {
    avatarCircle.textContent = (original.fullName || original.username || '?').charAt(0).toUpperCase();
  }
  // keep localStorage user in sync (username shown in Main.html dropdown)
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...stored, ...original }));
  } catch { /* ignore */ }
  refreshSubmitState();
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

loadProfile();
