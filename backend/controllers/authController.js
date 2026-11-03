const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'elite_drone_super_secure_jwt_secret_key_2026_antigravity';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// 1. Check Username Availability
exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || username.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    }

    const cleanUser = username.trim().toLowerCase();
    
    // Check in users and admin_users
    const userRes = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUser]);
    const adminRes = await db.query('SELECT id FROM admin_users WHERE LOWER(username) = $1', [cleanUser]);

    const isAvailable = userRes.rows.length === 0 && adminRes.rows.length === 0;

    return res.json({
      success: true,
      available: isAvailable,
      username: cleanUser,
      message: isAvailable ? 'Username is available!' : 'Username is already taken.',
    });
  } catch (err) {
    console.error('Error checking username:', err);
    return res.status(500).json({ success: false, message: 'Server error checking username.' });
  }
};

// 2. Customer Registration
exports.register = async (req, res) => {
  try {
    const {
      full_name,
      gender,
      email,
      confirm_email,
      country_code = '+91',
      mobile,
      username,
      password,
      confirm_password,
      otp_destination_type,
      otp_destination,
    } = req.body;

    // A. Required fields check
    if (!full_name || !gender || !email || !confirm_email || !username || !password || !confirm_password) {
      return res.status(400).json({ success: false, message: 'All registration fields are required.' });
    }

    // B. Email validation & matching
    const cleanEmail = email.trim().toLowerCase();
    const cleanConfirmEmail = confirm_email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }
    if (cleanEmail !== cleanConfirmEmail) {
      return res.status(400).json({ success: false, message: 'Email and Confirm Email do not match.' });
    }

    // C. Optional Mobile validation (if provided)
    let cleanMobile = null;
    if (mobile && typeof mobile === 'string' && mobile.trim().length > 0) {
      cleanMobile = mobile.replace(/\D/g, '').slice(-10);
      const mobileRegex = /^[6-9]\d{9}$/;
      if (!mobileRegex.test(cleanMobile)) {
        return res.status(400).json({ success: false, message: 'Mobile must be a valid 10-digit Indian number.' });
      }
    }

    // D. Password complexity validation:
    // Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number, and 1 special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and include an uppercase letter, lowercase letter, number, and special character.',
      });
    }

    if (password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'Password and Confirm Password do not match.' });
    }

    // E. Verify OTP binding:
    // Check that the OTP destination (either the email or mobile) has an approved is_verified=TRUE record within last 30 minutes
    const targetDest = (otp_destination_type === 'mobile' && cleanMobile) ? cleanMobile : cleanEmail;
    const verifiedOtp = await db.query(
      `SELECT id FROM otp_verifications 
       WHERE destination = $1 AND is_verified = TRUE AND created_at > (NOW() - INTERVAL '30 minutes')
       ORDER BY created_at DESC LIMIT 1`,
      [targetDest]
    );

    if (verifiedOtp.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'OTP verification required. Please verify your OTP before submitting registration.',
      });
    }

    // F. Uniqueness checks in database
    const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    if (cleanMobile) {
      const existingMobile = await db.query('SELECT id FROM users WHERE mobile = $1', [cleanMobile]);
      if (existingMobile.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'An account with this mobile number already exists.' });
      }
    }

    const cleanUser = username.trim().toLowerCase();
    const existingUser = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUser]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'This username is already taken.' });
    }

    // G. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // H. Insert user
    const insertRes = await db.query(
      `INSERT INTO users (full_name, gender, email, country_code, mobile, username, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, email, mobile, username, created_at`,
      [full_name.trim(), gender, cleanEmail, country_code, cleanMobile, cleanUser, passwordHash]
    );

    // Clean up OTP records for this destination
    await db.query('DELETE FROM otp_verifications WHERE destination = $1', [targetDest]);

    // Note: Do not automatically log the user in; redirect them to Login page as specified
    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Please log in with your credentials.',
      user: {
        id: insertRes.rows[0].id,
        full_name: insertRes.rows[0].full_name,
        email: insertRes.rows[0].email,
        username: insertRes.rows[0].username,
      },
    });
  } catch (err) {
    console.error('Error during registration:', err);
    return res.status(500).json({ success: false, message: 'Registration failed due to a server error.' });
  }
};

// 3. User & Admin Login
exports.login = async (req, res) => {
  try {
    const { login_identifier, password, remember_me } = req.body;

    if (!login_identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username and Password are required.' });
    }

    const ident = login_identifier.trim().toLowerCase();

    // Check if this is an Admin user first
    const adminRes = await db.query(
      'SELECT * FROM admin_users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [ident]
    );

    if (adminRes.rows.length > 0) {
      const admin = adminRes.rows[0];
      const match = await bcrypt.compare(password, admin.password_hash);
      if (match) {
        const token = jwt.sign(
          {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            full_name: admin.full_name,
            role: admin.role,
          },
          JWT_SECRET,
          { expiresIn: remember_me ? '30d' : JWT_EXPIRES_IN }
        );

        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: remember_me ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
        });

        return res.json({
          success: true,
          message: 'Admin authentication successful.',
          token,
          user: {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            full_name: admin.full_name,
            role: admin.role,
          },
          redirectUrl: '/admin.html',
        });
      }
    }

    // Check standard Customer users
    const userRes = await db.query(
      'SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1',
      [ident]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email/username or password.' });
    }

    const user = userRes.rows[0];

    if (user.is_active === false) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Please contact support.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid email/username or password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: 'customer',
      },
      JWT_SECRET,
      { expiresIn: remember_me ? '30d' : JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: remember_me ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        mobile: user.mobile,
        gender: user.gender,
        role: 'customer',
      },
      redirectUrl: '/dashboard.html',
    });
  } catch (err) {
    console.error('Error during login:', err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// 4. Get Current User Session (Me)
exports.getMe = async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
      const adminRes = await db.query(
        'SELECT id, username, email, full_name, role, created_at FROM admin_users WHERE id = $1',
        [req.user.id]
      );
      if (adminRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Admin not found.' });
      return res.json({ success: true, user: adminRes.rows[0] });
    }

    const userRes = await db.query(
      'SELECT id, full_name, gender, email, country_code, mobile, username, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      user: {
        ...userRes.rows[0],
        role: 'customer',
      },
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving profile.' });
  }
};

// 5. Logout
exports.logout = (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
};
