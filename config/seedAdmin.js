require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

const seedAdmin = async () => {
  try {
    const adminEmail = 'Admin@ex.com';
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
      console.log('Admin seeded: Admin@ex.com');
    }
  } catch (err) {
    console.error('Admin seed err:', err.message);
  }
};

module.exports = seedAdmin;