/* ============================================
   LIKED SONGS page (/library/liked.html)
   Loads /api/favorites, plays them via the
   shared player, allows unliking in place.
   Shared helpers live in collection-common.js.
   ============================================ */
(function () {
  'use strict';

  const C = window.BoxCollection;
  const $ = C.$;
  let tracks = [];

  function renderLoginPrompt() {
    $('listLoading').classList.add('d-none');
    const empty = $('listEmpty');
    empty.classList.remove('d-none');
    empty.innerHTML = 'Log in to see your liked songs. ' +
      '<a href="../verify/login.html" class="btn btn-success btn-sm rounded-pill ms-2 px-3 fw-semibold">Log in</a>';
  }

  async function load() {
    if (!C.authHeaders()) { renderLoginPrompt(); return; }
    try {
      tracks = await C.fetchLikedTracks();
      render();
    } catch (err) {
      console.error('Failed to load liked songs:', err);
      $('listLoading').classList.add('d-none');
      $('listEmpty').classList.remove('d-none');
      $('listEmpty').textContent = 'Could not load liked songs. Please try again.';
    }
  }

  function render() {
    const n = tracks.length;
    window.Boxie.setLibrary('liked', tracks);
    document.title = 'Liked Songs — BOX MUSIC';
    $('listCount').textContent = n + (n === 1 ? ' song' : ' songs');
    $('playAllBtn').disabled = n === 0;
    $('shuffleAllBtn').disabled = n === 0;
    $('listLoading').classList.add('d-none');
    $('listEmpty').classList.toggle('d-none', n > 0);
    // Every track in this list is liked by definition.
    const likedIds = new Set(tracks.map((t) => String(t._id)));
    $('trackGrid').innerHTML = C.gridHtml(tracks, likedIds);
  }

  // Grid clicks: unlike a track (then drop it from the list), or play a card.
  $('trackGrid').addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('[data-like-btn]');
    if (likeBtn) {
      e.stopPropagation();
      const id = likeBtn.getAttribute('data-track-id');
      const ok = await C.toggleLike(id, true); // it is liked -> unlike it
      if (!ok) return;
      tracks = tracks.filter((t) => String(t._id) !== String(id));
      render();
      // Keep the player-bar heart in sync with the server.
      document.dispatchEvent(new CustomEvent('favorites-changed', { detail: { trackId: id, liked: false } }));
      return;
    }
    const card = e.target.closest('[data-play]');
    if (!card) return;
    C.playFrom(tracks, Number(card.getAttribute('data-play')));
  });

  // Keyboard: Enter/Space plays the focused card.
  $('trackGrid').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-play]');
    if (!card) return;
    e.preventDefault();
    C.playFrom(tracks, Number(card.getAttribute('data-play')));
  });

  $('playAllBtn').addEventListener('click', () => C.playFrom(tracks, 0));

  $('shuffleAllBtn').addEventListener('click', () => C.shuffleAll(tracks));

  // The player-bar heart fires this after a toggle anywhere on the page —
  // reload so the grid always matches the server.
  document.addEventListener('favorites-changed', load);

  load();
})();
