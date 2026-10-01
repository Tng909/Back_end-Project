const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
    try {
        // First-time register requires a verified OTP: body must include { ..., otp }
        // req.pendingUser is set by OTP_System.verifyOTPMiddleware when route uses it.
        const source = req.pendingUser || req.body;
        const {
            fullName,
            username,
            email,
            password,
            phoneNumber
        } = source;
        const confirmPassword = req.pendingUser ? password : req.body.confirmPassword;

        if (!fullName || !username || !email || !password || !confirmPassword || !phoneNumber) {
            return res.status(400).json({
                error: 'All fields required.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                error: 'Passwords do not match.'
            });
        }

        // Enforce OTP verification on first-time direct register (no middleware)
        if (!req.pendingUser) {
            const { verifyOTPCode } = require('../middleware/OTP_System');
            const check = verifyOTPCode(email, req.body.otp);
            if (!check.ok) {
                return res.status(check.status).json({
                    error: `${check.error} (Email verification required for first-time registration.)`
                });
            }
        }

        const existingUser = await User.findOne({
            $or: [{
                email
            }, {
                username
            }]
        });
        if (existingUser) {
            return res.status(400).json({
                error: 'Username or Email already taken.'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            fullName,
            username,
            email,
            password: hashedPassword,
            phoneNumber,
            role: 'user',
            isVerified: true
        });

        await user.save();
        res.status(201).json({
            message: 'Registration successful. Email verified.'
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
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
        const identifierLower = identifier.toLowerCase();
        const isEmail = /^\S+@\S+\.\S+$/.test(identifier);

        // Match username OR email (email case-insensitive, exact match)
        const user = await User.findOne(
            isEmail
                ? { email: identifierLower }
                : {
                    $or: [
                        { email: identifierLower },
                        { username: identifier }
                    ]
                }
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
        const identifierLower = identifier.toLowerCase();
        const isEmail = /^\S+@\S+\.\S+$/.test(identifier);

        const user = await User.findOne(
            isEmail
                ? { email: identifierLower }
                : {
                    $or: [
                        { email: identifierLower },
                        { username: identifier }
                    ]
                }
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