const trackId = new URLSearchParams(window.location.search).get('id');
const audio = document.getElementById('detailAudio');
const playButton = document.getElementById('detailPlayButton');
const seek = document.getElementById('detailSeek');
const currentTime = document.getElementById('detailCurrentTime');
const duration = document.getElementById('detailDuration');
const lyricsContainer = document.getElementById('detailLyrics');
const lyricsHint = document.getElementById('lyricsHint');
let lyricLines = [];
let activeLyricIndex = -1;
let isSeeking = false;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[character]));
}

function resolveMediaUrl(value) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : encodeURI(value);
}

function formatTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function parseLyrics(lyrics) {
  const lines = [];
  String(lyrics || '').split(/\r?\n/).forEach((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    const text = line.replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
    if (!text) return;
    if (!matches.length) {
      lines.push({ time: null, text });
      return;
    }
    matches.forEach((match) => {
      const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
      lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text });
    });
  });
  return lines.sort((a, b) => {
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });
}

function renderLyrics(lyrics) {
  lyricLines = parseLyrics(lyrics);
  activeLyricIndex = -1;
  if (!lyricLines.length) {
    lyricsHint.textContent = 'Lyrics have not been added for this track yet.';
    lyricsContainer.innerHTML = '';
    return;
  }
  const hasTimestamps = lyricLines.some((line) => line.time !== null);
  lyricsHint.textContent = hasTimestamps
    ? 'Lyrics follow the track as it plays. Add timestamps in [mm:ss.xx] LRC format when editing a track.'
    : 'These lyrics are not synchronized. Add [mm:ss.xx] timestamps in LRC format to follow along with playback.';
  lyricsContainer.innerHTML = lyricLines.map((line, index) =>
    `<p class="track-lyric-line${line.time === null ? '' : ' is-timed'}" data-lyric-index="${index}">${escapeHtml(line.text)}</p>`
  ).join('');
}

function updateActiveLyric() {
  const timedLines = lyricLines
    .map((line, index) => ({ ...line, index }))
    .filter((line) => line.time !== null && line.time <= audio.currentTime);
  const nextIndex = timedLines.length ? timedLines[timedLines.length - 1].index : -1;
  if (nextIndex === activeLyricIndex) return;
  lyricsContainer.querySelector('.track-lyric-line.active')?.classList.remove('active');
  activeLyricIndex = nextIndex;
  if (activeLyricIndex < 0) return;
  const activeLine = lyricsContainer.querySelector(`[data-lyric-index="${activeLyricIndex}"]`);
  activeLine?.classList.add('active');
  activeLine?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadTrack() {
  const loading = document.getElementById('trackLoading');
  const detail = document.getElementById('trackDetail');
  const error = document.getElementById('trackError');
  if (!trackId) throw new Error('No track was selected. Return to the music page and choose a track.');

  const response = await fetch(`${window.location.origin}/api/tracks/${encodeURIComponent(trackId)}`);
  const track = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(track.error || `Could not load track (HTTP ${response.status}).`);

  document.title = `${track.title || 'Track details'} - Box Music`;
  const cover = document.getElementById('detailCover');
  cover.src = resolveMediaUrl(track.coverArtUrl) || 'Image/Logo.jpg';
  cover.alt = `${track.title || 'Track'} cover art`;
  document.getElementById('detailTitle').textContent = track.title || 'Untitled track';
  document.getElementById('detailArtist').textContent = track.artist || 'Unknown artist';
  document.getElementById('detailProducer').textContent = track.producer || 'Not provided';
  document.getElementById('detailAlbum').textContent = track.album || 'Not provided';
  document.getElementById('detailGenre').textContent = track.genre || 'Not provided';
  audio.src = resolveMediaUrl(track.audioUrl);
  renderLyrics(track.lyrics);
  loading.classList.add('d-none');
  error.classList.add('d-none');
  detail.classList.remove('d-none');
}

playButton.addEventListener('click', async () => {
  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      document.getElementById('trackError').textContent = `Could not play this track: ${error.message}`;
      document.getElementById('trackError').classList.remove('d-none');
    }
  } else {
    audio.pause();
  }
});

audio.addEventListener('play', () => {
  playButton.innerHTML = '<i class="fa-solid fa-pause me-2"></i>Pause track';
});
audio.addEventListener('pause', () => {
  playButton.innerHTML = '<i class="fa-solid fa-play me-2"></i>Play track';
});
audio.addEventListener('loadedmetadata', () => {
  duration.textContent = formatTime(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  currentTime.textContent = formatTime(audio.currentTime);
  if (!isSeeking && Number.isFinite(audio.duration) && audio.duration > 0) {
    seek.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
  }
  updateActiveLyric();
});
seek.addEventListener('input', () => {
  isSeeking = true;
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
  }
});
seek.addEventListener('change', () => {
  isSeeking = false;
  updateActiveLyric();
});
audio.addEventListener('error', () => {
  const error = document.getElementById('trackError');
  error.textContent = 'The audio file could not be loaded. Check the track audio URL.';
  error.classList.remove('d-none');
});

loadTrack().catch((error) => {
  document.getElementById('trackLoading').classList.add('d-none');
  const errorBox = document.getElementById('trackError');
  errorBox.textContent = error.message;
  errorBox.classList.remove('d-none');
});
