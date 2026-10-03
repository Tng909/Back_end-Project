require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

const seedAdmin = async () => {
  try {
    const adminEmailRaw = 'Admin@ex.com';
    const adminEmail = adminEmailRaw.toLowerCase();
    const adminPass = 'AdminExPLE@$1';

    const exists = await User.findOne({
      $or: [{ email: adminEmail }, { username: 'admin' }]
    });
    if (!exists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(adminPass, salt);

      const admin = new User({
        fullName: 'System Administrator',
        username: 'admin',
        email: adminEmail,
        password: hashedPassword,
        phoneNumber: '0000000000',
        role: 'admin'
      });

      await admin.save();
      console.log('Admin seeded: admin@ex.com');
    } else if (exists.email && exists.email !== exists.email.toLowerCase()) {
      // Heal rows seeded before the lowercase fix (mongoose lowercase:true only
      // applies on .save(), never on queries) so email login works.
      exists.email = exists.email.toLowerCase();
      await exists.save();
      console.log('Admin email normalized to lowercase: admin@ex.com');
    }
  } catch (err) {
    console.error('Admin seed err:', err.message);
  }
};

module.exports = seedAdmin;