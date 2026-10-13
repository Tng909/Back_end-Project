require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./db');
const User = require('../models/user');
const Track = require('../models/track');
const Playlist = require('../models/playlist');

// Extra demo tracks so 5 playlists x 3 tracks can be distinct-ish.
// Reuses your /record + /Image/Cover_photo conventions from config/seed.js.
const extraTracks = [
  {
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    album: 'Whenever You Need Somebody',
    genre: 'Pop',
    durationSec: 213,
    audioUrl: '/record/Never Gonna Give You Up_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/NeverGonnaGiveYouUp.jpg',
  },
  {
    title: 'Take Me Home, Country Roads',
    artist: 'John Denver',
    album: 'Poems, Prayers & Promises',
    genre: 'Soundtrack',
    durationSec: 190,
    audioUrl: '/record/Take Me Home, Country Roads_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/CountryRoads.jpg',
  },
  {
    title: "Girls' Legend U",
    artist: 'Uma Musume',
    album: "Girls' Legend U",
    genre: 'Anime',
    durationSec: 225,
    audioUrl: "/record/GIRLS' LEGEND U_spotdown.org.mp3",
    coverArtUrl: '/Image/Cover_photo/GirlsLegendU.jpg',
  },
  {
    title: 'Die With A Smile (Live)',
    artist: 'Lady Gaga & Bruno Mars',
    album: 'Live Sessions',
    genre: 'Pop',
    durationSec: 258,
    audioUrl: '/record/Die With A Smile_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/DieWithASmile.jpg',
  },
  {
    title: 'Unwelcome School (Remix)',
    artist: 'Blue Archive OST',
    album: 'Remix Collection',
    genre: 'Anime',
    durationSec: 198,
    audioUrl: '/record/Unwelcome School_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/UnwelcomeSchool.jpg',
  },
];

// 5 example playlists, each referencing 3 example tracks by title.
// Titles must exist after seed.js + the extraTracks above run.
const examplePlaylists = [
  {
    name: 'Pop Hits Daily',
    description: 'Today\'s pop essentials — sing along from the first chorus.',
    tracks: ['Billie Jean', 'Die With A Smile', 'Treat You Better'],
  },
  {
    name: 'Anime Energy',
    description: 'High-tempo anime openers for workouts and grinding ranked.',
    tracks: ['Unwelcome School', "Girls' Legend U", 'Unwelcome School (Remix)'],
  },
  {
    name: 'Chill Evenings',
    description: 'Mellow sunset vibes, windows down, volume just right.',
    tracks: ['Take Me Home, Country Roads', "Voyaging Star's Farewell", 'Treat You Better'],
  },
  {
    name: 'Throwback Party',
    description: 'Floor-fillers everyone knows the words to.',
    tracks: ['Never Gonna Give You Up', 'Billie Jean', 'Die With A Smile (Live)'],
  },
  {
    name: 'Epic Soundtracks',
    description: 'Cinematic scores for studying, coding, and boss fights.',
    tracks: ["Voyaging Star's Farewell", 'Take Me Home, Country Roads', 'Unwelcome School'],
  },
];

const seedPlaylists = async () => {
  try {
    await connectDB();

    // 1. Owner: a demo listener account (playlists require a user ref).
    let owner = await User.findOne({ username: 'demo.listener' });
    if (!owner) {
      const salt = await bcrypt.genSalt(10);
      owner = await User.create({
        fullName: 'Demo Listener',
        username: 'demo.listener',
        email: 'demo.listener@example.com',
        password: await bcrypt.hash('DemoListener@$1', salt),
        phoneNumber: '0123456799',
        role: 'user',
        isVerified: true,
        isEmailConfirmed: true,
      });
      console.log('Owner created: demo.listener@example.com');
    }

    // 2. Ensure the library has every track the playlists reference.
    const baseTitles = await Track.distinct('title');
    const missing = extraTracks.filter((t) => !baseTitles.includes(t.title));
    if (missing.length) {
      await Track.insertMany(missing);
      console.log(`Extra demo tracks inserted: ${missing.length}`);
    }

    const byTitle = {};
    for (const t of await Track.find({}).lean()) byTitle[t.title] = t._id;

    // 3. Upsert the 5 example playlists (idempotent — safe to re-run).
    let created = 0;
    let updated = 0;
    for (const pl of examplePlaylists) {
      const ids = pl.tracks.map((title) => byTitle[title]).filter(Boolean);
      if (ids.length !== 3) {
        console.warn(`Skip "${pl.name}": only ${ids.length}/3 tracks found. Run "npm run seed" first.`);
        continue;
      }
      const existing = await Playlist.findOne({ name: pl.name, user: owner._id });
      if (existing) {
        existing.tracks = ids;
        existing.description = pl.description;
        await existing.save();
        updated += 1;
      } else {
        await Playlist.create({ name: pl.name, description: pl.description, user: owner._id, tracks: ids });
        created += 1;
      }
    }

    console.log(`Seed playlists done: ${created} created, ${updated} updated (owner: demo.listener).`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed playlists failure:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
  }
};

seedPlaylists();
