/* ARTIST ALBUM page (/library/artist.html) - part 1 */
(function () {
  'use strict';
  const C = window.BoxCollection;
  const $ = C.$;
  const TRACKS_API = window.location.origin + '/api/tracks';
  const params = new URLSearchParams(window.location.search);
  let selected = (params.get('artist') || '').trim();
  let tracks = [];
  let artists = [];

  function groupByArtist(list) {
    const map = new Map();
    for (const t of list || []) {
      const name = String((t && t.artist) || '').trim() || 'Unknown artist';
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(t);
    }
    return [...map.entries()]
      .map(([name, items]) => ({ name, count: items.length }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function currentList() {
    if (!selected) return tracks;
    return tracks.filter((t) => String((t && t.artist) || '').trim() === selected);
  }

  async function load() {
    try {
      const trackRes = await fetch(TRACKS_API);
      if (!trackRes.ok) throw new Error('API ' + trackRes.status);
      tracks = await trackRes.json();
      if (!Array.isArray(tracks)) tracks = tracks.items || [];
      try {
        const ar = await fetch(TRACKS_API + '/artists');
        if (ar.ok) artists = await ar.json();
      } catch (e) { /* fallback below */ }
      if (!artists || !artists.length) artists = groupByArtist(tracks);
      if (selected && !tracks.some((t) => String((t && t.artist) || '').trim() === selected)) selected = '';
      render();
    } catch (err) {
      console.error('Failed to load artists:', err);
      $('listLoading').classList.add('d-none');
      $('listEmpty').classList.remove('d-none');
      $('listEmpty').textContent = 'Could not load artists. Please try again.';
    }
  }

  function renderChips() {
    const box = $('artistChips');
    const all = [{ name: '', count: tracks.length }];
    box.innerHTML = all.concat(artists).map((a) => {
      const active = (a.name || '') === (selected || '');
      const label = a.name ? C.escapeHtml(a.name) + ' (' + a.count + ')' : 'All (' + tracks.length + ')';
      return '<button type="button" class="btn btn-sm rounded-pill ' + (active ? 'btn-success' : 'btn-outline-light') +
        '" data-artist="' + C.escapeHtml(a.name || '') + '">' + label + '</button>';
    }).join('');
  }

  function renderHero(list) {
    const nameEl = $('artistName');
    const subEl = $('artistSub');
    const coverEl = $('artistCover');
    if (selected) {
      nameEl.textContent = selected;
      document.title = selected + ' - BOX MUSIC';
      subEl.textContent = list.length + (list.length === 1 ? ' song' : ' songs') + ' by ' + selected + '.';
      const cover = list[0] && list[0].coverArtUrl;
      if (cover) coverEl.innerHTML = '<img src="' + C.resolveUrl(cover) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">';
      else coverEl.innerHTML = '<i class="fa-solid fa-microphone-lines"></i>';
    } else {
      nameEl.textContent = 'All Artists';
      document.title = 'Artist Album - BOX MUSIC';
      subEl.textContent = 'Every artist found in your local songs.';
      coverEl.innerHTML = '<i class="fa-solid fa-microphone-lines"></i>';
    }
  }

  async function render() {
    const list = currentList();
    window.Boxie.setLibrary('artist', list);
    renderChips();
    renderHero(list);
    const n = list.length;
    $('listCount').textContent = n + (n === 1 ? ' song' : ' songs');
    $('playAllBtn').disabled = n === 0;
    $('shuffleAllBtn').disabled = n === 0;
    $('listLoading').classList.add('d-none');
    $('listEmpty').classList.toggle('d-none', n > 0);
    let likedIds = new Set();
    try { likedIds = await C.fetchFavoriteIds(); } catch (e) {}
    $('trackGrid').innerHTML = C.gridHtml(list, likedIds);
    render.current = list;
  }

  $('artistChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-artist]');
    if (!btn) return;
    selected = btn.getAttribute('data-artist') || '';
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set('artist', selected);
    else url.searchParams.delete('artist');
    window.history.replaceState({}, '', url);
    render();
  });

  $('trackGrid').addEventListener('click', async (e) => {
    const list = render.current || [];
    const likeBtn = e.target.closest('[data-like-btn]');
    if (likeBtn) {
      e.stopPropagation();
      const id = likeBtn.getAttribute('data-track-id');
      const liked = likeBtn.classList.contains('is-liked');
      if (!C.authHeaders()) { window.location.href = '../verify/login.html'; return; }
      const ok = await C.toggleLike(id, liked);
      if (ok) C.setLikeState(likeBtn, !liked);
      return;
    }
    const card = e.target.closest('[data-play]');
    if (!card) return;
    C.playFrom(list, Number(card.getAttribute('data-play')));
  });

  $('trackGrid').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-play]');
    if (!card) return;
    e.preventDefault();
    C.playFrom(render.current || [], Number(card.getAttribute('data-play')));
  });

  $('playAllBtn').addEventListener('click', () => C.playFrom(render.current || [], 0));
  $('shuffleAllBtn').addEventListener('click', () => C.shuffleAll(render.current || []));
  document.addEventListener('favorites-changed', () => render());
  load();
})();
