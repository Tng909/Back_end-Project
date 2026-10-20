const mongoose = require('mongoose');
const Track = require('../models/track');
const Favorite = require('../models/favorite');
const { api, registerAndLogin, waitForDb } = require('./helpers');

jest.setTimeout(20000);

let alice;
let bob;
let trackId;
let otherTrackId;

beforeAll(async () => {
  await waitForDb(mongoose);
  await Favorite.deleteMany({});
  await Track.deleteMany({});
  alice = await registerAndLogin('favA');
  bob = await registerAndLogin('favB');
  const t1 = await Track.create({ title: 'Fav One', artist: 'A', audioUrl: '/1.mp3' });
  const t2 = await Track.create({ title: 'Fav Two', artist: 'B', audioUrl: '/2.mp3' });
  trackId = t1._id.toString();
  otherTrackId = t2._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('favorites', () => {
  test('401 without a token', async () => {
    expect((await api().get('/api/favorites')).status).toBe(401);
    expect((await api().post(`/api/favorites/${trackId}`)).status).toBe(401);
  });

  test('like -> listed -> ids -> check true', async () => {
    const like = await api().post(`/api/favorites/${trackId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(like.status).toBe(201);

    const list = await api().get('/api/favorites').set('Authorization', `Bearer ${alice.token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((t) => t._id === trackId)).toBe(true);

    const ids = await api().get('/api/favorites/ids').set('Authorization', `Bearer ${alice.token}`);
    expect(ids.body).toContain(trackId);

    const chk = await api().get(`/api/favorites/check/${trackId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(chk.body.favorited).toBe(true);
  });

  test('duplicate like is idempotent (unique index keeps one row)', async () => {
    const again = await api().post(`/api/favorites/${trackId}`).set('Authorization', `Bearer ${alice.token}`);
    expect([200, 201]).toContain(again.status);
    const count = await Favorite.countDocuments({ user: alice.user.id, track: trackId });
    expect(count).toBe(1);
  });

  test('unlike removes it', async () => {
    const del = await api().delete(`/api/favorites/${trackId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(del.status).toBe(200);
    const chk = await api().get(`/api/favorites/check/${trackId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(chk.body.favorited).toBe(false);
  });

  test('404 when liking a nonexistent track', async () => {
    const res = await api()
      .post('/api/favorites/aaaaaaaaaaaaaaaaaaaaaaaa')
      .set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(404);
  });

  test('400 on an invalid track id', async () => {
    const res = await api().post('/api/favorites/not-an-id').set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(400);
  });

  test("favorites are private per user (bob can't see or remove alice's)", async () => {
    await api().post(`/api/favorites/${otherTrackId}`).set('Authorization', `Bearer ${alice.token}`);

    const bobList = await api().get('/api/favorites').set('Authorization', `Bearer ${bob.token}`);
    expect(bobList.body.some((t) => t._id === otherTrackId)).toBe(false);

    // Bob removing Alice's favorite is a no-op for Alice (scoped by user).
    await api().delete(`/api/favorites/${otherTrackId}`).set('Authorization', `Bearer ${bob.token}`);
    const aliceChk = await api().get(`/api/favorites/check/${otherTrackId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(aliceChk.body.favorited).toBe(true);
  });
});
