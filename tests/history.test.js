const mongoose = require('mongoose');
const Track = require('../models/track');
const History = require('../models/history');
const Favorite = require('../models/favorite');
const { api, registerAndLogin, createAdmin, waitForDb } = require('./helpers');

jest.setTimeout(20000);

let alice;
let bob;
let t1;
let t2;

beforeAll(async () => {
  await waitForDb(mongoose);
  await History.deleteMany({});
  await Track.deleteMany({});
  alice = await registerAndLogin('hisA');
  bob = await registerAndLogin('hisB');
  t1 = await Track.create({ title: 'Play One', artist: 'A', audioUrl: '/1.mp3' });
  t2 = await Track.create({ title: 'Play Two', artist: 'B', audioUrl: '/2.mp3' });
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('play history', () => {
  test('401 without a token', async () => {
    expect((await api().get('/api/history')).status).toBe(401);
    expect((await api().post(`/api/history/${t1._id}`)).status).toBe(401);
  });

  test('record plays -> newest first with track populated', async () => {
    expect((await api().post(`/api/history/${t1._id}`).set('Authorization', `Bearer ${alice.token}`)).status).toBe(201);
    expect((await api().post(`/api/history/${t2._id}`).set('Authorization', `Bearer ${alice.token}`)).status).toBe(201);

    const list = await api().get('/api/history').set('Authorization', `Bearer ${alice.token}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
    expect(list.body[0].track.title).toBe('Play Two'); // newest first
    expect(list.body[0]).toHaveProperty('createdAt');
  });

  test('limit param caps the result', async () => {
    const list = await api().get('/api/history').query({ limit: 1 }).set('Authorization', `Bearer ${alice.token}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
  });

  test('repeated plays of the same track are all logged', async () => {
    await api().post(`/api/history/${t1._id}`).set('Authorization', `Bearer ${bob.token}`);
    await api().post(`/api/history/${t1._id}`).set('Authorization', `Bearer ${bob.token}`);
    const list = await api().get('/api/history').set('Authorization', `Bearer ${bob.token}`);
    expect(list.body.length).toBe(2);
    expect(list.body.every((h) => h.track._id === t1._id.toString())).toBe(true);
  });

  test('404 when recording a nonexistent track', async () => {
    const res = await api().post('/api/history/aaaaaaaaaaaaaaaaaaaaaaaa').set('Authorization', `Bearer ${alice.token}`);
    expect(res.status).toBe(404);
  });

  test('remove one track from history, then clear the rest', async () => {
    await api().delete(`/api/history/${t2._id}`).set('Authorization', `Bearer ${alice.token}`);
    const afterRemove = await api().get('/api/history').set('Authorization', `Bearer ${alice.token}`);
    expect(afterRemove.body.some((h) => h.track._id === t2._id.toString())).toBe(false);

    const clear = await api().delete('/api/history').set('Authorization', `Bearer ${alice.token}`);
    expect(clear.status).toBe(200);
    const afterClear = await api().get('/api/history').set('Authorization', `Bearer ${alice.token}`);
    expect(afterClear.body.length).toBe(0);
  });

  test("history is private per user (bob's clear doesn't touch alice's)", async () => {
    await api().post(`/api/history/${t1._id}`).set('Authorization', `Bearer ${alice.token}`);
    await api().delete('/api/history').set('Authorization', `Bearer ${bob.token}`);
    const aliceList = await api().get('/api/history').set('Authorization', `Bearer ${alice.token}`);
    expect(aliceList.body.length).toBeGreaterThan(0);
  });
});

describe('referential integrity', () => {
  test('deleting a track purges it from favorites and history', async () => {
    const admin = await createAdmin('hisAdmin');
    const doomed = await Track.create({ title: 'Doomed', artist: 'X', audioUrl: '/d.mp3' });
    const doomedId = doomed._id.toString();

    await api().post(`/api/favorites/${doomedId}`).set('Authorization', `Bearer ${alice.token}`);
    await api().post(`/api/history/${doomedId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(await Favorite.countDocuments({ track: doomedId })).toBe(1);
    expect(await History.countDocuments({ track: doomedId })).toBe(1);

    const del = await api().delete(`/api/tracks/${doomedId}`).set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(200);

    expect(await Favorite.countDocuments({ track: doomedId })).toBe(0);
    expect(await History.countDocuments({ track: doomedId })).toBe(0);
  });
});
