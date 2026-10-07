const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendWelcomeEmail, sendTestEmail } = require('../utils/sendEmail');
const { loadKeys } = require('../config/jwtKeys');

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

        // RS256 email-verification JWT (20m) for the USER's own targetEmail.
        // Signed with RSA private key, verified with public key at GET /verify-email.
        const { privateKey } = loadKeys();
        if (!privateKey) return res.status(500).json({ error: 'RS256 private key not configured.' });
        const targetEmail = email;
        const emailVerificationToken = jwt.sign(
            { email: targetEmail, type: 'email-verification' },
            privateKey,
            { algorithm: 'RS256', expiresIn: '20m' }
        );

        const user = new User({
            fullName,
            username,
            email: targetEmail,
            password: hashedPassword,
            phoneNumber,
            role: 'user',
            isVerified: false,
            isEmailConfirmed: false
        });

        await user.save();

        // Nodemailer "Verify My Account" button to targetEmail (user's input address).
        // Wrong SMTP creds (535) only warn in console — register still returns 201.
        const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const confirmUrl = `${appUrl}/verify/verify-email.html?token=${emailVerificationToken}`;
        // Direct backend fallback (button can also point here):
        // const confirmUrl = `${appUrl}/api/auth/verify-email?token=${emailVerificationToken}`;
        const mail = await sendWelcomeEmail(targetEmail, confirmUrl);

        res.status(201).json({
            message: mail.sent
                ? `Registration successful. Verification email dispatched to ${targetEmail} — click Verify My Account within 20 minutes.`
                : 'Registration successful. Confirmation email not delivered (sender not configured or SMTP rejected it).',
            emailSent: mail.sent,
            ...(mail.sent ? {} : { emailNote: 'Set MAIL_USER + MAIL_PASS in .env (Gmail App Password) to deliver mail.' })
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

// Verify route: captures "Verify My Account" button click from email.
// Token is RS256 JWT { email, type:'email-verification' }, 20m expiry.
exports.confirmEmail = async (req, res) => {
    try {
        const token = String(req.body?.token || req.query?.token || '');
        if (!token) {
            return res.status(400).json({ error: 'Verification token is missing!' });
        }
        const { publicKey } = loadKeys();
        if (!publicKey) return res.status(500).json({ error: 'RS256 public key not configured.' });
        let decoded;
        try {
            decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
        } catch {
            return res.status(403).json({ error: 'Link expired or invalid. Please sign up again.' });
        }
        // Safety check: ensure it's an email verification token type
        if (decoded.type !== 'email-verification' || !decoded.email) {
            return res.status(400).json({ error: 'Invalid token context.' });
        }
        const verifiedEmail = String(decoded.email).trim().toLowerCase();
        const user = await User.findOneAndUpdate(
            { email: verifiedEmail },
            { $set: { isVerified: true, isEmailConfirmed: true } },
            { new: true }
        );
        if (!user) return res.status(404).json({ error: 'Account not found for this email.' });
        // Browser direct open (button) gets friendly HTML, API callers get JSON
        const wantsHtml = String(req.headers.accept || '').includes('text/html');
        if (req.method === 'GET' && wantsHtml) {
            return res.send(`
      <div style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px;">
        <h1 style="color: #1DB954;">🎉 Verification Successful!</h1>
        <p>Your email <strong>${verifiedEmail}</strong> has been successfully confirmed.</p>
        <p>You can now close this tab and return to the music application to log in.</p>
      </div>`);
        }
        res.json({ message: `🎉 Verification Successful! ${verifiedEmail} confirmed. You can now log in.` });
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

        // Gate login until email verify button clicked (except admins).
        if (user.role !== 'admin' && !user.isEmailConfirmed) {
            return res.status(403).json({
                error: 'Please verify your email first. Check your inbox for the Verify My Account button (expires in 20 minutes).',
                needVerify: true,
                email: user.email
            });
        }

        // RS256: sign with RSA PRIVATE key only. Public key verifies.
        const { privateKey } = loadKeys();
        if (!privateKey) return res.status(500).json({ error: 'RS256 private key not configured.' });
        const token = jwt.sign({
                _id: user._id,
                role: user.role,
                username: user.username
            },
            privateKey, {
                algorithm: 'RS256',
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

// Resend RS256 "Verify My Account" button to the register-form email.
exports.resendVerify = async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ error: 'Valid email required.' });
        }
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'Account not found for this email.' });
        if (user.isEmailConfirmed) return res.json({ message: 'Email already verified. You can log in.' });
        const { privateKey } = loadKeys();
        if (!privateKey) return res.status(500).json({ error: 'RS256 private key not configured.' });
        const emailVerificationToken = jwt.sign(
            { email, type: 'email-verification' },
            privateKey,
            { algorithm: 'RS256', expiresIn: '20m' }
        );
        const appUrl = String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        const confirmUrl = `${appUrl}/verify/verify-email.html?token=${emailVerificationToken}`;
        const mail = await sendWelcomeEmail(email, confirmUrl);
        if (!mail.sent) return res.status(500).json({ error: `Could not send verify email: ${mail.reason}` });
        res.json({ message: `Verification email re-sent to ${email} — click Verify My Account within 20 minutes.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.testEmail = async (req, res) => {
    try {
        const { to } = req.body || {};
        const result = await sendTestEmail(to);
        res.json({
            message: `Test email sent to ${String(to).trim().toLowerCase()}.`,
            emailSent: true,
            ...result
        });
    } catch (err) {
        const status = err.code === 'INVALID_RECIPIENT'
            ? 400
            : err.code === 'MAIL_NOT_CONFIGURED'
                ? 503
                : 502;
        res.status(status).json({ error: err.message || 'SMTP test email failed.' });
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