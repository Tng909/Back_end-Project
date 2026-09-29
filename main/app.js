const API_URL = 'http://localhost:3000/api/tracks';

let tracks = [];
let currIdx = 0;
let isPlaying = false;
const audio = new Audio();

const trackGrid = document.getElementById('trackGrid');
const allTracksCount = document.getElementById('allTracksCount');
const allTracksEmpty = document.getElementById('allTracksEmpty');
const popularGrid = document.getElementById('popularGrid');
const recommendGrid = document.getElementById('recommendGrid');
const popularHint = document.getElementById('popularHint');
const recommendReason = document.getElementById('recommendReason');
const searchInput = document.getElementById('searchInput');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const prevSongBtn = document.getElementById('prevSongBtn');
const nextSongBtn = document.getElementById('nextSongBtn');
const seekSlider = document.getElementById('seekSlider');
const volumeSlider = document.getElementById('volumeSlider');
const playerCover = document.getElementById('playerCover');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const currTime = document.getElementById('currTime');
const totalTime = document.getElementById('totalTime');
const authControls = document.getElementById('authControls');

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
    return;
  }

  const username = user.username || user.fullName || 'Account';
  authControls.innerHTML = `
    <div class="dropdown">
      <button class="btn btn-success rounded-pill fw-semibold dropdown-toggle" type="button"
        id="userMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        ${escapeHtml(username)}
      </button>
      <ul class="dropdown-menu dropdown-menu-end dropdown-menu-dark" aria-labelledby="userMenuButton">
        <li><a class="dropdown-item" href="management/user_manage.html" id="accountManagerLink">Account Manager</a></li>
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
        <img src="${resolveUrl(track.coverArtUrl)}" class="card-img-top rounded mb-2 ratio ratio-1x1 object-fit-cover" alt="${escapeHtml(track.title)}" loading="lazy">
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

function loadTrack(idx) {
  if (!tracks[idx]) return;
  currIdx = idx;
  const t = tracks[currIdx];
  audio.src = resolveUrl(t.audioUrl);
  playerCover.src = resolveUrl(t.coverArtUrl);
  playerTitle.textContent = t.title;
  playerArtist.textContent = t.artist;
}

function playTrack(idx) {
  if (idx !== undefined) loadTrack(idx);
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

function pauseTrack() {
  audio.pause();
  isPlaying = false;
  playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
}

playBtn.addEventListener('click', () => {
  isPlaying ? pauseTrack() : playTrack();
});

prevBtn.addEventListener('click', () => {
  if (!tracks.length) return;
  currIdx = (currIdx - 1 + tracks.length) % tracks.length;
  playTrack(currIdx);
});

nextBtn.addEventListener('click', () => {
  if (!tracks.length) return;
  currIdx = (currIdx + 1) % tracks.length;
  playTrack(currIdx);
});

// Previous song button (next to backward button)
if (prevSongBtn) {
  prevSongBtn.addEventListener('click', () => {
    if (!tracks.length) return;
    currIdx = (currIdx - 1 + tracks.length) % tracks.length;
    playTrack(currIdx);
  });
}

// Next song button (next to forward button)
if (nextSongBtn) {
  nextSongBtn.addEventListener('click', () => {
    if (!tracks.length) return;
    currIdx = (currIdx + 1) % tracks.length;
    playTrack(currIdx);
  });
}

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

searchInput.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = tracks.filter(t =>
    t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
  // count search hits toward popularity
  if (q.trim()) filtered.forEach((t) => bumpStat(getTrackKey(t), 'searches', 1));
  renderTracks(filtered, trackGrid);
  refreshSections();
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