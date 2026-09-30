require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const initUploadDirs = require('./config/initDirs');
const trackRoutes = require('./routes/track.route');
const authRoutes = require('./routes/auth.route');
const seedAdmin = require('./config/seedAdmin');
const app = express();

connectDB().then(() => seedAdmin());
initUploadDirs();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);

// Return JSON (not HTML) for unknown API routes so frontend res.json() never gets <!DOCTYPE
app.use('/api', (req, res) => res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` }));

app.use(express.static(path.join(__dirname, 'main')));

app.get('/', (req, res) => {res.sendFile(path.join(__dirname, 'main', 'Main.html'));
});
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port http:localhost:${PORT}`));