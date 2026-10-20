const mongoose = require('mongoose');
const Playlist = require('../models/playlist');
const Track = require('../models/track');
const User = require('../models/user');
const { api, registerAndLogin, createAdmin, waitForDb } = require('./helpers');

jest.setTimeout(20000);

let alice; // owner
let bob; // a different user
let trackId;

beforeAll(async () => {
  await waitForDb(mongoose);
  await Playlist.deleteMany({});
  await Track.deleteMany({});
  alice = await registerAndLogin('alice');
  bob = await registerAndLogin('bob');
  const t = await Track.create({ title: 'Test Song', artist: 'Tester', audioUrl: '/t.mp3' });
  trackId = t._id.toString();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('POST /api/playlists', () => {
  test('401 without a token', async () => {
    const res = await api().post('/api/playlists').send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });

  test('owner always comes from the JWT, not the request body', async () => {
    const res = await api()
      .post('/api/playlists')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'Alice Mix', description: 'demo', user: bob.user.id }); // spoof attempt
    expect(res.status).toBe(201);
    expect(res.body.user).toBe(alice.user.id); // spoofed owner ignored
  });

  test('400 when name is missing', async () => {
    const res = await api()
      .post('/api/playlists')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ description: 'nameless' });
    expect(res.status).toBe(400);
  });
});

describe('playlist ownership', () => {
  let playlistId;

  beforeAll(async () => {
    const res = await api()
      .post('/api/playlists')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'Ownership Tests' });
    playlistId = res.body._id;
  });

  test('owner can add and remove tracks', async () => {
    const added = await api()
      .post(`/api/playlists/${playlistId}/tracks`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ tracks: [trackId] });
    expect(added.status).toBe(200);
    expect(added.body.tracks.some((t) => t._id === trackId)).toBe(true);

    const removed = await api()
      .delete(`/api/playlists/${playlistId}/tracks/${trackId}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(removed.status).toBe(200);
    expect(removed.body.tracks.some((t) => t._id === trackId)).toBe(false);
  });

  test('non-owner gets 403 on update/delete (admin bypass exists but is not used here)', async () => {
    const upd = await api()
      .put(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ name: 'Hijacked' });
    expect(upd.status).toBe(403);

    const del = await api()
      .delete(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(del.status).toBe(403);

    // Playlist still exists and keeps its original name.
    const still = await Playlist.findById(playlistId);
    expect(still).not.toBeNull();
    expect(still.name).toBe('Ownership Tests');
  });

  test('a demoted admin cannot use an old token to bypass playlist ownership', async () => {
    const admin = await createAdmin('demotedplaylistadmin');
    await User.updateOne({ _id: admin.user.id }, { role: 'user' });

    const response = await api()
      .put(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Hijacked after demotion' });

    expect(response.status).toBe(403);
    expect((await Playlist.findById(playlistId)).name).toBe('Ownership Tests');
  });

  test('owner can delete their playlist; then it 404s publicly', async () => {
    const del = await api()
      .delete(`/api/playlists/${playlistId}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(del.status).toBe(200);
    const gone = await api().get(`/api/playlists/${playlistId}`);
    expect(gone.status).toBe(404);
  });
});
