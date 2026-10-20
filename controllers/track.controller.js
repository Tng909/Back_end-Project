const Track = require('../models/track');
const Favorite = require('../models/favorite');
const History = require('../models/history');

exports.getAllTracks = async (req, res) => {
  try {
    const {
      genre,
      artist,
      search,
      limit,
      page,
      sort
    } = req.query;
    const filter = {};
    if (genre) filter.genre = genre;
    if (artist) filter.artist = new RegExp(artist, 'i');
    // Full-text-ish search across title/artist/album (escaped, case-insensitive).
    if (search && String(search).trim()) {
      const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [{ title: rx }, { artist: rx }, { album: rx }, { producer: rx }];
    }

    // Optional pagination: ?page=1&limit=20 returns { items, total, page, pages }.
    // Without page/limit the response stays a plain array (backward compatible
    // with every existing frontend caller: app.js, admin.js, playlist.html).
    const wantsPagination = page !== undefined || limit !== undefined;
    const sortMap = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, title: { title: 1 }, plays: { playCount: -1 } };
    const sortSpec = sortMap[String(sort || '')] || { createdAt: -1 };

    if (!wantsPagination) {
      const tracks = await Track.find(filter).sort(sortSpec);
      return res.json(tracks);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const [items, total] = await Promise.all([
      Track.find(filter).sort(sortSpec).skip((pageNum - 1) * limitNum).limit(limitNum),
      Track.countDocuments(filter)
    ]);
    res.json({ items, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};

exports.getGenres = async (req, res) => {
  try {
    // Distinct non-empty genres straight from the tracks collection,
    // so the admin filter always matches what is actually in the DB
    // (config/seed.js currently seeds: Pop, Anime, Soundtrack).
    const genres = await Track.distinct('genre');
    res.json(genres.filter(Boolean).sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getArtists = async (req, res) => {
  try {
    // Distinct artists with song counts + a representative cover, so the
    // sidebar "Artist Album" dropdown and the artist page can render
    // without downloading every track first.
    const artists = await Track.aggregate([
      { $match: { artist: { $ne: null } } },
      {
        $group: {
          _id: '$artist',
          count: { $sum: 1 },
          cover: { $first: '$coverArtUrl' }
        }
      },
      { $project: { _id: 0, name: '$_id', count: 1, cover: 1 } },
      { $sort: { name: 1 } }
    ]);
    res.json(artists.filter((a) => a.name && String(a.name).trim()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTrackById = async (req, res) => {
  try {
    const track = await Track.findById(req.params.id);
    if (!track) return res.status(404).json({
      error: 'Track not found'
    });
    res.json(track);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};

exports.createTrack = async (req, res) => {
  try {
    const { title, artist, producer, lyrics, album, genre, durationSec } = req.body;
    
    const audioUrl = req.files?.audio ? `/uploads/audio/${req.files.audio[0].filename}` : req.body.audioUrl;
    const coverArtUrl = req.files?.cover ? `/uploads/covers/${req.files.cover[0].filename}` : req.body.coverArtUrl;

    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio file or URL is required.' });
    }

    const track = new Track({
      title,
      artist,
      producer,
      lyrics,
      album,
      genre,
      durationSec,
      audioUrl,
      coverArtUrl
    });

    await track.save();
    res.status(201).json(track);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
exports.updateTrack = async (req, res) => {
  try {
    const update = { ...(req.body || {}) };
    // Support multipart edit from song-edit.html (same field names as create).
    if (req.files?.audio) update.audioUrl = `/uploads/audio/${req.files.audio[0].filename}`;
    if (req.files?.cover) update.coverArtUrl = `/uploads/covers/${req.files.cover[0].filename}`;
    if (update.durationSec !== undefined && update.durationSec !== '') {
      update.durationSec = Number(update.durationSec);
    }
    const updated = await Track.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!updated) return res.status(404).json({
      error: 'Track not found'
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
};

exports.deleteTrack = async (req, res) => {
  try {
    const deleted = await Track.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({
      error: 'Track not found'
    });
    // Referential integrity: purge this track from every user's favorites and
    // history so no one is left with dangling references to a deleted track.
    await Promise.all([
      Favorite.deleteMany({ track: deleted._id }),
      History.deleteMany({ track: deleted._id })
    ]);
    res.json({
      message: 'Track deleted'
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};