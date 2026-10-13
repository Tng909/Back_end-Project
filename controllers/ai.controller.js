/**
 * AI chat brain for BOX MUSIC.
 * Gemini (REST) + smart 100% local fallback.
 */
const Track = require('../models/track');

const GEMINI_API_KEY = () => (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = () => (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripDiacritics(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function trackLine(t) {
  return `- "${t.title}" by ${t.artist}${t.genre ? ` [${t.genre}]` : ''} (id: ${t._id})`;
}
async function searchTracks(query, limit = 6) {
  const q = String(query || '').trim();
  if (!q) return [];
  const rx = new RegExp(escapeRegExp(q), 'i');
  try {
    return await Track.find({ $or: [{ title: rx }, { artist: rx }, { album: rx }, { genre: rx }] }).limit(limit).lean();
  } catch (_) { return []; }
}
function pickRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
// --- Off-topic easter egg: anything outside music/account help gets this ---
const CHEESECAKE_REPLY = [
  'Out-of-context detected... redirecting to the only correct answer: CHEESECAKE! 🍰',
  '',
  'Classic New York Cheesecake (serves 8-10):',
  'Crust: 200g crushed biscuits + 80g melted butter + 2 tbsp sugar. Press into a 20cm springform pan, chill 20 min.',
  'Filling: beat 600g cream cheese + 150g sugar until smooth. Mix in 200ml sour cream, 3 eggs (one at a time), 1 tsp vanilla, 2 tbsp flour, a pinch of salt.',
  'Bake at 160C for 50-60 min until the edges are set but the center still wobbles slightly. Cool, then chill 4+ hours (overnight is best).',
  'Serve plain or topped with berries. Enjoy!',
  '',
  'Now — want a song to bake to? Try "surprise me". 🎶',
].join('\n');
async function answerLocal(message) {
  const raw = String(message || '').trim();
  const norm = stripDiacritics(raw.toLowerCase());
  const allTracks = await Track.find({}).limit(200).lean();
  if (!allTracks.length) {
    return { reply: 'My music library is empty right now. Ask an admin to seed tracks, then ask me again!', tracks: [] };
  }
  if (/^(hi|hello|hey|yo|alo|chao|xin chao|good (morning|afternoon|evening))\b/.test(norm)) {
    return {
      reply: 'Hey! I\'m Boxie, your BOX MUSIC assistant. Try:\n- "find Billie Jean"\n- "recommend pop songs"\n- "what genres do you have?"\n- "surprise me"\n- "how do I reset my password?"\n\nHere are 3 picks to start:',
      tracks: pickRandom(allTracks, 3),
    };
  }
  // --- Account help: reset password / register / login (with page links) ---
  if (/(reset|forgot|quen mat khau|doi mat khau|mat khau|password)/.test(norm)) {
    return {
      reply: 'Here\'s how to reset your password:\n1. Open the Login page and click "Forgot password?" (or go straight to the Reset Password page).\n2. Enter your Username or Email.\n3. Type your New Password + Confirm, then hit Update Password.\n4. You\'ll go back to Login — sign in with the new password.\nNo email code needed, it updates instantly.',
      tracks: [],
      links: [
        { label: 'Open Reset Password page', url: 'verify/reset-password.html' },
        { label: 'Go to Login', url: 'verify/login.html' },
      ],
    };
  }
  if (/(register|sign ?up|dang ky|create account|tao tai khoan)/.test(norm)) {
    return {
      reply: 'To create an account:\n1. Open the Register page.\n2. Fill in full name, username, email, phone, password + confirm.\n3. Submit, then check your email and click "Verify My Account" within 20 minutes.\nThen log in and enjoy the music!',
      tracks: [],
      links: [
        { label: 'Open Register page', url: 'verify/register.html' },
        { label: 'Go to Login', url: 'verify/login.html' },
      ],
    };
  }
  if (/(log ?in|sign ?in|dang nhap)/.test(norm)) {
    return {
      reply: 'To log in:\n1. Open the Login page.\n2. Enter your username (or email) + password.\n3. Hit Login — you\'ll land back on the music library.\nForgot it? Click "Forgot password?" on that page and I\'ll walk you through it.',
      tracks: [],
      links: [
        { label: 'Go to Login', url: 'verify/login.html' },
        { label: 'Reset password', url: 'verify/reset-password.html' },
      ],
    };
  }
  if (/^(thanks?|thank you|cam on|camon|bye+|good ?bye|good ?night|tam biet|ok|okay|alright|got it|haha+|lol|hihi)\b/.test(norm)) {
    return {
      reply: 'You are welcome! Need music, password help — or go off-topic and I will reward you with cheesecake. 🍰',
      tracks: [],
    };
  }
  if (/(help|huong dan|what can you do|chuc nang)/.test(norm)) {
    return {
      reply: 'What I can do:\n1. Search: "find <song/artist>"\n2. Genre explore: "pop songs", "anime music"\n3. Recommend: "recommend something like Billie Jean" or "surprise me"\n4. Library info: "how many songs?", "list genres"\n5. Account help: "how do I reset my password?", "how do I register?"\n6. Off-topic questions earn a cheesecake recipe. 🍰\nJust type below!',
      tracks: pickRandom(allTracks, 3),
    };
  }
  if (/genre|the loai/.test(norm)) {
    const genres = [...new Set(allTracks.map((t) => t.genre).filter(Boolean))].sort();
    return {
      reply: genres.length ? `We have ${genres.length} genre(s): ${genres.join(', ')}. Try "show me ${genres[0]} songs".` : 'No genre tags yet.',
      tracks: pickRandom(allTracks, 4),
    };
  }
  if (/(list|all).{0,15}artist|ca si|nghe si/.test(norm)) {
    const artists = [...new Set(allTracks.map((t) => t.artist).filter(Boolean))].sort().slice(0, 20);
    return { reply: `Artists in the library: ${artists.join(', ')}`, tracks: pickRandom(allTracks, 4) };
  }
  if (/(how many|count|bao nhieu).{0,20}(song|track|bai)/.test(norm)) {
    return { reply: `There are ${allTracks.length} track(s) in the BOX MUSIC library.`, tracks: pickRandom(allTracks, 3) };
  }
  if (/(surprise|random|goi y|recommend|suggest|something to listen|nhac hay|chill|buon|vui)/.test(norm) && norm.length < 80) {
    const genres = [...new Set(allTracks.map((t) => (t.genre || '').toLowerCase()).filter(Boolean))];
    const hitGenre = genres.find((g) => g && norm.includes(stripDiacritics(g)));
    const pool = hitGenre ? allTracks.filter((t) => (t.genre || '').toLowerCase() === hitGenre) : allTracks;
    return { reply: hitGenre ? `Here are some ${hitGenre} picks:` : 'Here are some picks — tap a card to open & play:', tracks: pickRandom(pool.length ? pool : allTracks, 4) };
  }
  const likeMatch = raw.match(/(?:like|similar to|giong|tuong tu)\s+(.+)/i);
  if (/(recommend|suggest|similar|giong|like)/.test(norm) && likeMatch) {
    const seed = likeMatch[1].replace(/["'?.!]+$/g, '').trim();
    const found = await searchTracks(seed, 3);
    if (found.length) {
      const s0 = found[0];
      const similar = allTracks.filter((t) => String(t._id) !== String(s0._id) && ((s0.genre && t.genre === s0.genre) || (s0.artist && t.artist === s0.artist)));
      const picks = (similar.length ? similar : allTracks.filter((t) => String(t._id) !== String(s0._id))).slice(0, 4);
      return { reply: `Because you like "${s0.title}" (${s0.artist}), you may also like:`, tracks: picks.length ? picks : found };
    }
  }
  const searchMatch = raw.match(/(?:find|search|tim|play|phat|nghe)\s+(.+)/i);
  if (searchMatch) {
    const q = searchMatch[1].replace(/["'?.!]+$/g, '').trim();
    const hits = await searchTracks(q, 6);
    if (hits.length) return { reply: `Found ${hits.length} result(s) for "${q}":\n${hits.map(trackLine).join('\n')}\n\nTap a card below to open & play.`, tracks: hits };
    return { reply: `Nothing found for "${q}". Try an artist, a title word, or "surprise me".`, tracks: pickRandom(allTracks, 3) };
  }
  const genreValues = [...new Set(allTracks.map((t) => (t.genre || '').toLowerCase()).filter(Boolean))];
  const gHit = genreValues.find((g) => g && norm.includes(stripDiacritics(g)));
  if (gHit) {
    const hits = allTracks.filter((t) => (t.genre || '').toLowerCase() === gHit).slice(0, 6);
    return { reply: `Here are ${hits.length} "${gHit}" track(s):`, tracks: hits };
  }
  // Explicit food talk -> straight to the recipe (placed AFTER search/genre
  // handling so "find cake" still searches music first).
  if (/\bcheesecake\b|\bcheese\s?cake\b|\bcake\b|\brecipe\b|\breceipt\b|\bbake\b|\bbaking\b|\bcookie\b|\bbrownies?\b|\bbanh\b|\bdessert\b|\bmon an\b|\bnau an\b|\bcheese\b/.test(norm)) {
    return { reply: CHEESECAKE_REPLY, tracks: [], tag: 'cheesecake' };
  }
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['what', 'the', 'and', 'for', 'with', 'song', 'songs', 'music', 'track', 'please', 'how', 'reset', 'password', 'forgot', 'account', 'login', 'register'].includes(w));
  for (const w of words.slice(0, 4)) {
    const hits = await searchTracks(w, 5);
    if (hits.length) return { reply: `Here's what I found related to "${w}":`, tracks: hits };
  }
  // Off-topic catch-all: anything unrecognized earns the cheesecake recipe.
  return { reply: CHEESECAKE_REPLY, tracks: [], tag: 'cheesecake' };
}
async function callGemini(userMessage, history, libraryContext) {
  const key = GEMINI_API_KEY();
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const model = GEMINI_MODEL();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const systemText = [
    'You are "Boxie", the popup-chat assistant of BOX MUSIC.',
    'Reply concisely (under 120 words), friendly.',
    'Recommend ONLY songs from the library context. Never invent IDs.',
    'If not about music, answer helpfully in 1-3 sentences.',
    'OFF-TOPIC RULE: if the question is NOT about music, this app, accounts, or help — reply EXACTLY with the single word CHEESECAKE and nothing else (the server swaps in the recipe).',
    'ACCOUNT HELP (use these exact steps, never invent other flows):',
    '- Reset password: Login page > "Forgot password?" (or verify/reset-password.html) > enter Username or Email > New Password + Confirm > Update Password > back to Login. No email code needed. API: POST /api/auth/reset-password {identifier, newPassword}.',
    '- Register: verify/register.html > fill full name, username, email, phone, password+confirm > submit > click "Verify My Account" email link within 20 min > login.',
    '- Login: verify/login.html > username/email + password > Login.',
    '--- LIBRARY ---',
    libraryContext || '(empty)',
  ].join('\n');
  const contents = [
    { role: 'user', parts: [{ text: systemText }] },
    { role: 'model', parts: [{ text: 'Got it! I am Boxie, ready to help.' }] },
  ];
  for (const m of (Array.isArray(history) ? history.slice(-10) : [])) {
    if (m && (m.role === 'user' || m.role === 'model') && m.text) {
      contents.push({ role: m.role, parts: [{ text: String(m.text).slice(0, 1000) }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: String(userMessage).slice(0, 1000) }] });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 512 } }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini empty reply');
  return text;
}
exports.chat = async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!message) return res.status(400).json({ error: 'Message is required.' });
    if (message.length > 1000) return res.status(400).json({ error: 'Message too long.' });
    const local = await answerLocal(message);
    // Off-topic easter egg: cheesecake answers bypass the cloud brain on purpose.
    if (local.tag === 'cheesecake') {
      return res.json({ reply: local.reply, tracks: [], links: [], source: 'cheesecake' });
    }
    if (GEMINI_API_KEY()) {
      try {
        const snap = await Track.find({}).select('title artist genre album').lean().limit(60);
        const ctx = snap.map((t) => `- "${t.title}" by ${t.artist}${t.genre ? ` [${t.genre}]` : ''}`).join('\n');
        const smartReply = await callGemini(message, history, ctx);
        if (/^\s*cheesecake\s*[.!]?\s*$/i.test(smartReply)) {
          return res.json({ reply: CHEESECAKE_REPLY, tracks: [], links: [], source: 'cheesecake' });
        }
        return res.json({ reply: smartReply, tracks: local.tracks, links: local.links || [], source: 'gemini' });
      } catch (err) { console.warn('[AI] Gemini failed, local fallback:', err.message); }
    }
    return res.json({ reply: local.reply, tracks: local.tracks, links: local.links || [], source: 'local' });
  } catch (err) {
    return res.status(500).json({ error: 'AI assistant is busy. Try again.' });
  }
};

exports.suggestions = async (req, res) => {
  res.json({ suggestions: ['Surprise me', 'Recommend pop songs', 'Find Billie Jean', 'What genres do you have?', 'How many songs are there?', 'Cheesecake recipe 🍰', 'Help'] });
};
