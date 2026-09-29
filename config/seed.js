require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db');
const Track = require('../models/track');

const sampleTracks = [
  {
    title: 'Billie Jean',
    artist: 'Michael Jackson',
    album: 'Thriller',
    genre: 'Pop',
    durationSec: 294,
    audioUrl: '/record/Billie Jean_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/BillieJean.jpg'
  },
  {
    title: 'Die With A Smile',
    artist: 'Lady Gaga & Bruno Mars',
    album: 'Die With A Smile',
    genre: 'Pop',
    durationSec: 251,
    audioUrl: '/record/Die With A Smile_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/DieWithASmile.jpg'
  },
  {
    title: 'Treat You Better',
    artist: 'Shawn Mendes',
    album: 'Illuminate',
    genre: 'Pop',
    durationSec: 199,
    audioUrl: '/record/Treat You Better_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/TreatYouBetter.jpg'
  },
  {
    title: 'Unwelcome School',
    artist: 'Blue Archive OST',
    album: 'Unwelcome School',
    genre: 'Anime',
    durationSec: 212,
    audioUrl: '/record/Unwelcome School_spotdown.org.mp3',
    coverArtUrl: '/Image/Cover_photo/UnwelcomeSchool.jpg'
  },
  {
    title: "Voyaging Star's Farewell",
    artist: 'Wuthering Wave OST',
    album: "Voyaging Star's Farewell",
    genre: 'Soundtrack',
    durationSec: 230,
    audioUrl: "/record/Voyaging Star's Farewell_spotdown.org.mp3",
    coverArtUrl: '/Image/Cover_photo/VoyagingStarFarewell.jpg'
  }
];

const seedDB = async () => {
  try {
    await connectDB();
    await Track.deleteMany({});
    await Track.insertMany(sampleTracks);
    console.log('Seed success: Dummy tracks inserted');
    process.exit(0);
  } catch (err) {
    console.error('Seed failure:', err.message);
    process.exit(1);
  }
};

seedDB();