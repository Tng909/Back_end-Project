const mongoose = require('mongoose');
const Track = require('../models/track');
const { api, registerAndLogin, createAdmin, waitForDb } = require('./helpers');

jest.setTimeout(20000);

let adminToken;
let userToken;
let sampleTrackId;

beforeAll(async () => {
  await waitForDb(mongoose);
  await Track.deleteMany({});
  adminToken = (await createAdmin('trackadmin')).token;
  userToken = (await registerAndLogin('trackuser')).token;
  const t = await Track.create({
    title: 'Billie Jean',
    artist: 'Michael Jackson',
    genre: 'Pop',
    album: 'Thriller',
    audioUrl: '/uploads/audio/billie-jean.mp3'
  });
  sampleTrackId = t._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('GET /api/tracks', () => {
  test('lists tracks publicly (no auth)', async () => {
    const res = await api().get('/api/tracks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('filters by search query and escapes regex characters', async () => {
    const hit = await api().get('/api/tracks').query({ search: 'billie' });
    expect(hit.status).toBe(200);
    expect(hit.body.some((t) => t.title === 'Billie Jean')).toBe(true);

    // A search string full of regex metacharacters must not crash the server.
    const evil = await api().get('/api/tracks').query({ search: '.*+?(^$' });
    expect(evil.status).toBe(200);
  });

  test('lists distinct artists with counts (for the Artist Album dropdown)', async () => {
    const res = await api().get('/api/tracks/artists');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((a) => a.name === 'Michael Jackson' && a.count >= 1)).toBe(true);
  });

  test('paginates when page/limit are provided', async () => {
    const res = await api().get('/api/tracks').query({ page: 1, limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pages: expect.any(Number), total: expect.any(Number) });
    expect(res.body.items.length).toBeLessThanOrEqual(1);
  });
});

describe('POST /api/tracks (admin only)', () => {
  test('401 without a token', async () => {
    const res = await api().post('/api/tracks').send({ title: 'X', artist: 'Y', audioUrl: '/a.mp3' });
    expect(res.status).toBe(401);
  });

  test('403 for a logged-in non-admin', async () => {
    const res = await api()
      .post('/api/tracks')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'X', artist: 'Y', audioUrl: '/a.mp3' });
    expect(res.status).toBe(403);
  });

  test('201 for admin (URL-based upload path)', async () => {
    const res = await api()
      .post('/api/tracks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Shape of You', artist: 'Ed Sheeran', genre: 'Pop', audioUrl: '/uploads/audio/shape.mp3' });
    expect(res.status).toBe(201);
    expect(res.body._id).toBeTruthy();
    expect(res.body.title).toBe('Shape of You');
  });

  test('400 when no audio file or URL is given', async () => {
    const res = await api()
      .post('/api/tracks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'No Audio', artist: 'Nobody' });
    expect(res.status).toBe(400);
  });
});

describe('PUT/DELETE /api/tracks/:id (admin only)', () => {
  test('admin can update and delete; deleted track then 404s', async () => {
    const upd = await api()
      .put(`/api/tracks/${sampleTrackId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Billie Jean (Remastered)' });
    expect(upd.status).toBe(200);
    expect(upd.body.title).toBe('Billie Jean (Remastered)');

    const del = await api()
      .delete(`/api/tracks/${sampleTrackId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const gone = await api().get(`/api/tracks/${sampleTrackId}`);
    expect(gone.status).toBe(404);
  });

  test('non-admin cannot delete', async () => {
    const t = await Track.create({ title: 'Guarded', artist: 'A', audioUrl: '/g.mp3' });
    const res = await api()
      .delete(`/api/tracks/${t._id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(await Track.findById(t._id)).not.toBeNull();
  });
});
