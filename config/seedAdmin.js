require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

const seedAdmin = async () => {
  try {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'truongtung4142@gmail.com').trim().toLowerCase();
    // Password comes from env; the literal below is only a dev fallback so
    // existing local setups keep working. Override via ADMIN_PASSWORD in .env.
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminExPLE@$1';

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
      console.log(`Admin seeded: ${adminEmail}`);
    } else if (exists.username === 'admin' && exists.email !== adminEmail) {
      const emailOwner = await User.findOne({ email: adminEmail, _id: { $ne: exists._id } });
      if (emailOwner) {
        throw new Error(`Cannot update admin email: ${adminEmail} is already assigned to another account.`);
      }
      exists.email = adminEmail;
      await exists.save();
      console.log(`Admin email updated: ${adminEmail}`);
    } else if (exists.email && exists.email !== exists.email.toLowerCase()) {
      // Heal rows seeded before the lowercase fix (mongoose lowercase:true only
      // applies on .save(), never on queries) so email login works.
      exists.email = exists.email.toLowerCase();
      await exists.save();
      console.log(`Admin email normalized to lowercase: ${exists.email}`);
    }
  } catch (err) {
    console.error('Admin seed err:', err.message);
  }
};

module.exports = seedAdmin;