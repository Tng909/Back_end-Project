/* Boxie AI popup messenger — talks to /api/ai/chat, renders track cards. */
(function () {
  const API_BASE = '';
  const fab = document.getElementById('boxieFab');
  const panel = document.getElementById('boxiePanel');
  const msgs = document.getElementById('boxieMsgs');
  const chips = document.getElementById('boxieChips');
  const form = document.getElementById('boxieForm');
  const input = document.getElementById('boxieInput');
  const closeBtn = document.getElementById('boxieClose');
  const clearBtn = document.getElementById('boxieClear');
  const ping = document.getElementById('boxiePing');
  if (!fab || !panel || !msgs || !form || !input) return;

  const STORE_KEY = 'boxie_history_v1';
  let history = [];
  let opened = false;
  let busy = false;
  const scopedPage = {
    '/library/playlist.html': 'playlist',
    '/library/liked.html': 'liked',
    '/library/history.html': 'history',
    '/library/artist.html': 'artist'
  }[window.location.pathname];
  let library = scopedPage ? { source: scopedPage, trackIds: [] } : null;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(saved)) history = saved.slice(-30);
  } catch (_) { history = []; }

  function save() {
    history = history.slice(-30); // keep only the most recent turns in the cache
    try { localStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch (_) {}
  }
  function scrollDown() { msgs.scrollTop = msgs.scrollHeight; }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function coverFor(t) {
    if (t.coverArtUrl) return t.coverArtUrl;
    return 'https://picsum.photos/seed/' + encodeURIComponent(t._id || t.title || 'boxie') + '/80/80';
  }
  function trackCard(t) {
    const id = esc(t._id || '');
    const title = esc(t.title || 'Unknown');
    const artist = esc(t.artist || 'Unknown artist');
    const genre = esc(t.genre || '');
    return `<button class="boxie-track" data-id="${id}" type="button">`
      + `<img src="${esc(coverFor(t))}" alt="" loading="lazy">`
      + `<span class="boxie-track-meta"><strong>${title}</strong><small>${artist}${genre ? ' • ' + genre : ''}</small></span>`
      + `<i class="fa-solid fa-play"></i></button>`;
  }
  function bubble(who, html) {
    const div = document.createElement('div');
    div.className = 'boxie-msg boxie-' + who;
    div.innerHTML = html;
    msgs.appendChild(div);
    scrollDown();
    return div;
  }
  function sayAI(text, tracks, links) {
    const safe = esc(text).replace(/\n/g, '<br>');
    let html = `<div class="boxie-text">${safe}</div>`;
    if (Array.isArray(tracks) && tracks.length) {
      html += `<div class="boxie-tracks">${tracks.map(trackCard).join('')}</div>`;
    }
    if (Array.isArray(links) && links.length) {
      html += `<div class="boxie-links">${links.map((l) => `<a class="boxie-link" href="${esc(l.url)}">${esc(l.label)}</a>`).join('')}</div>`;
    }
    bubble('ai', html);
  }
  function sayUser(text) { bubble('user', `<div class="boxie-text">${esc(text)}</div>`); }
  function typing() {
    const d = document.createElement('div');
    d.className = 'boxie-msg boxie-ai';
    d.id = 'boxieTyping';
    d.innerHTML = '<div class="boxie-typing"><span></span><span></span><span></span></div>';
    msgs.appendChild(d);
    scrollDown();
  }
  function untyping() { document.getElementById('boxieTyping')?.remove(); }
  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    sayUser(text);
    input.value = '';
    typing();
    try {
      const res = await fetch(API_BASE + '/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(-10),
          ...(library ? { library } : {})
        }),
      });
      const data = await res.json().catch(() => ({}));
      untyping();
      if (!res.ok) {
        sayAI(data.error || 'Boxie is busy. Please try again.', [], []);
      } else {
        sayAI(data.reply || '...', data.tracks || [], data.links || []);
        history.push({ role: 'user', text });
        history.push({
          role: 'model',
          text: String(data.reply || '').slice(0, 1000),
          tracks: Array.isArray(data.tracks) ? data.tracks.slice(0, 6) : [],
          links: Array.isArray(data.links) ? data.links.slice(0, 6) : [],
        });
        save();
      }
    } catch (e) {
      untyping();
      sayAI('Cannot reach the server. Is the backend running on port 3000?', []);
    } finally { busy = false; scrollDown(); }
  }
  function setOpen(open) {
    opened = open;
    panel.classList.toggle('d-none', !open);
    fab.setAttribute('aria-expanded', String(open));
    fab.querySelector('i')?.classList.replace(open ? 'fa-robot' : 'fa-xmark', open ? 'fa-xmark' : 'fa-robot');
    if (ping) ping.classList.add('d-none');
    if (open) {
      if (!msgs.children.length) {
        sayAI('Hi! I\'m Boxie. Ask me to find songs, recommend by genre, reset your password, or tap a suggestion below.', [], []);
      }
      if (!chips.children.length) loadChips();
      setTimeout(() => input.focus(), 50);
    }
  }
  async function loadChips() {
    let list = ['Surprise me', 'Recommend pop songs', 'Find Billie Jean', 'What genres do you have?', 'Cheesecake recipe 🍰', 'Help'];
    try {
      const r = await fetch(API_BASE + '/api/ai/suggestions');
      const d = await r.json();
      if (Array.isArray(d.suggestions) && d.suggestions.length) list = d.suggestions;
    } catch (_) {}
    chips.innerHTML = list.map((s) => `<button type="button" class="boxie-chip">${esc(s)}</button>`).join('');
  }
  chips?.addEventListener('click', (e) => {
    const b = e.target.closest('.boxie-chip');
    if (b) send(b.textContent);
  });
  msgs.addEventListener('click', (e) => {
    const card = e.target.closest('.boxie-track');
    if (!card || !card.dataset.id) return;
    const trackUrl = new URL('/track.html', window.location.origin);
    trackUrl.searchParams.set('id', card.dataset.id);
    window.location.href = trackUrl.toString();
  });
  window.Boxie = {
    setLibrary(source, tracks) {
      if (!['playlist', 'liked', 'history', 'artist'].includes(source)) {
        throw new Error(`Unsupported Boxie library source: ${source}`);
      }
      library = {
        source,
        trackIds: (Array.isArray(tracks) ? tracks : [])
          .map((track) => String(track?._id || ''))
          .filter((id) => /^[a-f\d]{24}$/i.test(id))
          .slice(0, 100)
      };
    }
  };
  fab.addEventListener('click', () => setOpen(!opened));
  closeBtn?.addEventListener('click', () => setOpen(false));
  clearBtn?.addEventListener('click', () => {
    msgs.innerHTML = '';
    history = [];
    try { localStorage.removeItem(STORE_KEY); } catch (_) {} // recycle bin: delete the saved cache
    sayAI('Chat cleared. What shall we listen to?', [], []);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && opened) setOpen(false); });
  // Replay the saved conversation so it survives a page reload.
  // AI messages restore their track cards + links to keep the full context.
  for (const m of history) {
    if (m.role === 'user') sayUser(m.text);
    else if (m.role === 'model') sayAI(m.text, m.tracks || [], m.links || []);
  }
  scrollDown();
  setTimeout(() => { if (!opened && ping) ping.classList.remove('d-none'); }, 4000);
})();
