(async function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.replace('../verify/login.html?message=' + encodeURIComponent('Please log in with an admin account.'));
    return;
  }

  try {
    const response = await fetch('/api/auth/admin-check', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.replace('../verify/login.html?message=' + encodeURIComponent('Please log in with an admin account.'));
      return;
    }
    if (response.status === 403) {
      window.location.replace('../Main.html');
      return;
    }
    if (!response.ok) throw new Error(`Admin access check failed (HTTP ${response.status}).`);
    document.body.classList.add('admin-authorized');
  } catch (error) {
    console.error('Failed to verify admin access:', error);
    document.body.innerHTML = '<main role="alert" style="padding:2rem;font:16px sans-serif;color:#fff;background:#111;min-height:100vh">Unable to verify admin access. Please try again later.</main>';
    document.body.classList.add('admin-authorized');
  }
})();
