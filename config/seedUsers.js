require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./db');
const User = require('../models/user');

const DUMMY_PASSWORD = 'UserDemo@$1';

const daysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

// 3 users that look like they registered / visited the site weeks ago
const dummyUsers = [
  {
    fullName: 'Sophia Carter',
    username: 'sophia.carter',
    email: 'sophia.carter@example.com',
    phoneNumber: '0123456781',
    avatarUrl: '',
    role: 'user',
    isVerified: true,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(3)
  },
  {
    fullName: 'Liam Nguyen',
    username: 'liam.nguyen',
    email: 'liam.nguyen@example.com',
    phoneNumber: '0123456782',
    avatarUrl: '',
    role: 'user',
    isVerified: true,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(7)
  },
  {
    fullName: 'Olivia Tran',
    username: 'olivia.tran',
    email: 'olivia.tran@example.com',
    phoneNumber: '0123456783',
    avatarUrl: '',
    role: 'user',
    isVerified: true,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(1)
  }
];

const seedUsers = async () => {
  try {
    await connectDB();

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DUMMY_PASSWORD, salt);

    let inserted = 0;
    let skipped = 0;

    for (const dummy of dummyUsers) {
      const exists = await User.findOne({
        $or: [{ email: dummy.email }, { username: dummy.username }]
      });
      if (exists) {
        console.log(`Skip (already exists): ${dummy.email}`);
        skipped += 1;
        continue;
      }
      // Explicit createdAt/updatedAt so they look like past visitors, not fresh seeds
      // (schema has timestamps:true, but explicit values are preserved).
      await User.create({ ...dummy, password: hashedPassword });
      console.log(`Inserted: ${dummy.email}`);
      inserted += 1;
    }

    console.log(`Seed users done: ${inserted} inserted, ${skipped} skipped. Password for all dummies: ${DUMMY_PASSWORD}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed users failure:', err.message);
    try { await mongoose.disconnect(); } catch { /* ignore */ }
    process.exit(1);
  }
};

seedUsers();
