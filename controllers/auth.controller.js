const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendWelcomeEmail } = require('../utils/sendEmail');

exports.register = async (req, res) => {
    try {
        let { fullName, username, email, password, confirmPassword, phoneNumber } = req.body || {};

        if (!fullName || !username || !email || !password || !confirmPassword || !phoneNumber) {
            return res.status(400).json({ error: 'All fields required.' });
        }
        fullName = String(fullName).trim();
        username = String(username).trim();
        email = String(email).trim().toLowerCase();
        phoneNumber = String(phoneNumber).trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }

        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or Email already taken.' });
        }

        // bcrypt: hash password before storing (login compares with bcrypt.compare).
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Optional confirm token — informational only, login is NEVER gated on it.
        const rawToken = crypto.randomBytes(32).toString('hex');
        const emailConfirmTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        const user = new User({
            fullName,
            username,
            email,
            password: hashedPassword,
            phoneNumber,
            role: 'user',
            isVerified: true,
            emailConfirmTokenHash,
            emailConfirmTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        await user.save();

        // Best-effort nodemailer email to the USER's own input address.
        // Wrong SMTP creds (535) only warn in console — register still returns 201.
        const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const confirmUrl = `${appUrl}/verify/verify-email.html?token=${rawToken}`;
        const mail = await sendWelcomeEmail(email, confirmUrl);

        res.status(201).json({
            message: mail.sent
                ? 'Registration successful. We sent a confirmation email — but you can log in right away.'
                : 'Registration successful. You can now log in.',
            emailSent: mail.sent,
            ...(mail.sent ? {} : { emailNote: 'Confirmation email not delivered (sender not configured or SMTP rejected it). Login still works.' })
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Username or Email already taken.' });
        }
        res.status(500).json({
            error: err.message
        });
    }
};

// Optional confirm endpoint: marks isEmailConfirmed=true. Informational only.
exports.confirmEmail = async (req, res) => {
    try {
        const token = String(req.body?.token || req.query?.token || '');
        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({ error: 'Confirmation link is invalid or expired.' });
        }
        const emailConfirmTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOneAndUpdate(
            { emailConfirmTokenHash, emailConfirmTokenExpires: { $gt: new Date() } },
            { $set: { isEmailConfirmed: true }, $unset: { emailConfirmTokenHash: 1, emailConfirmTokenExpires: 1 } },
            { new: true }
        );
        if (!user) return res.status(400).json({ error: 'Confirmation link is invalid or expired.' });
        res.json({ message: 'Email confirmed. Thanks! You can log in anytime.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


exports.login = async (req, res) => {
    try {
        let {
            identifier,
            password
        } = req.body; // identifier = username OR email

        if (!identifier || !password) {
            return res.status(400).json({
                error: 'Credentials required.'
            });
        }

        identifier = String(identifier).trim();
        if (!identifier) return res.status(400).json({ error: 'Credentials required.' });
        const looksLikeEmail = identifier.includes('@');

        // Match username OR email, case-insensitive, exact match.
        // NOTE: previously email was matched with exact lowercase only, so any
        // user stored with uppercase letters (e.g. seeded 'Admin@ex.com' —
        // mongoose `lowercase:true` does NOT apply to findOne queries) could
        // never log in by email, only by username. The $regex + $options:'i'
        // anchors (^...$) fix that for all existing + future rows.
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactCI = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });
        const user = await User.findOne(
            looksLikeEmail
                ? { $or: [{ email: exactCI(identifier) }, { username: exactCI(identifier) }] }
                : { $or: [{ email: exactCI(identifier) }, { username: identifier }] }
        );

        if (!user) return res.status(400).json({
            error: 'User not found.'
        });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({
            error: 'Invalid password.'
        });

        const token = jwt.sign({
                _id: user._id,
                role: user.role,
                username: user.username
            },
            process.env.JWT_SECRET || 'secretkey', {
                expiresIn: '1d'
            }
        );

        res.json({
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                username: user.username,
                email: user.email,
                phoneNumber: user.phoneNumber,
                avatarUrl: user.avatarUrl || '',
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ---- Admin: user management (dashboard table uses real DB, incl. seeded users) ----
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createUserByAdmin = async (req, res) => {
    try {
        let { fullName, username, email, password, phoneNumber, role } = req.body;
        if (!fullName || !username || !email || !password || !phoneNumber) {
            return res.status(400).json({ error: 'All fields required.' });
        }
        email = String(email).trim().toLowerCase();
        username = String(username).trim();
        const existing = await User.findOne({ $or: [{ email }, { username }] });
        if (existing) {
            return res.status(400).json({ error: 'Username or Email already taken.' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = new User({
            fullName: String(fullName).trim(),
            username,
            email,
            password: hashedPassword,
            phoneNumber: String(phoneNumber).trim(),
            role: role === 'admin' ? 'admin' : 'user',
            isVerified: true
        });
        await user.save();
        const plain = user.toObject();
        delete plain.password;
        res.status(201).json(plain);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Username or Email already taken.' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.updateUserByAdmin = async (req, res) => {
    try {
        const { fullName, username, email, phoneNumber, role, password } = req.body;
        const update = {};
        if (fullName !== undefined) update.fullName = String(fullName).trim();
        if (username !== undefined) update.username = String(username).trim();
        if (email !== undefined) update.email = String(email).trim().toLowerCase();
        if (phoneNumber !== undefined) update.phoneNumber = String(phoneNumber).trim();
        if (role !== undefined) update.role = role === 'admin' ? 'admin' : 'user';
        if (password) {
            const salt = await bcrypt.genSalt(10);
            update.password = await bcrypt.hash(password, salt);
        }
        if (update.email && !/^\S+@\S+\.\S+$/.test(update.email)) {
            return res.status(400).json({ error: 'Invalid email format.' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true
        }).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(user);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Username or Email already taken.' });
        }
        res.status(500).json({ error: err.message });
    }
};

// ---- Admin: user detail (for the dashboard View page) ----
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteUserByAdmin = async (req, res) => {
    try {
        // Prevent self-delete from dashboard
        if (String(req.params.id) === String(req.user._id)) {
            return res.status(400).json({ error: 'You cannot delete your own admin account.' });
        }
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        let { fullName, username, email, phoneNumber, avatarUrl } = req.body;

        if (!fullName && !username && !email && !phoneNumber && !avatarUrl && !req.file) {
            return res.status(400).json({ error: 'Nothing to update.' });
        }

        if (email) {
            email = String(email).trim().toLowerCase();
            if (!/^\S+@\S+\.\S+$/.test(email)) {
                return res.status(400).json({ error: 'Invalid email format. Example: name@example.com' });
            }
        }
        if (username) username = String(username).trim();
        if (fullName) fullName = String(fullName).trim();
        if (phoneNumber) phoneNumber = String(phoneNumber).trim();

        // Duplicate check (exclude self)
        const orConds = [];
        if (email) orConds.push({ email });
        if (username) orConds.push({ username });
        if (orConds.length) {
            const existing = await User.findOne({
                $or: orConds,
                _id: { $ne: req.user._id }
            });
            if (existing) {
                return res.status(400).json({ error: 'Username or Email already taken.' });
            }
        }

        const update = {};
        if (fullName) update.fullName = fullName;
        if (username) update.username = username;
        if (email) update.email = email;
        if (phoneNumber) update.phoneNumber = phoneNumber;
        if (req.file) {
            update.avatarUrl = `/uploads/avatars/${req.file.filename}`;
        } else if (avatarUrl !== undefined) {
            update.avatarUrl = String(avatarUrl || '').trim();
        }

        const user = await User.findByIdAndUpdate(req.user._id, update, {
            new: true,
            runValidators: true
        }).select('-password');

        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json({ message: 'Profile updated successfully.', user });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Username or Email already taken.' });
        }
        res.status(500).json({ error: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        let {
            identifier,
            newPassword
        } = req.body;

        if (!identifier || !newPassword) {
            return res.status(400).json({ error: 'Identifier and new password required.' });
        }

        identifier = String(identifier).trim();
        if (!identifier) return res.status(404).json({ error: 'User not found.' });
        const looksLikeEmail = identifier.includes('@');
        const escapeRegex2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactCI2 = (s) => ({ $regex: `^${escapeRegex2(s)}$`, $options: 'i' });

        const user = await User.findOne(
            looksLikeEmail
                ? { $or: [{ email: exactCI2(identifier) }, { username: exactCI2(identifier) }] }
                : { $or: [{ email: exactCI2(identifier) }, { username: identifier }] }
        );

        if (!user) return res.status(404).json({
            error: 'User not found.'
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({
            message: 'Password updated successfully.'
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
};