/* ============================================
   HISTORY page (/library/history.html)
   Loads /api/history (auto-recorded plays),
   deduped to each song's most recent play.
   Shared helpers live in collection-common.js.
   ============================================ */
(function () {
  'use strict';

  const C = window.BoxCollection;
  const $ = C.$;
  let items = []; // { track, playedAt }

  function renderLoginPrompt() {
    $('listLoading').classList.add('d-none');
    const empty = $('listEmpty');
    empty.classList.remove('d-none');
    empty.innerHTML = 'Log in to see your listening history. ' +
      '<a href="../verify/login.html" class="btn btn-success btn-sm rounded-pill ms-2 px-3 fw-semibold">Log in</a>';
  }

  async function load() {
    if (!C.authHeaders()) { renderLoginPrompt(); return; }
    try {
      items = await C.fetchHistoryItems();
      render();
    } catch (err) {
      console.error('Failed to load history:', err);
      $('listLoading').classList.add('d-none');
      $('listEmpty').classList.remove('d-none');
      $('listEmpty').textContent = 'Could not load your history. Please try again.';
    }
  }

  function render() {
    const n = items.length;
    window.Boxie.setLibrary('history', items.map((item) => item.track));
    document.title = 'Recently Played — BOX MUSIC';
    $('listCount').textContent = n + (n === 1 ? ' song' : ' songs');
    $('playAllBtn').disabled = n === 0;
    $('shuffleAllBtn').disabled = n === 0;
    $('clearHistoryBtn').classList.toggle('d-none', n === 0);
    $('listLoading').classList.add('d-none');
    $('listEmpty').classList.toggle('d-none', n > 0);
    const tracks = items.map((it) => it.track);
    // Hearts on the history cards follow the liked state, so load the ids.
    C.fetchFavoriteIds()
      .then((likedIds) => {
        $('trackGrid').innerHTML = C.gridHtml(tracks, likedIds, (track, idx) => C.playedLabel(items[idx].playedAt));
      })
      .catch(() => {
        $('trackGrid').innerHTML = C.gridHtml(tracks, new Set());
      });
  }

  function playAt(idx) {
    C.playFrom(items.map((it) => it.track), idx);
  }

  $('trackGrid').addEventListener('click', (e) => {
    const likeBtn = e.target.closest('[data-like-btn]');
    if (likeBtn) {
      e.stopPropagation();
      const id = likeBtn.getAttribute('data-track-id');
      const liked = likeBtn.classList.contains('is-liked');
      C.toggleLike(id, liked).then((ok) => {
        if (!ok) return;
        C.setLikeState(likeBtn, !liked);
        document.dispatchEvent(new CustomEvent('favorites-changed', { detail: { trackId: id, liked: !liked } }));
      });
      return;
    }
    const card = e.target.closest('[data-play]');
    if (card) playAt(Number(card.getAttribute('data-play')));
  });

  $('trackGrid').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-play]');
    if (!card) return;
    e.preventDefault();
    playAt(Number(card.getAttribute('data-play')));
  });

  $('playAllBtn').addEventListener('click', () => playAt(0));

  $('shuffleAllBtn').addEventListener('click', () => {
    C.shuffleAll(items.map((it) => it.track));
  });

  $('clearHistoryBtn').addEventListener('click', async () => {
    if (!confirm('Clear your entire listening history?')) return;
    try {
      const res = await fetch(C.HISTORY_API, { method: 'DELETE', headers: C.authHeaders() });
      if (!res.ok) throw new Error(`API ${res.status}`);
      items = [];
      render();
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  });

  // The shared player records a play and fires this — refresh live.
  document.addEventListener('history-changed', load);

  // The player-bar heart (or any other heart) toggled a favorite — repaint
  // the matching heart on the history cards without a full reload.
  document.addEventListener('favorites-changed', (e) => {
    const detail = e && e.detail;
    if (!detail || !detail.trackId) return;
    document.querySelectorAll('[data-like-btn]').forEach((btn) => {
      if (String(btn.getAttribute('data-track-id')) !== String(detail.trackId)) return;
      C.setLikeState(btn, Boolean(detail.liked));
    });
  });

  load();
})();
