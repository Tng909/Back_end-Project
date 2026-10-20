/* ============================================
   Shared helpers for the Liked Songs and
   Recently Played pages (library/liked.html,
   library/history.html).

   Both pages show the same kind of grid, talk to
   the same APIs and use the same heart button, so
   the common parts live here once.
   ============================================ */
(function () {
  'use strict';

  const FAV_API = `${window.location.origin}/api/favorites`;
  const HISTORY_API = `${window.location.origin}/api/history`;

  const $ = (id) => document.getElementById(id);

  function authHeaders(json = false) {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const headers = { Authorization: `Bearer ${token}` };
    if (json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function resolveUrl(url) {
    if (!url) return url;
    return /^https?:\/\//i.test(url) ? url : encodeURI(url);
  }

  function playedLabel(iso) {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? '' : `Played ${at.toLocaleString()}`;
  }

  // Heart button. `liked` decides whether it is filled (liked) or outlined.
  function likeButtonHtml(track, liked) {
    const id = track && track._id ? String(track._id) : '';
    if (!id) return '';
    const label = liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';
    return `
      <button type="button"
        class="track-like-btn${liked ? ' is-liked' : ''}"
        data-like-btn data-track-id="${escapeHtml(id)}"
        aria-pressed="${liked ? 'true' : 'false'}"
        aria-label="${label}" title="${label}">
        <i class="${liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
      </button>`;
  }

  // Repaint a heart in place (no re-render of the whole grid).
  function setLikeState(btn, liked) {
    if (!btn) return;
    btn.classList.toggle('is-liked', liked);
    btn.setAttribute('aria-pressed', String(liked));
    const label = liked ? 'Remove from Liked Songs' : 'Add to Liked Songs';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    const icon = btn.querySelector('i');
    if (icon) icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  }

  // Like / unlike a track. Returns true when the request succeeded.
  async function toggleLike(trackId, liked) {
    if (!trackId) return false;
    try {
      const res = await fetch(`${FAV_API}/${encodeURIComponent(trackId)}`, {
        method: liked ? 'DELETE' : 'POST',
        headers: authHeaders()
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return true;
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      return false;
    }
  }

  // GET /api/favorites -> the user's liked tracks (newest like first).
  async function fetchLikedTracks() {
    const res = await fetch(FAV_API, { headers: authHeaders() });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
  }

  // GET /api/favorites/ids -> just the ids of the liked tracks.
  async function fetchFavoriteIds() {
    const res = await fetch(`${FAV_API}/ids`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return new Set((await res.json()).map(String));
  }

  // GET /api/history -> rows of { track, createdAt }, newest first.
  // Each song is kept only once, at its MOST RECENT play.
  async function fetchHistoryItems() {
    const res = await fetch(`${HISTORY_API}?limit=50`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const rows = await res.json();
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      const t = row.track;
      if (!t || !t._id || seen.has(String(t._id))) continue;
      seen.add(String(t._id));
      items.push({ track: t, playedAt: row.createdAt });
    }
    return items;
  }

  // Turn a list of tracks into the grid markup. `subLabelOf` may add a
  // small caption under the artist (used by the history page).
  function gridHtml(tracks, likedIds, subLabelOf) {
    return tracks.map((track, idx) => {
      const liked = likedIds.has(String(track._id));
      const sub = subLabelOf ? subLabelOf(track, idx) : '';
      return `
        <div class="col">
          <div class="card card-track h-100 p-2 border-0 rounded-3 text-white" data-play="${idx}" role="button" tabindex="0" aria-label="Play ${escapeHtml(track.title)}">
            <img src="${resolveUrl(track.coverArtUrl)}" class="card-img-top rounded mb-2" alt="${escapeHtml(track.title)}" loading="lazy">
            <div class="card-body p-0 text-truncate">
              <div class="d-flex align-items-start justify-content-between gap-1">
                <h6 class="card-title text-truncate mb-1 fw-bold fs-6">${escapeHtml(track.title)}</h6>
                ${likeButtonHtml(track, liked)}
              </div>
              <p class="card-text text-secondary text-truncate style-subtext mb-0">${escapeHtml(track.artist)}</p>
              ${sub ? `<p class="card-text text-secondary text-truncate style-subtext mb-0">${escapeHtml(sub)}</p>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Play the whole list from a given index (the queue IS the list).
  function playFrom(tracks, idx) {
    const MP = window.MusicPlayer;
    if (!MP || !tracks.length) return;
    MP.setQueue(tracks, idx, true);
  }

  // Shuffle the whole list and start playing it.
  function shuffleAll(tracks) {
    const MP = window.MusicPlayer;
    if (!MP || !tracks.length) return;
    MP.setQueue(tracks, 0, false);
    MP.setShuffle(true);
    MP.play();
  }

  window.BoxCollection = {
    FAV_API,
    HISTORY_API,
    $,
    authHeaders,
    escapeHtml,
    resolveUrl,
    playedLabel,
    likeButtonHtml,
    setLikeState,
    toggleLike,
    fetchLikedTracks,
    fetchFavoriteIds,
    fetchHistoryItems,
    gridHtml,
    playFrom,
    shuffleAll
  };
})();
