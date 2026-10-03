const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format.']
    },
    password: {
        type: String,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    avatarUrl: {
        type: String,
        default: ''
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isVerified: {
        type: Boolean,
        default: true
    },
    isEmailConfirmed: {
        type: Boolean,
        default: false
    },
    emailConfirmTokenHash: {
        type: String,
        select: false
    },
    emailConfirmTokenExpires: {
        type: Date,
        select: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);