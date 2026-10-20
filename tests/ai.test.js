const mongoose = require('mongoose');
const Track = require('../models/track');
const { api, waitForDb } = require('./helpers');

jest.setTimeout(20000);

// 24-char Mongo ObjectId — must never appear in the visible chat prose.
const OBJECT_ID_RE = /[a-f0-9]{24}/i;

let trackId;
let collectionTrackId;

beforeAll(async () => {
  await waitForDb(mongoose);
  await Track.deleteMany({});
  const t = await Track.create({ title: 'Billie Jean', artist: 'Michael Jackson', genre: 'Pop', audioUrl: '/bj.mp3' });
  trackId = t._id.toString();
  const collectionTrack = await Track.create({
    title: 'Billie Jean Live',
    artist: 'Michael Jackson',
    genre: 'Pop',
    audioUrl: '/bj-live.mp3'
  });
  collectionTrackId = collectionTrack._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('AI chat hides internal ids', () => {
  test('search reply prose contains no raw id, but the card payload still carries a playable id', async () => {
    const res = await api().post('/api/ai/chat').send({ message: 'find Billie Jean' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('local');

    // The visible prose names the song but leaks NO database id.
    expect(res.body.reply).toContain('Billie Jean');
    expect(res.body.reply).not.toMatch(OBJECT_ID_RE);

    // The playable cards are still fully functional (id present for the player).
    expect(Array.isArray(res.body.tracks)).toBe(true);
    expect(res.body.tracks.length).toBeGreaterThan(0);
    expect(res.body.tracks.some((t) => t._id === trackId)).toBe(true);
  });

  test('no reply path leaks an id (help / surprise / genre)', async () => {
    for (const message of ['help', 'surprise me', 'what genres do you have?']) {
      const res = await api().post('/api/ai/chat').send({ message });
      expect(res.status).toBe(200);
      expect(res.body.reply).not.toMatch(OBJECT_ID_RE);
    }
  });

  test('chat searches and recommends only songs from the active collection', async () => {
    const found = await api().post('/api/ai/chat').send({
      message: 'find Billie Jean',
      library: { source: 'liked', trackIds: [collectionTrackId] }
    });
    expect(found.status).toBe(200);
    expect(found.body.tracks.map((track) => track._id)).toEqual([collectionTrackId]);
    expect(found.body.reply).toContain('Billie Jean Live');

    const listed = await api().post('/api/ai/chat').send({
      message: 'show songs in my liked songs',
      library: { source: 'liked', trackIds: [collectionTrackId] }
    });
    expect(listed.status).toBe(200);
    expect(listed.body.tracks.map((track) => track._id)).toEqual([collectionTrackId]);
  });

  test('an empty active collection does not fall back to unrelated catalog songs', async () => {
    const res = await api().post('/api/ai/chat').send({
      message: 'surprise me',
      library: { source: 'history', trackIds: [] }
    });
    expect(res.status).toBe(200);
    expect(res.body.reply).toContain('your listening history');
    expect(res.body.tracks).toEqual([]);
  });

  test('scrubIds strips a hallucinated id from Gemini-style output', async () => {
    // Unit-check the helper the Gemini path relies on.
    const { scrubIds } = require('../controllers/ai.controller');
    const dirty = 'Try "Billie Jean" (id: 6abd ba14635465f979a9d8ef) or "Thriller".';
    const clean = scrubIds(dirty);
    expect(clean).not.toMatch(OBJECT_ID_RE);
    expect(clean).toContain('Billie Jean');
  });
});
