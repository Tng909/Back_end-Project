const API_BASE = (window.location.origin && window.location.origin.indexOf('http') === 0)
  ? window.location.origin
  : 'http://localhost:3000';
const API_URL = `${API_BASE}/api/tracks`;

let tracks = [];
let currIdx = 0;
// Playback (audio element, player bar, seek/volume, shuffle/repeat) is owned
// by the shared player in player.js and exposed as window.MusicPlayer.

const trackGrid = document.getElementById('trackGrid');
const allTracksCount = document.getElementById('allTracksCount');
const allTracksEmpty = document.getElementById('allTracksEmpty');
const popularGrid = document.getElementById('popularGrid');
const recommendGrid = document.getElementById('recommendGrid');
const popularHint = document.getElementById('popularHint');
const recommendReason = document.getElementById('recommendReason');
const searchInput = document.getElementById('searchInput');
const searchContainer = document.querySelector('.search-container');
const searchDropdown = document.getElementById('searchDropdown');
const authControls = document.getElementById('authControls');
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenu = document.getElementById('mobileMenu');

function setMobileMenuOpen(open) {
  if (!mobileMenuToggle || !mobileMenu) return;
  mobileMenu.classList.toggle('d-none', !open);
  mobileMenuToggle.setAttribute('aria-expanded', String(open));
  mobileMenuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  const icon = mobileMenuToggle.querySelector('i');
  if (icon) icon.className = `fa-solid ${open ? 'fa-xmark' : 'fa-bars'}`;
}

mobileMenuToggle?.addEventListener('click', () => {
  setMobileMenuOpen(mobileMenuToggle.getAttribute('aria-expanded') !== 'true');
});

mobileMenu?.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMobileMenuOpen(false);
});

document.addEventListener('click', (event) => {
  if (mobileMenu && !mobileMenu.classList.contains('d-none')
    && !mobileMenu.contains(event.target) && !mobileMenuToggle?.contains(event.target)) {
    setMobileMenuOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setMobileMenuOpen(false);
});

function getStoredUser() {
  const user = localStorage.getItem('user');
  if (!user) return null;

  try {
    return JSON.parse(user);
  } catch (err) {
    console.error('Failed to read stored user:', err);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return null;
  }
}

function renderAuthControls() {
  if (!authControls) return;

  const user = getStoredUser();
  if (!user || !localStorage.getItem('token')) {
    authControls.innerHTML = `
      <a href="verify/register.html" class="btn btn-outline-light rounded-pill fw-semibold">Register</a>
      <a href="verify/login.html" class="btn btn-success rounded-pill fw-semibold">Login</a>
    `;
    syncMobileAuth(false);
    return;
  }

  const username = user.username || user.fullName || 'Account';
  const avatarUrl = user.avatarUrl || '';
  const initial = String(username).charAt(0).toUpperCase();
  const avatarHtml = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" class="user-menu-avatar" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="user-menu-fallback" style="display:none;">${escapeHtml(initial)}</span>`
    : `<span class="user-menu-fallback">${escapeHtml(initial)}</span>`;
  authControls.innerHTML = `
    <div class="dropdown">
      <button class="btn btn-success rounded-pill fw-semibold dropdown-toggle d-flex align-items-center gap-2" type="button"
        id="userMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        <span class="user-menu-avatar-wrap">${avatarHtml}</span>
        <span>${escapeHtml(username)}</span>
      </button>
      <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark" aria-labelledby="userMenuButton">
        <li><a class="dropdown-item" href="management/user_manage.html" id="accountManagerLink">Account Manager</a></li>
        ${user.role === 'admin' ? '<li><a class="dropdown-item" href="Admin/Admin_dashbroad.html" id="adminDashboardLink"><i class="fa-solid fa-shield-halved me-2"></i>Admin Dashboard</a></li>' : ''}
        <li><hr class="dropdown-divider"></li>
        <li><button class="dropdown-item" type="button" id="logoutButton">Logout</button></li>
      </ul>
    </div>
  `;

  document.getElementById('logoutButton').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    renderAuthControls();
  });
  syncMobileAuth(true);

  // Refresh avatar/username from server so a picture changed in
  // Account Manager shows up here even if localStorage is stale.
  refreshUserFromServer();
}

// Mirror desktop auth controls into the mobile top bar (visible <md).
function syncMobileAuth(isLoggedIn) {
  const slot = document.querySelector('.mobile-auth');
  if (!slot || !authControls) return;
  slot.innerHTML = authControls.innerHTML;
  slot.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  const logout = slot.querySelector('button.dropdown-item');
  if (isLoggedIn && logout) {
    logout.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      renderAuthControls();
    });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[character]));
}

// Pull latest profile (avatarUrl included) so Main page shows the
// picture right after it is changed in Account Manager.
async function refreshUserFromServer() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${window.location.origin}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const fresh = await res.json();
    const stored = getStoredUser() || {};
    const merged = {
      ...stored,
      fullName: fresh.fullName ?? stored.fullName,
      username: fresh.username ?? stored.username,
      email: fresh.email ?? stored.email,
      phoneNumber: fresh.phoneNumber ?? stored.phoneNumber,
      avatarUrl: fresh.avatarUrl ?? stored.avatarUrl ?? ''
    };
    localStorage.setItem('user', JSON.stringify(merged));
    // Re-render once if avatar/username changed
    const btn = document.getElementById('userMenuButton');
    const img = btn?.querySelector('.user-menu-avatar');
    if (merged.avatarUrl && (!img || img.getAttribute('src') !== merged.avatarUrl)) {
      renderAuthControls();
    }
  } catch { /* offline -> keep cached user */ }
}

async function fetchTracks() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`API ${res.status}`);
    tracks = await res.json();
    // All Tracks section = full seed.js data from DB (no slicing/limit)
    renderAllTracks(tracks);
    renderPopular();
    renderRecommended();
    // Load liked ids FIRST, then repaint hearts — avoids the race where
    // fetchLikeIds() fired on empty grids when called in parallel.
    await fetchLikeIds();
    refreshSections();
    if (tracks.length > 0 && window.MusicPlayer) window.MusicPlayer.setQueue(tracks, 0);
  } catch (err) {
    console.error('Failed to fetch tracks:', err);
    if (trackGrid) trackGrid.innerHTML = '';
    if (allTracksEmpty) allTracksEmpty.classList.remove('d-none');
  }
}

// All Tracks: render EVERY track from seed.js/DB 1:1 (title, artist, album, genre, cover, audio)
function renderAllTracks(list) {
  try { renderArtistDropdown(); } catch (e) { console.error(e); }
  if (allTracksCount) {
    allTracksCount.textContent = list.length ? `${list.length} songs from database` : '';
  }
  if (allTracksEmpty) {
    allTracksEmpty.classList.toggle('d-none', list.length > 0);
  }
  renderTracks(list, trackGrid);
}

// (legacy stub removed — canonical renderTracks is defined at bottom of file)

// ================= POPULAR ALGORITHM =================
// Score = playCount * 3 + searchCount * 1 + recencyBonus
// playCount/searchCount persisted in localStorage; recencyBonus
// rewards recently added tracks (createdAt) so new songs can surface.
const STATS_KEY = 'trackStats';
const HISTORY_KEY = 'playHistory';

function getStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function getTrackKey(t) {
  return t._id || t.title;
}

function bumpStat(key, field, amount = 1) {
  const stats = getStats();
  if (!stats[key]) stats[key] = { plays: 0, searches: 0 };
  stats[key][field] = (stats[key][field] || 0) + amount;
  saveStats(stats);
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function pushHistory(key) {
  let h = getHistory();
  h.push({ key, at: Date.now() });
  if (h.length > 50) h = h.slice(-50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

const SEARCH_HISTORY_KEY = 'recentSearchTracks';

function getRecentSearchTracks() {
  try {
    const stored = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY));
    return Array.isArray(stored) ? stored.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentSearchTrack(track) {
  const key = String(getTrackKey(track));
  const recent = [key, ...getRecentSearchTracks().filter((recentKey) => recentKey !== key)].slice(0, 8);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(recent));
}

function renderSearchDropdown(results = null) {
  if (!searchDropdown || !searchInput) return;
  const showingResults = results !== null;
  const keys = showingResults ? results.map(getTrackKey) : getRecentSearchTracks();
  const visibleTracks = keys
    .map((key) => tracks.find((track) => String(getTrackKey(track)) === String(key)))
    .filter(Boolean)
    .slice(0, 8);
  const heading = showingResults ? 'Tracks' : 'Recently searched';
  const clearButton = !showingResults && visibleTracks.length
    ? '<button type="button" class="btn btn-sm btn-link text-info p-0" data-clear-search-history>Clear</button>'
    : '';
  const items = visibleTracks.length
    ? visibleTracks.map((track) => `
      <button type="button" class="search-dropdown-item" role="option" data-track-key="${escapeHtml(getTrackKey(track))}">
        <span class="text-truncate w-100">${escapeHtml(track.title || 'Untitled')}</span>
        <small class="text-secondary text-truncate w-100">${escapeHtml(track.artist || 'Unknown artist')}</small>
      </button>
    `).join('')
    : `<div class="search-dropdown-empty">${showingResults ? 'No matching tracks found.' : 'Your latest searched tracks will appear here.'}</div>`;

  searchDropdown.innerHTML = `
    <div class="search-dropdown-heading">
      <span>${heading}</span>
      ${clearButton}
    </div>
    ${items}
  `;
}

function setSearchDropdownOpen(open) {
  if (!searchDropdown || !searchInput) return;
  searchDropdown.classList.toggle('d-none', !open);
  searchInput.setAttribute('aria-expanded', String(open));
}

function popularityScore(track) {
  const stats = getStats();
  const s = stats[getTrackKey(track)] || { plays: 0, searches: 0 };
  let recencyBonus = 0;
  if (track.createdAt) {
    const daysOld = (Date.now() - new Date(track.createdAt).getTime()) / 86400000;
    if (daysOld < 30) recencyBonus = (30 - daysOld) * 0.1; // max +3 for brand-new
  }
  // Deterministic tie-breaker so order is stable with 0 plays
  const baseWeight = (String(track.title || '').length % 5) * 0.1;
  return s.plays * 3 + s.searches * 1 + recencyBonus + baseWeight;
}

function getPopularTracks(limit = 6) {
  return [...tracks]
    .map((t) => ({ track: t, score: popularityScore(t) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ================= RECOMMEND ALGORITHM =================
// Content-based: +3 same genre as last played, +2 same artist,
// +1 same album, + play-history affinity (plays of that artist/genre).
// Excludes the currently playing track; falls back to popular if cold-start.
function recommendTracks(limit = 6) {
  if (!tracks.length) return { list: [], reason: '' };
  const history = getHistory();
  const stats = getStats();
  const current = tracks[currIdx] || tracks[tracks.length - 1];

  if (!history.length && !Object.keys(stats).length) {
    return {
      list: getPopularTracks(limit).map((x) => x.track),
      reason: 'Top picks for new listeners — play something to personalize.'
    };
  }

  const lastKey = history.length ? history[history.length - 1].key : getTrackKey(current);
  const lastPlayed = tracks.find((t) => getTrackKey(t) === lastKey) || current;

  const scored = tracks
    .filter((t) => getTrackKey(t) !== getTrackKey(lastPlayed))
    .map((t) => {
      let score = 0;
      const reasons = [];
      if (lastPlayed.genre && t.genre === lastPlayed.genre) {
        score += 3;
        reasons.push(`same genre (${t.genre})`);
      }
      if (lastPlayed.artist && t.artist === lastPlayed.artist) {
        score += 2;
        reasons.push('same artist');
      }
      if (lastPlayed.album && t.album === lastPlayed.album) {
        score += 1;
        reasons.push('same album');
      }
      const ts = stats[getTrackKey(t)] || { plays: 0 };
      score += Math.min(ts.plays, 5) * 0.5; // affinity, capped
      score += popularityScore(t) * 0.2; // blend in popularity
      return { track: t, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const topReason = scored[0]?.reasons?.[0] || 'popular right now';
  return {
    list: scored.map((x) => x.track),
    reason: `Because you played "${escapeHtml(lastPlayed.title)}" — matched on ${topReason}.`
  };
}

function trackCardHtml(track, badge = '') {
  const realIdx = tracks.findIndex((t) => getTrackKey(t) === getTrackKey(track));
  const clickIdx = realIdx !== -1 ? realIdx : 0;
  return `
    <div class="col">
      <div class="card card-track h-100 p-2 border-0 rounded-3 text-white" onclick="playTrack(${clickIdx})">
        ${badge ? `<span class="badge bg-success mb-2 align-self-start">${badge}</span>` : ''}
        <img src="${resolveUrl(track.coverArtUrl)}" class="card-img-top rounded mb-2" alt="${escapeHtml(track.title)}" loading="lazy">
        <div class="card-body p-0 text-truncate">
          <div class="d-flex align-items-start justify-content-between gap-1">
            <h6 class="card-title text-truncate mb-1 fw-bold fs-6">${escapeHtml(track.title)}</h6>
            ${likeButtonHtml(track)}
          </div>
          <p class="card-text text-secondary text-truncate style-subtext mb-0">${escapeHtml(track.artist)}</p>
          <p class="card-text text-secondary text-truncate style-subtext mb-0">${escapeHtml(track.album || '')}${track.genre ? ` • ${escapeHtml(track.genre)}` : ''}</p>
        </div>
      </div>
    </div>
  `;
}

function renderPopular() {
  if (!popularGrid) return;
  const popular = getPopularTracks(6);
  popularGrid.innerHTML = popular
    .map((x, i) => trackCardHtml(x.track, i === 0 ? '#1 Hot' : `#${i + 1}`))
    .join('');
  if (popularHint) popularHint.textContent = `${tracks.length} tracks ranked by plays`;
}

function renderRecommended() {
  if (!recommendGrid) return;
  const { list, reason } = recommendTracks(6);
  recommendGrid.innerHTML = list.map((t) => trackCardHtml(t)).join('');
  if (recommendReason) recommendReason.innerHTML = reason;
}

function refreshSections() {
  renderPopular();
  renderRecommended();
}

function resolveUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return encodeURI(url);
}

function playTrack(idx, keepShufflePosition = false) {
  const MP = window.MusicPlayer;
  if (!MP) return;
  if (idx === undefined) { MP.toggle(); }
  else { MP.playIndex(idx); }
}

function pauseTrack() { if (window.MusicPlayer) window.MusicPlayer.pause(); }

// Reflect shared-player state onto Home's "Your Library"/recommendations logic.
// Play counts / history are bumped once, centrally, on every 'play' event so
// stats stay accurate no matter which page or control triggered playback.
if (window.MusicPlayer) {
  window.MusicPlayer.on('trackchange', (t) => {
    if (!t) return;
    const i = tracks.findIndex((x) => getTrackKey(x) === getTrackKey(t));
    if (i !== -1) currIdx = i;
  });
  window.MusicPlayer.on('play', (t) => {
    if (!t) return;
    bumpStat(getTrackKey(t), 'plays', 1);
    pushHistory(getTrackKey(t));
    refreshSections();
  });
}

function findSearchMatches(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return tracks
    .filter((track) => `${track.title || ''} ${track.artist || ''}`.toLowerCase().includes(normalized))
    .sort((a, b) => {
      const aStarts = `${a.title || ''} ${a.artist || ''}`.toLowerCase().startsWith(normalized);
      const bStarts = `${b.title || ''} ${b.artist || ''}`.toLowerCase().startsWith(normalized);
      return Number(bStarts) - Number(aStarts) || a.title.localeCompare(b.title);
    })
    .slice(0, 8);
}

function openTrackDetail(track) {
  if (!track?._id) return;
  saveRecentSearchTrack(track);
  bumpStat(getTrackKey(track), 'searches', 1);
  window.location.href = `track.html?id=${encodeURIComponent(track._id)}`;
}

searchInput.addEventListener('focus', () => {
  renderSearchDropdown(searchInput.value.trim() ? findSearchMatches(searchInput.value) : null);
  setSearchDropdownOpen(true);
});

searchInput.addEventListener('click', () => {
  renderSearchDropdown(searchInput.value.trim() ? findSearchMatches(searchInput.value) : null);
  setSearchDropdownOpen(true);
});

searchInput.addEventListener('input', () => {
  renderSearchDropdown(searchInput.value.trim() ? findSearchMatches(searchInput.value) : null);
  setSearchDropdownOpen(true);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setSearchDropdownOpen(false);
    searchInput.blur();
  } else if (event.key === 'Enter') {
    const firstMatch = findSearchMatches(searchInput.value)[0];
    if (firstMatch) openTrackDetail(firstMatch);
  }
});

if (searchDropdown) {
  searchDropdown.addEventListener('mousedown', (event) => event.preventDefault());
  searchDropdown.addEventListener('click', (event) => {
    const clearButton = event.target.closest('[data-clear-search-history]');
    if (clearButton) {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
      renderSearchDropdown();
      return;
    }
    const item = event.target.closest('[data-track-key]');
    if (!item) return;
    const selected = tracks.find((track) => String(getTrackKey(track)) === item.dataset.trackKey);
    if (!selected) return;
    openTrackDetail(selected);
  });
}

document.addEventListener('click', (event) => {
  if (searchContainer && !searchContainer.contains(event.target)) setSearchDropdownOpen(false);
});

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/* ============================================
   YOUR LIBRARY — example playlists
   ============================================ */
/* ============================================
   PLAYLIST_API stays on the same origin as the page (works on 127.0.0.1,
   LAN IP, Render hosting...) instead of hardcoded localhost:3000.
   ============================================ */
const PLAYLIST_API = `${API_BASE}/api/playlists`;
let playlists = [];
const playlistGrid = document.getElementById('playlistGrid');
const playlistCount = document.getElementById('playlistCount');
const playlistEmpty = document.getElementById('playlistEmpty');
const playlistMenuList = document.getElementById('playlistMenuList');
const playlistEmptyDropdown = document.getElementById('playlistEmptyDropdown');

function playlistCardHtml(pl) {
  const tracks = pl.tracks || [];
  const listed = tracks.slice(0, 3).map((t) =>
    `<span class="badge bg-dark text-white rounded-pill py-1 px-2 small">${escapeHtml(t.title)}</span>`
  ).join('');
  return `
    <div class="col">
      <div class="card card-track h-100 p-2 border-0 rounded-3 text-white" onclick="openPlaylist('${pl._id.toString()}')" tabindex="0" role="button" aria-label="Open playlist ${escapeHtml(pl.name)}">
        <div class="card-body p-0 text-truncate">
          <h6 class="card-title text-truncate mb-1 fw-bold fs-6">${escapeHtml(pl.name)}</h6>
          ${pl.description ? `<p class="card-text text-secondary text-truncate style-subtext mb-0">${escapeHtml(pl.description)}</p>` : ''}
          <div class="d-flex flex-wrap gap-1 mt-1">
            ${listed}
            ${tracks.length > 3 ? `<span class="badge bg-dark text-white rounded-pill py-1 px-2 small">+${tracks.length - 3} more</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function fetchPlaylists() {
  try {
    const res = await fetch(PLAYLIST_API);
    if (!res.ok) throw new Error(`API ${res.status}`);
    playlists = await res.json();
    if (playlistCount) playlistCount.textContent = `${playlists.length} example playlists`;
    if (playlistEmpty) playlistEmpty.classList.toggle('d-none', playlists.length > 0);
    const playlistCountSummary = document.getElementById('libraryCountSummary');
    if (playlistCountSummary) playlistCountSummary.textContent = `${playlists.length} example playlists`;
    const isEmpty = playlists.length === 0;
    if (playlistEmptyDropdown) playlistEmptyDropdown.classList.toggle('d-none', !isEmpty);
    if (playlistGrid) playlistGrid.innerHTML = playlists.map((pl) => playlistCardHtml(pl)).join('');
    renderPlaylistDropdown();
  } catch (err) {
    console.error('Failed to fetch playlists:', err);
    if (playlistEmpty) playlistEmpty.classList.remove('d-none');
    if (playlistEmptyDropdown) playlistEmptyDropdown.classList.remove('d-none');
    if (playlistGrid) playlistGrid.innerHTML = '';
    if (playlistMenuList) playlistMenuList.innerHTML = '';
  }
}

function openPlaylist(id) {
  window.location.href = `library/playlist.html?id=${encodeURIComponent(id)}`;
}

function openPlaylistFromDropdown(id) {
  const toggle = document.querySelector('.library-dropdown .dropdown-toggle');
  if (toggle) {
    const dropdown = bootstrap.Dropdown.getInstance(toggle);
    if (dropdown) dropdown.hide();
  }
  openPlaylist(id);
}

function playlistDropdownItemHtml(pl) {
  const tracks = pl.tracks || [];
  const listed = tracks.slice(0, 3).map((t) =>
    `<span class="badge bg-dark text-white rounded-pill py-1 px-2 small">${escapeHtml(t.title)}</span>`
  ).join('');
  const isEmpty = tracks.length === 0;
  return `
    <div class="playlist-item" data-playlist-id="${pl._id.toString()}" tabindex="0" role="button" aria-label="Open playlist ${escapeHtml(pl.name)}">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-start gap-2">
        <div>
          <div class="playlist-item-name">${escapeHtml(pl.name)}</div>
          <div class="playlist-item-text">${pl.description ? escapeHtml(pl.description) : 'No description'}</div>
        </div>
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-start gap-2">
          ${isEmpty ? '<span class="text-secondary small">No tracks</span>' : ''}
          ${listed ? `<div class="playlist-item-tracks">${listed}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderPlaylistDropdown() {
  if (playlistMenuList) playlistMenuList.innerHTML = playlists.map(playlistDropdownItemHtml).join('');
  if (playlistEmptyDropdown) playlistEmptyDropdown.classList.toggle('d-none', playlists.length > 0);
}

function createNewAlbum() {
  const name = document.getElementById('createAlbumName').value.trim();
  const desc = document.getElementById('createAlbumDesc').value.trim();
  const token = localStorage.getItem('token');
  if (!name) return;
  if (!token) {
    window.location.href = 'verify/login.html?message=' + encodeURIComponent('Please log in to create an album.');
    return;
  }
  // Owner comes from the JWT server-side — no user id in body anymore.
  fetch(PLAYLIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, description: desc })
  })
    .then((res) => {
      if (!res.ok) return res.json().then((e) => { throw new Error(e.error || `API ${res.status}`); });
      return res.json();
    })
    .then((pl) => {
      const modal = document.getElementById('createAlbumModal');
      if (modal) {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();
      }
      const nameInput = document.getElementById('createAlbumName');
      const descInput = document.getElementById('createAlbumDesc');
      if (nameInput) nameInput.value = '';
      if (descInput) descInput.value = '';
      renderPlaylistDropdown();
      window.location.href = `library/playlist.html?id=${encodeURIComponent(pl._id)}`;
    })
    .catch((err) => {
      console.error('Failed to create album:', err);
      alert('Failed to create album.');
    });
}

// Open the Create Album modal. Shared by the desktop sidebar "+" and the
// mobile/tablet section button so the feature works identically everywhere.
function openCreateAlbumModal() {
  const modalEl = document.getElementById('createAlbumModal');
  if (!modalEl) return;
  let modal = bootstrap.Modal.getInstance(modalEl);
  if (!modal) modal = new bootstrap.Modal(modalEl);
  modal.show();
  setTimeout(() => {
    const nameInput = document.getElementById('createAlbumName');
    if (nameInput) nameInput.focus();
  }, 300);
}

// Wire every "Create Album" trigger (desktop sidebar + mobile section button).
(function () {
  ['createAlbumBtn', 'createAlbumBtnMobile'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', openCreateAlbumModal);
  });
  const submitBtn = document.getElementById('createAlbumSubmit');
  if (submitBtn) submitBtn.addEventListener('click', createNewAlbum);
  const form = document.getElementById('createAlbumForm');
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); createNewAlbum(); });
})();

// Handle playlist-item clicks inside the dropdown menu.
(function () {
  const menu = document.getElementById('playlistMenuList');
  if (!menu) return;
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.playlist-item');
    if (!item) return;
    const id = item.dataset.playlistId;
    if (id) openPlaylistFromDropdown(id);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.playlist-item');
      if (item) {
        e.preventDefault();
        openPlaylistFromDropdown(item.dataset.playlistId);
      }
    }
  });
})();


/* ============================================
   ARTIST ALBUM — dropdown of artists of all songs
   Built from the same local tracks list as Home
   (no login needed). Clicking an artist opens
   library/artist.html?artist=<name> with that
   artist's songs.
   ============================================ */
const artistMenuList = document.getElementById('artistMenuList');
const artistCountEl = document.getElementById('artistCount');
const artistEmptyDropdown = document.getElementById('artistEmptyDropdown');

function groupTracksByArtist(list) {
  const map = new Map();
  for (const t of list || []) {
    const name = String(t.artist || '').trim() || 'Unknown artist';
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(t);
  }
  return [...map.entries()]
    .map(([name, items]) => ({ name, count: items.length, cover: items[0] && items[0].coverArtUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function artistDropdownItemHtml(a) {
  return `
    <div class="playlist-item artist-item" data-artist-name="${escapeHtml(a.name)}" tabindex="0" role="button" aria-label="Open songs by ${escapeHtml(a.name)}">
      <div class="d-flex align-items-center gap-2 w-100">
        ${a.cover ? `<img src="${resolveUrl(a.cover)}" alt="" class="artist-thumb" loading="lazy">` : '<span class="artist-thumb artist-thumb-fallback"><i class="fa-solid fa-microphone-lines"></i></span>'}
        <div class="min-w-0 flex-grow-1">
          <div class="playlist-item-name text-truncate">${escapeHtml(a.name)}</div>
          <div class="playlist-item-text">${a.count} song${a.count === 1 ? '' : 's'}</div>
        </div>
        <i class="fa-solid fa-chevron-right text-secondary small"></i>
      </div>
    </div>
  `;
}

function renderArtistDropdown() {
  if (!artistMenuList) return;
  const artists = groupTracksByArtist(tracks);
  if (artistCountEl) artistCountEl.textContent = String(artists.length);
  if (artistEmptyDropdown) artistEmptyDropdown.classList.toggle('d-none', artists.length > 0);
  artistMenuList.innerHTML = artists.map(artistDropdownItemHtml).join('');
}

function openArtist(name) {
  window.location.href = 'library/artist.html?artist=' + encodeURIComponent(name);
}

function openArtistFromDropdown(name) {
  const toggle = document.querySelector('.artist-dropdown .dropdown-toggle');
  if (toggle) {
    const dropdown = bootstrap.Dropdown.getInstance(toggle);
    if (dropdown) dropdown.hide();
  }
  openArtist(name);
}

(function () {
  const menu = document.getElementById('artistMenuList');
  if (!menu) return;
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.artist-item');
    if (!item) return;
    if (item.dataset.artistName) openArtistFromDropdown(item.dataset.artistName);
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.artist-item');
      if (item && item.dataset.artistName) {
        e.preventDefault();
        openArtistFromDropdown(item.dataset.artistName);
      }
    }
  });
})();

fetchPlaylists();

/* ============================================
   FAVORITES (server-backed)
   Hearts on every track card + the player bar.
   The "Liked Songs" and "Recently Played" lists
   live on their own pages (library/liked.html,
   library/history.html) — here we only keep the
   hearts on the cards in sync with the server.
   FAV_API is same-origin so likes work on any host/port.
   ============================================ */
const FAV_API = `${API_BASE}/api/favorites`;

let likeIds = new Set();      // track ids the current user has liked
let likeIdsLoaded = false;    // true once the server ids arrived (even when logged out)

function isLoggedIn() { return Boolean(localStorage.getItem('token')); }

function apiHeaders() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

// Heart next to the track name on every card. Clicking it must NOT start
// playback — the delegated handler below stops propagation.
function likeButtonHtml(track) {
  const id = track && track._id ? String(track._id) : '';
  if (!id) return '';
  const liked = likeIds.has(id);
  return `
    <button type="button"
      class="track-like-btn${liked ? ' is-liked' : ''}"
      data-like-btn data-track-id="${escapeHtml(id)}"
      aria-pressed="${liked}"
      aria-label="${liked ? 'Remove from' : 'Add to'} Liked Songs"
      title="${liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}">
      <i class="${liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
    </button>`;
}

// One delegated handler for every heart (cards re-render constantly, so
// per-button listeners would leak).
// IMPORTANT: it runs in the CAPTURE phase. The Home cards play via an inline
// `onclick="playTrack(...)"` on the card element, and an inline handler runs
// during the bubble phase — a bubble-phase listener on `document` would fire
// too late and the click would start playback as well as toggling the heart.
document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-like-btn]');
  if (!btn) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFavorite(btn.dataset.trackId);
}, true);

async function toggleFavorite(trackId) {
  if (!trackId) return;
  if (!isLoggedIn()) {
    window.location.href = `${API_BASE}/verify/login.html`;
    return;
  }
  const liked = likeIds.has(trackId);
  // Optimistic UI: paint the heart instantly so the button feels alive even
  // if the network is slow; roll back only when the server rejects.
  syncLikeButtons(trackId, !liked);
  try {
    const res = await fetch(`${FAV_API}/${encodeURIComponent(trackId)}`, {
      method: liked ? 'DELETE' : 'POST',
      headers: apiHeaders()
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    if (liked) likeIds.delete(trackId);
    else likeIds.add(trackId);
    syncLikeButtons(trackId, !liked);
    // The player bar and the Liked Songs page listen for this event.
    document.dispatchEvent(new CustomEvent('favorites-changed', { detail: { trackId, liked: !liked } }));
  } catch (err) {
    console.error('Failed to toggle favorite:', err);
    syncLikeButtons(trackId, liked); // roll back the optimistic paint
    alert('Could not update Liked Songs. Please try again.');
  }
}

// Paint one track's hearts everywhere without a full re-render.
// querySelector with an id containing quotes/backslashes would throw, so
// match by dataset instead — never crashes, works for every id shape.
function syncLikeButtons(trackId, liked) {
  const wanted = String(trackId);
  document.querySelectorAll('[data-like-btn]').forEach((btn) => {
    if (String(btn.dataset.trackId) !== wanted) return;
    btn.classList.toggle('is-liked', liked);
    btn.setAttribute('aria-pressed', String(liked));
    btn.setAttribute('aria-label', liked ? 'Remove from Liked Songs' : 'Add to Liked Songs');
    btn.setAttribute('title', liked ? 'Remove from Liked Songs' : 'Add to Liked Songs');
    const icon = btn.querySelector('i');
    if (icon) icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  });
}

// Load the ids of the tracks the user liked so every heart on the page
// is painted correctly (filled = liked, outline = not liked).
async function fetchLikeIds() {
  if (!isLoggedIn()) {
    likeIds = new Set();
    likeIdsLoaded = true;
    syncAllLikeButtons();
    return;
  }
  try {
    const res = await fetch(`${FAV_API}/ids`, { headers: apiHeaders() });
    if (res.status === 401 || res.status === 400) {
      // Stale/expired token: drop it so the next click goes to login
      // instead of failing silently forever.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      likeIds = new Set();
      renderAuthControls();
    } else if (!res.ok) {
      throw new Error(`API ${res.status}`);
    } else {
      likeIds = new Set((await res.json()).map(String));
    }
  } catch (err) {
    console.error('Failed to load favorites:', err);
  }
  // The ids arrive after the cards are rendered, so repaint every heart.
  likeIdsLoaded = true;
  syncAllLikeButtons();
}

// Repaint every heart currently on the page (cards re-render often, so the
// ids are cached in `likeIds` and applied here).
function syncAllLikeButtons() {
  document.querySelectorAll('[data-like-btn]').forEach((btn) => {
    syncLikeButtons(btn.dataset.trackId, likeIds.has(String(btn.dataset.trackId)));
  });
}

// player.js fires this after a like toggle in the player bar — keep the
// hearts on the cards in sync without a page reload.
document.addEventListener('favorites-changed', (e) => {
  const detail = e && e.detail;
  if (detail && detail.trackId) {
    if (detail.liked) likeIds.add(String(detail.trackId));
    else likeIds.delete(String(detail.trackId));
    syncLikeButtons(detail.trackId, Boolean(detail.liked));
  } else {
    fetchLikeIds();
  }
});

// Initial load (safe when logged out — the hearts just stay outlined).
fetchLikeIds();


/* ============================================
   CUSTOM SCROLL RAIL
   Wires the right-edge rail on the Home shell:
   - drag the neon thumb to scrub <main>
   - up/down arrows jump one viewport
   - thumb tracks the native scroll position
   The rail overlays .app-main-wrap and never
   affects layout. Works on PC (fixed footer) and
   mobile (fixed player bar) since both scroll the
   same <main> element.
   ============================================ */
(function initScrollRail() {
  const rail = document.getElementById('leftScrollRail');
  const thumb = document.getElementById('leftScrollThumb');
  const upBtn = document.getElementById('railUpBtn');
  const downBtn = document.getElementById('railDownBtn');
  const scroller = document.querySelector('.app-main');
  if (!rail || !scroller) return;

  // Which element actually scrolls: on PC <main> scrolls internally; on the
  // few pages where the body scrolls instead, fall back to the document.
  const getScroll = () => (scroller.scrollHeight > scroller.clientHeight + 2)
    ? scroller
    : (document.scrollingElement || document.documentElement);

  const scrollTop = (el) => (el === document.scrollingElement || el === document.documentElement)
    ? (window.pageYOffset || document.documentElement.scrollTop)
    : el.scrollTop;
  const setScrollTop = (el, v) => {
    if (el === document.scrollingElement || el === document.documentElement) window.scrollTo(0, v);
    else el.scrollTop = v;
  };

  function updateThumb() {
    const el = getScroll();
    const max = el.scrollHeight - el.clientHeight;
    if (!thumb) return;
    if (max <= 0) {
      thumb.style.opacity = '0';
      return;
    }
    thumb.style.opacity = '';
    const railH = rail.clientHeight - 12; // leave 6px top/bottom padding
    const thumbH = thumb.offsetHeight || 60;
    const ratio = scrollTop(el) / max;
    const y = 6 + ratio * Math.max(railH - thumbH, 0);
    thumb.style.transform = `translateY(${y}px)`;
  }

  // Arrow buttons: jump ~one viewport.
  const jump = (dir) => {
    const el = getScroll();
    setScrollTop(el, scrollTop(el) + dir * el.clientHeight * 0.85);
  };
  upBtn?.addEventListener('click', () => jump(-1));
  downBtn?.addEventListener('click', () => jump(1));

  // Drag the thumb (mouse + touch) to scrub.
  let dragging = false;
  let startY = 0;
  let startScroll = 0;
  let travel = 1;

  function onDown(e) {
    if (e.target.closest('.rail-arrow')) return; // arrows handle themselves
    const el = getScroll();
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    const point = e.touches ? e.touches[0] : e;
    dragging = true;
    startY = point.clientY;
    startScroll = scrollTop(el);
    travel = Math.max((rail.clientHeight - 12) - (thumb?.offsetHeight || 60), 1);
    rail.classList.add('dragging');
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const el = getScroll();
    const max = el.scrollHeight - el.clientHeight;
    const point = e.touches ? e.touches[0] : e;
    const delta = (point.clientY - startY) / travel;
    setScrollTop(el, startScroll + delta * max);
    e.preventDefault();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('dragging');
  }

  rail.addEventListener('mousedown', onDown);
  rail.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  scroller.addEventListener('scroll', () => { updateThumb(); revealRail(); }, { passive: true });
  window.addEventListener('resize', updateThumb);

  // Reveal the (otherwise invisible) rail while scrolling on EVERY device
  // (mobile + Surface + PC), then fade it back out after a short idle so the
  // edge stays clean. Desktop keeps it pinned via CSS (opacity:1); this class
  // is what makes it appear on touch devices too.
  let revealTimer = null;
  function revealRail() {
    rail.classList.add('rail-active');
    scroller.classList.add('rail-active');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      rail.classList.remove('rail-active');
      scroller.classList.remove('rail-active');
    }, 900);
  }

  // Content loads async (tracks/playlists) so the range changes — keep the
  // thumb in sync with a light observer instead of a fixed timer.
  if ('ResizeObserver' in window) {
    new ResizeObserver(updateThumb).observe(scroller);
  }
  updateThumb();
  window.addEventListener('load', updateThumb);
})();

fetchTracks();
renderAuthControls();

function renderTracks(list, container = trackGrid) {
  if (!container) return;
  container.innerHTML = list.map((track) => trackCardHtml(track)).join('');
}