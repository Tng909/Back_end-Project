const API_URL = 'http://localhost:3000/api/tracks';

let tracks = [];
let currIdx = 0;
let isPlaying = false;
let isShuffleEnabled = false;
let isRepeatEnabled = false;
let shuffleOrder = [];
let shufflePosition = 0;
const audio = new Audio();

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
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const prevSongBtn = document.getElementById('prevSongBtn');
const nextSongBtn = document.getElementById('nextSongBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const seekSlider = document.getElementById('seekSlider');
const volumeSlider = document.getElementById('volumeSlider');
const playerCover = document.getElementById('playerCover');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const currTime = document.getElementById('currTime');
const totalTime = document.getElementById('totalTime');
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
    if (tracks.length > 0) loadTrack(0);
  } catch (err) {
    console.error('Failed to fetch tracks:', err);
    if (trackGrid) trackGrid.innerHTML = '';
    if (allTracksEmpty) allTracksEmpty.classList.remove('d-none');
  }
}

// All Tracks: render EVERY track from seed.js/DB 1:1 (title, artist, album, genre, cover, audio)
function renderAllTracks(list) {
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
          <h6 class="card-title text-truncate mb-1 fw-bold fs-6">${escapeHtml(track.title)}</h6>
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

function loadTrack(idx, keepShufflePosition = false) {
  if (!tracks[idx]) return;
  currIdx = idx;
  if (isShuffleEnabled && !keepShufflePosition) resetShuffleOrder(idx);
  const t = tracks[currIdx];
  audio.src = resolveUrl(t.audioUrl);
  playerCover.src = resolveUrl(t.coverArtUrl);
  playerTitle.textContent = t.title;
  playerArtist.textContent = t.artist;
}

function playTrack(idx, keepShufflePosition = false) {
  if (idx !== undefined) loadTrack(idx, keepShufflePosition);
  const current = tracks[currIdx];
  if (current) {
    bumpStat(getTrackKey(current), 'plays', 1);
    pushHistory(getTrackKey(current));
    refreshSections();
  }
  audio.play().catch(() => {});
  isPlaying = true;
  playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
}

function resetShuffleOrder(startIdx = currIdx) {
  const remaining = tracks
    .map((_, index) => index)
    .filter((index) => index !== startIdx);
  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  shuffleOrder = tracks.length ? [startIdx, ...remaining] : [];
  shufflePosition = 0;
}

function playAdjacentTrack(direction) {
  if (!tracks.length) return;
  let nextIndex;
  if (isShuffleEnabled) {
    if (!shuffleOrder.length) resetShuffleOrder(currIdx);
    shufflePosition = (shufflePosition + direction + shuffleOrder.length) % shuffleOrder.length;
    nextIndex = shuffleOrder[shufflePosition];
  } else {
    nextIndex = (currIdx + direction + tracks.length) % tracks.length;
  }
  playTrack(nextIndex, isShuffleEnabled);
}

function setShuffleEnabled(enabled) {
  isShuffleEnabled = enabled;
  if (enabled) resetShuffleOrder(currIdx);
  else {
    shuffleOrder = [];
    shufflePosition = 0;
  }
  shuffleBtn?.classList.toggle('is-active', enabled);
  shuffleBtn?.setAttribute('aria-pressed', String(enabled));
  shuffleBtn?.setAttribute('aria-label', enabled ? 'Shuffle on' : 'Shuffle off');
  shuffleBtn?.setAttribute('title', enabled ? 'Shuffle on' : 'Shuffle off');
}

function setRepeatEnabled(enabled) {
  isRepeatEnabled = enabled;
  repeatBtn?.classList.toggle('is-active', enabled);
  repeatBtn?.setAttribute('aria-pressed', String(enabled));
  repeatBtn?.setAttribute('aria-label', enabled ? 'Repeat on' : 'Repeat off');
  repeatBtn?.setAttribute('title', enabled ? 'Repeat on' : 'Repeat off');
}

function pauseTrack() {
  audio.pause();
  isPlaying = false;
  playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
}

playBtn.addEventListener('click', () => {
  isPlaying ? pauseTrack() : playTrack();
});

prevBtn.addEventListener('click', () => {
  playAdjacentTrack(-1);
});

nextBtn.addEventListener('click', () => {
  playAdjacentTrack(1);
});

// Previous song button (next to backward button)
if (prevSongBtn) {
  prevSongBtn.addEventListener('click', () => {
    playAdjacentTrack(-1);
  });
}

// Next song button (next to forward button)
if (nextSongBtn) {
  nextSongBtn.addEventListener('click', () => {
    playAdjacentTrack(1);
  });
}

shuffleBtn?.addEventListener('click', () => setShuffleEnabled(!isShuffleEnabled));
repeatBtn?.addEventListener('click', () => setRepeatEnabled(!isRepeatEnabled));

audio.addEventListener('ended', () => {
  if (!isRepeatEnabled) {
    playAdjacentTrack(1);
    return;
  }
  audio.currentTime = 0;
  audio.play().catch((err) => {
    console.error('Could not repeat the current track:', err);
    pauseTrack();
  });
});

audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    seekSlider.value = (audio.currentTime / audio.duration) * 100;
    currTime.textContent = fmtTime(audio.currentTime);
    totalTime.textContent = fmtTime(audio.duration);
  }
});

seekSlider.addEventListener('input', () => {
  audio.currentTime = (seekSlider.value / 100) * audio.duration;
});

volumeSlider.addEventListener('input', () => {
  audio.volume = volumeSlider.value / 100;
});

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

fetchTracks();
renderAuthControls();

function renderTracks(list, container = trackGrid) {
  if (!container) return;
  container.innerHTML = list.map((track) => trackCardHtml(track)).join('');
}