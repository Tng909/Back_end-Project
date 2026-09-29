const fs = require('fs');
const path = require('path');

const initUploadDirs = () => {
  const dirs = ['uploads/audio', 'uploads/covers'];
  dirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
};

module.exports = initUploadDirs;