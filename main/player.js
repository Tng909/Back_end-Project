/* ============================================
   BOX MUSIC — Shared Player Bar
   A single reusable player injected on every
   user-facing page (Home, Track detail, Album).
   The Admin dashboard intentionally does NOT
   load this file, so it keeps its own controls.
   ============================================ */
(function () {
  if (window.MusicPlayer) return;

  const STORAGE_KEY = 'boxMusicPlayerState';
  const VOLUME_KEY = 'boxMusicVolume';
  // Same-origin API endpoints (works on /, /track.html and /library/...).
  const FAV_API = `${window.location.origin}/api/favorites`;
  const HISTORY_API = `${window.location.origin}/api/history`;

  const audio = new Audio();
  audio.preload = 'metadata';

  let queue = [];
  let index = 0;
  let isPlaying = false;
  let isShuffleEnabled = false;
  let isRepeatEnabled = false;
  let shuffleOrder = [];
  let shufflePosition = 0;
  let seeking = false;

  const handlers = { play: [], pause: [], trackchange: [], ended: [] };
  function on(evt, cb) {
    (handlers[evt] = handlers[evt] || []).push(cb);
  }
  function emit(evt, payload) {
    (handlers[evt] || []).forEach((cb) => {
      try { cb(payload); } catch (err) { console.error(err); }
    });
  }

  function resolveUrl(url) {
    if (!url) return url;
    return /^https?:\/\//i.test(url) ? url : encodeURI(url);
  }

  function fmtTime(sec) {
    const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
    const m = Math.floor(safe / 60);
    const s = Math.floor(safe % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  let els = {};
  function grabEls() {
    els = {
      cover: document.getElementById('playerCover'),
      title: document.getElementById('playerTitle'),
      artist: document.getElementById('playerArtist'),
      like: document.getElementById('playerLikeBtn'),
      play: document.getElementById('playBtn'),
      prev: document.getElementById('prevBtn'),
      next: document.getElementById('nextBtn'),
      prevSong: document.getElementById('prevSongBtn'),
      nextSong: document.getElementById('nextSongBtn'),
      shuffle: document.getElementById('shuffleBtn'),
      repeat: document.getElementById('repeatBtn'),
      seek: document.getElementById('seekSlider'),
      volume: document.getElementById('volumeSlider'),
      curr: document.getElementById('currTime'),
      total: document.getElementById('totalTime')
    };
  }

  const BAR_HTML = `
    <!-- Now Playing -->
    <div class="d-flex align-items-center gap-3 player-track">
      <img id="playerCover" src="https://picsum.photos/seed/placeholder/60/60" class="rounded player-cover" width="56" height="56" alt="Cover">
      <div class="d-flex align-items-center gap-2 text-truncate player-meta">
        <div class="text-truncate flex-grow-1 min-w-0">
          <div id="playerTitle" class="fw-semibold text-truncate small">Select Track</div>
          <div id="playerArtist" class="text-secondary text-truncate style-subtext"></div>
        </div>
        <button id="playerLikeBtn" class="player-like-btn" type="button" aria-label="Add to Liked Songs" title="Add to Liked Songs" aria-pressed="false">
          <i class="fa-regular fa-heart"></i>
        </button>
      </div>
    </div>

    <!-- Player Controls (centered) -->
    <div class="d-flex flex-column align-items-center gap-1 player-controls">
      <div class="d-flex align-items-center gap-3 player-buttons">
        <button id="shuffleBtn" title="Shuffle off" aria-label="Shuffle off" aria-pressed="false" class="btn btn-link text-secondary p-0 border-0 player-mode-btn"><i class="fa-solid fa-shuffle"></i></button>
        <button id="prevSongBtn" title="Previous song" class="btn btn-link text-secondary p-0 border-0 player-extra"><i class="fa-solid fa-backward fs-5"></i></button>
        <button id="prevBtn" title="Step backward" class="btn btn-link text-secondary p-0 border-0"><i class="fa-solid fa-backward-step fs-5"></i></button>
        <button id="playBtn" class="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center player-play" style="width: 36px; height: 36px;"><i class="fa-solid fa-play text-dark"></i></button>
        <button id="nextBtn" title="Step forward" class="btn btn-link text-secondary p-0 border-0"><i class="fa-solid fa-forward-step fs-5"></i></button>
        <button id="nextSongBtn" title="Next song" class="btn btn-link text-secondary p-0 border-0 player-extra"><i class="fa-solid fa-forward fs-5"></i></button>
        <button id="repeatBtn" title="Repeat off" aria-label="Repeat off" aria-pressed="false" class="btn btn-link text-secondary p-0 border-0 player-mode-btn"><i class="fa-solid fa-repeat"></i></button>
      </div>
      <div class="d-flex align-items-center gap-2 w-100 text-secondary style-subtext player-seek">
        <span id="currTime">0:00</span>
        <input type="range" class="form-range flex-grow-1 style-range" id="seekSlider" value="0" min="0" max="100" aria-label="Track progress">
        <span id="totalTime">0:00</span>
      </div>
    </div>

    <!-- Volume (right edge) -->
    <div class="d-flex align-items-center gap-2 text-secondary player-volume">
      <i class="fa-solid fa-volume-high" aria-hidden="true"></i>
      <input type="range" class="form-range style-range" id="volumeSlider" value="80" min="0" max="100" aria-label="Volume">
    </div>`;

  function mountBar() {
    let bar = document.getElementById('playerBar');
    if (!bar) {
      bar = document.createElement('footer');
      bar.id = 'playerBar';
      bar.className = 'bg-dark text-white border-top border-secondary border-opacity-25 px-3 py-2 d-flex align-items-center justify-content-between gap-2 player-bar';
      bar.style.minHeight = '90px';
      bar.innerHTML = BAR_HTML;
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-player');
    grabEls();
    wire();
  }


  function setPlayIcon() {
    if (!els.play) return;
    els.play.innerHTML = isPlaying
      ? '<i class="fa-solid fa-pause text-dark"></i>'
      : '<i class="fa-solid fa-play text-dark"></i>';
  }

  /* ---------- Favorites (like button next to the track name) ---------- */
  function authHeaders(json = true) {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const headers = { Authorization: `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function setLikeIcon(liked, trackId) {
    if (!els.like) return;
    els.like.innerHTML = liked
      ? '<i class="fa-solid fa-heart"></i>'
      : '<i class="fa-regular fa-heart"></i>';
    els.like.classList.toggle('is-liked', liked);
    els.like.setAttribute('aria-pressed', String(liked));
    const label = liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';
    els.like.setAttribute('aria-label', label);
    els.like.setAttribute('title', label);
    els.like.dataset.trackId = trackId || '';
  }

  // Ask the server whether the current track is liked and paint the heart.
  async function refreshLikeState(track) {
    const trackId = track && track._id;
    if (!trackId) return;
    if (!authHeaders(false)) { setLikeIcon(false, trackId); return; }
    try {
      const res = await fetch(`${FAV_API}/check/${trackId}`, { headers: authHeaders(false) });
      if (!res.ok) return;
      const data = await res.json();
      // Paint the heart honestly: filled red = already liked, outline = new.
      setLikeIcon(Boolean(data.favorited), trackId);
    } catch { /* offline/API hiccup — leave icon as-is */ }
  }

  async function toggleLike() {
    const track = current();
    const trackId = track && track._id;
    if (!trackId) return;
    if (!authHeaders(false)) {
      // Not logged in: send the user to login (same pattern as the admin pages).
      window.location.href = `${window.location.origin}/verify/login.html`;
      return;
    }
    const liked = els.like && els.like.classList.contains('is-liked');
    try {
      const res = await fetch(`${FAV_API}/${trackId}`, {
        method: liked ? 'DELETE' : 'POST',
        headers: authHeaders(false)
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setLikeIcon(!liked, trackId);
      // Let the Home page refresh its "Liked Songs" grid without a reload.
      document.dispatchEvent(new CustomEvent('favorites-changed', { detail: { trackId, liked: !liked } }));
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  }

  // Another part of the page (a track card heart) toggled the favorite —
  // keep the player-bar heart in sync with the current track.
  document.addEventListener('favorites-changed', (e) => {
    const detail = e && e.detail;
    const track = current();
    const trackId = track && track._id;
    if (!trackId) return;
    if (detail && detail.trackId) {
      if (String(detail.trackId) !== String(trackId)) return;
      setLikeIcon(Boolean(detail.liked), trackId);
    } else {
      refreshLikeState(track);
    }
  });

  /* ---------- Play history (recorded once per track play) ------------- */
  // Key of the track already recorded for this "session segment": reset on
  // every track change so pause/resume/seek don't spam duplicate entries.
  let lastRecordedPlay = null;

  function recordPlay(track) {
    const trackId = track && track._id;
    if (!trackId || trackId === lastRecordedPlay || !authHeaders(false)) return;
    lastRecordedPlay = trackId;
    // Fire-and-forget: history must never block or fail actual playback.
    fetch(`${HISTORY_API}/${trackId}`, { method: 'POST', headers: authHeaders(false) })
      .then(() => document.dispatchEvent(new CustomEvent('history-changed')))
      .catch(() => {});
  }

  function current() { return queue[index] || null; }

  function loadIndex(i, keepShuffle) {
    if (!queue[i]) return;
    index = i;
    if (isShuffleEnabled && !keepShuffle) resetShuffleOrder(i);
    const t = queue[i];
    audio.src = resolveUrl(t.audioUrl);
    if (els.cover) els.cover.src = resolveUrl(t.coverArtUrl) || 'Image/Logo.jpg';
    if (els.title) els.title.textContent = t.title || 'Untitled';
    if (els.artist) els.artist.textContent = t.artist || '';
    if (els.curr) els.curr.textContent = '0:00';
    if (els.total) els.total.textContent = '0:00';
    if (els.seek) els.seek.value = 0;
    lastRecordedPlay = null; // a NEW track may be recorded again
    saveState();
    refreshLikeState(t);
    emit('trackchange', t);
  }

  function play() {
    const t = current();
    if (!t) return;
    audio.play().catch(() => {});
    isPlaying = true;
    setPlayIcon();
    recordPlay(t);
    emit('play', t);
  }

  function pause() {
    audio.pause();
    isPlaying = false;
    setPlayIcon();
    emit('pause', current());
  }

  function toggle() { isPlaying ? pause() : play(); }

  function playIndex(i) {
    if (i === undefined || i === null) { toggle(); return; }
    loadIndex(i);
    play();
  }

  function resetShuffleOrder(start) {
    const remaining = queue.map((_, idx) => idx).filter((idx) => idx !== start);
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    shuffleOrder = queue.length ? [start, ...remaining] : [];
    shufflePosition = 0;
  }

  function adjacentIndex(dir) {
    if (!queue.length) return index;
    if (isShuffleEnabled) {
      if (!shuffleOrder.length) resetShuffleOrder(index);
      shufflePosition = (shufflePosition + dir + shuffleOrder.length) % shuffleOrder.length;
      return shuffleOrder[shufflePosition];
    }
    return (index + dir + queue.length) % queue.length;
  }

  function step(dir) { playIndex(adjacentIndex(dir)); }

  function setQueue(list, start = 0, autoplay = false) {
    queue = Array.isArray(list) ? list.slice() : [];
    index = 0;
    if (queue.length) {
      loadIndex(Math.min(Math.max(start, 0), queue.length - 1));
      if (autoplay) play();
    }
  }

  function setShuffle(enabled) {
    isShuffleEnabled = enabled;
    if (enabled) resetShuffleOrder(index);
    else { shuffleOrder = []; shufflePosition = 0; }
    if (els.shuffle) {
      els.shuffle.classList.toggle('is-active', enabled);
      els.shuffle.setAttribute('aria-pressed', String(enabled));
      els.shuffle.setAttribute('aria-label', enabled ? 'Shuffle on' : 'Shuffle off');
      els.shuffle.setAttribute('title', enabled ? 'Shuffle on' : 'Shuffle off');
    }
  }

  function setRepeat(enabled) {
    isRepeatEnabled = enabled;
    if (els.repeat) {
      els.repeat.classList.toggle('is-active', enabled);
      els.repeat.setAttribute('aria-pressed', String(enabled));
      els.repeat.setAttribute('aria-label', enabled ? 'Repeat on' : 'Repeat off');
      els.repeat.setAttribute('title', enabled ? 'Repeat on' : 'Repeat off');
    }
  }


  function wire() {
    els.play && els.play.addEventListener('click', toggle);
    els.like && els.like.addEventListener('click', toggleLike);
    els.prev && els.prev.addEventListener('click', () => step(-1));
    els.next && els.next.addEventListener('click', () => step(1));
    els.prevSong && els.prevSong.addEventListener('click', () => step(-1));
    els.nextSong && els.nextSong.addEventListener('click', () => step(1));
    els.shuffle && els.shuffle.addEventListener('click', () => setShuffle(!isShuffleEnabled));
    els.repeat && els.repeat.addEventListener('click', () => setRepeat(!isRepeatEnabled));

    audio.addEventListener('ended', () => {
      if (isRepeatEnabled) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }
      emit('ended', current());
      step(1);
    });
    audio.addEventListener('timeupdate', () => {
      if (seeking) return;
      if (audio.duration) {
        if (els.seek) els.seek.value = (audio.currentTime / audio.duration) * 100;
        if (els.curr) els.curr.textContent = fmtTime(audio.currentTime);
        if (els.total) els.total.textContent = fmtTime(audio.duration);
      }
    });
    audio.addEventListener('loadedmetadata', () => {
      if (els.total) els.total.textContent = fmtTime(audio.duration);
    });
    audio.addEventListener('play', () => { isPlaying = true; setPlayIcon(); });
    audio.addEventListener('pause', () => { isPlaying = false; setPlayIcon(); });

    if (els.seek) {
      els.seek.addEventListener('input', () => {
        seeking = true;
        if (audio.duration) audio.currentTime = (els.seek.value / 100) * audio.duration;
      });
      els.seek.addEventListener('change', () => { seeking = false; });
    }
    if (els.volume) {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      audio.volume = Number.isFinite(v) ? v : 0.8;
      els.volume.value = Math.round(audio.volume * 100);
      els.volume.addEventListener('input', () => {
        audio.volume = els.volume.value / 100;
        localStorage.setItem(VOLUME_KEY, String(audio.volume));
      });
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index }));
    } catch (err) { /* storage unavailable — ignore */ }
  }

  function restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.queue) || !s.queue.length) return false;
      queue = s.queue;
      index = Math.min(Math.max(s.index || 0, 0), queue.length - 1);
      loadIndex(index);
      return true;
    } catch (err) { return false; }
  }

  window.MusicPlayer = {
    audio, on, mountBar, setQueue, playIndex, play, pause, toggle,
    next: () => step(1), prev: () => step(-1),
    setShuffle, setRepeat, resolveUrl, fmtTime, current,
    get queue() { return queue; },
    get index() { return index; },
    get isPlaying() { return isPlaying; }
  };

  function init() {
    mountBar();
    restoreState();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
