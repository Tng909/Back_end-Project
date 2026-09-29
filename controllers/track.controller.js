const Track = require('../models/track');

exports.getAllTracks = async (req, res) => {
  try {
    const {
      genre,
      artist
    } = req.query;
    const filter = {};
    if (genre) filter.genre = genre;
    if (artist) filter.artist = new RegExp(artist, 'i');

    const tracks = await Track.find(filter);
    res.json(tracks);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
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
    const { title, artist, album, genre, durationSec } = req.body;
    
    const audioUrl = req.files?.audio ? `/uploads/audio/${req.files.audio[0].filename}` : req.body.audioUrl;
    const coverArtUrl = req.files?.cover ? `/uploads/covers/${req.files.cover[0].filename}` : req.body.coverArtUrl;

    if (!audioUrl) {
      return res.status(400).json({ error: 'Audio file or URL is required.' });
    }

    const track = new Track({
      title,
      artist,
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
    const updated = await Track.findByIdAndUpdate(req.params.id, req.body, {
      new: true
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
    res.json({
      message: 'Track deleted'
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};