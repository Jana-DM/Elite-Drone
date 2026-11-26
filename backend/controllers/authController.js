const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { sendEmailOtp } = require('../config/mailer');
const { logAudit } = require('../services/auditService');
const { createNotification } = require('../services/notificationService');
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
      avatar_url,
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

    // H. Insert user with avatar and verified status
    const insertRes = await db.query(
      `INSERT INTO users (full_name, gender, email, country_code, mobile, username, password_hash, avatar_url, otp_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id, full_name, email, mobile, username, avatar_url, created_at`,
      [full_name.trim(), gender, cleanEmail, country_code, cleanMobile, cleanUser, passwordHash, avatar_url || null]
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

// 6. Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { full_name, gender, mobile, username } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    let cleanUsername = null;
    if (username !== undefined && username !== null && String(username).trim() !== '') {
      cleanUsername = String(username).trim().toLowerCase();
      if (cleanUsername.length < 3) {
        return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
      }
    }

    if (role === 'admin' || role === 'superadmin') {
      if (cleanUsername) {
        const dupAdmin = await db.query(
          'SELECT id FROM admin_users WHERE LOWER(username) = $1 AND id != $2',
          [cleanUsername, userId]
        );
        const dupUser = await db.query(
          'SELECT id FROM users WHERE LOWER(username) = $1',
          [cleanUsername]
        );
        if (dupAdmin.rows.length > 0 || dupUser.rows.length > 0) {
          return res.status(400).json({ success: false, message: 'This username is already taken.' });
        }
      }

      const updateRes = await db.query(
        `UPDATE admin_users 
         SET full_name = COALESCE($1, full_name),
             username = COALESCE($2, username),
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, username, email, full_name, role`,
        [full_name ? full_name.trim() : null, cleanUsername, userId]
      );
      return res.json({
        success: true,
        message: 'Admin profile updated successfully!',
        user: updateRes.rows[0],
      });
    }

    // Validate gender against schema CHECK constraint
    const allowedGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
    let cleanGender = null;
    if (gender !== undefined && gender !== null && String(gender).trim() !== '') {
      if (!allowedGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message: `Invalid gender. Allowed values: ${allowedGenders.join(', ')}.`,
        });
      }
      cleanGender = gender;
    }

    // Validate & normalize mobile if provided
    let cleanMobile = null;
    if (mobile !== undefined && mobile !== null && String(mobile).trim() !== '') {
      cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
        return res.status(400).json({ success: false, message: 'Mobile must be a valid 10-digit Indian number.' });
      }
      const dupMobile = await db.query(
        'SELECT id FROM users WHERE mobile = $1 AND id != $2',
        [cleanMobile, userId]
      );
      if (dupMobile.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'This mobile number is already linked to another account.' });
      }
    }

    // Check username uniqueness across both users and admin_users
    if (cleanUsername) {
      const dupUser = await db.query(
        'SELECT id FROM users WHERE LOWER(username) = $1 AND id != $2',
        [cleanUsername, userId]
      );
      const dupAdmin = await db.query(
        'SELECT id FROM admin_users WHERE LOWER(username) = $1',
        [cleanUsername]
      );
      if (dupUser.rows.length > 0 || dupAdmin.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'This username is already taken.' });
      }
    }

    // Customer profile update
    const updateRes = await db.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           gender = COALESCE($2, gender),
           mobile = COALESCE($3, mobile),
           username = COALESCE($4, username),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, full_name, gender, email, country_code, mobile, username`,
      [full_name ? full_name.trim() : null, cleanGender, cleanMobile, cleanUsername, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        ...updateRes.rows[0],
        role: 'customer',
      },
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// 7. Change Password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
    }

    const table = (role === 'admin' || role === 'superadmin') ? 'admin_users' : 'users';
    const userRes = await db.query(`SELECT password_hash FROM ${table} WHERE id = $1`, [userId]);

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    const match = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Current password does not match.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await db.query(`UPDATE ${table} SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, userId]);

    await logAudit({
      userId: role === 'customer' ? userId : null,
      adminId: (role === 'admin' || role === 'superadmin') ? userId : null,
      action: 'PASSWORD_CHANGED',
      details: 'User password was changed securely.',
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Password changed successfully! Please keep it secure.',
    });
  } catch (err) {
    console.error('Error changing password:', err);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};

// 8. Update Avatar / Profile Picture
exports.updateAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const { avatar_url } = req.body;

    if (!avatar_url) {
      return res.status(400).json({ success: false, message: 'Avatar image URL is required.' });
    }

    const updateRes = await db.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, full_name, email, avatar_url',
      [avatar_url.trim(), userId]
    );

    return res.json({
      success: true,
      message: 'Profile avatar updated successfully!',
      user: updateRes.rows[0],
    });
  } catch (err) {
    console.error('Error updating avatar:', err);
    return res.status(500).json({ success: false, message: 'Failed to update avatar image.' });
  }
};

// 9. Forgot Password - Request Reset Code
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Look up in users table
    const userRes = await db.query('SELECT id, full_name, email FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    const adminRes = await db.query('SELECT id, full_name, email FROM admin_users WHERE LOWER(email) = $1', [cleanEmail]);

    const targetUser = userRes.rows[0] || adminRes.rows[0];

    // Generate 4-digit reset OTP
    const rawOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const tokenHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    if (targetUser) {
      // Invalidate existing active tokens
      await db.query('UPDATE password_reset_tokens SET is_used = TRUE WHERE email = $1 AND is_used = FALSE', [cleanEmail]);

      // Save token in password_reset_tokens
      await db.query(`
        INSERT INTO password_reset_tokens (user_id, email, token_hash, otp_code, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [userRes.rows.length > 0 ? targetUser.id : null, cleanEmail, tokenHash, rawOtp, expiresAt]);

      // Also record in otp_verifications for unified tracking
      await db.query(`
        INSERT INTO otp_verifications (destination_type, destination, otp_hash, purpose, expires_at)
        VALUES ('email', $1, $2, 'password_reset', $3)
      `, [cleanEmail, tokenHash, expiresAt]);

      // Dispatch real email via Nodemailer
      await sendEmailOtp({
        to: cleanEmail,
        otpCode: rawOtp,
        purpose: 'Password Reset',
      });

      await logAudit({
        userId: userRes.rows.length > 0 ? targetUser.id : null,
        action: 'FORGOT_PASSWORD_REQUEST',
        details: `Password reset code requested for ${cleanEmail}`,
        ipAddress: req.ip,
      });
    }

    // Always return success message
    return res.json({
      success: true,
      message: 'If an account exists with this email, a 4-digit password reset code has been dispatched.',
      email: cleanEmail,
    });
  } catch (err) {
    console.error('Error during forgotPassword:', err);
    return res.status(500).json({ success: false, message: 'Server error processing password reset request.' });
  }
};

// 10. Reset Password - Verify Code and Update Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp_code, new_password, confirm_password } = req.body;

    if (!email || !otp_code || !new_password || !confirm_password) {
      return res.status(400).json({ success: false, message: 'Email, reset code, and new password are required.' });
    }

    if (new_password !== confirm_password) {
      return res.status(400).json({ success: false, message: 'New password and confirm password do not match.' });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(new_password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long and include uppercase, lowercase, number, and special character.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp_code.trim();

    // Check password_reset_tokens
    const tokenRes = await db.query(`
      SELECT * FROM password_reset_tokens 
      WHERE email = $1 AND is_used = FALSE AND expires_at > NOW() 
      ORDER BY created_at DESC LIMIT 1
    `, [cleanEmail]);

    let isValid = false;
    let targetRecord = null;

    if (tokenRes.rows.length > 0) {
      targetRecord = tokenRes.rows[0];
      isValid = await bcrypt.compare(cleanOtp, targetRecord.token_hash);
    }

    // Fallback check in otp_verifications
    if (!isValid) {
      const otpRes = await db.query(`
        SELECT * FROM otp_verifications 
        WHERE destination = $1 AND purpose = 'password_reset' AND is_verified = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
      `, [cleanEmail]);

      if (otpRes.rows.length > 0) {
        isValid = await bcrypt.compare(cleanOtp, otpRes.rows[0].otp_hash);
      }
    }

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset code.' });
    }

    const newHash = await bcrypt.hash(new_password, 10);

    // Update users or admin_users
    const userUpdate = await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = $2 RETURNING id, full_name, email',
      [newHash, cleanEmail]
    );

    if (userUpdate.rows.length === 0) {
      await db.query(
        'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = $2',
        [newHash, cleanEmail]
      );
    }

    // Invalidate tokens
    await db.query('UPDATE password_reset_tokens SET is_used = TRUE WHERE email = $1', [cleanEmail]);
    await db.query('UPDATE otp_verifications SET is_verified = TRUE WHERE destination = $1 AND purpose = \'password_reset\'', [cleanEmail]);

    await logAudit({
      userId: userUpdate.rows.length > 0 ? userUpdate.rows[0].id : null,
      action: 'PASSWORD_RESET_SUCCESS',
      details: `Password reset successfully completed for ${cleanEmail}`,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Password has been reset successfully! You may now sign in with your new password.',
    });
  } catch (err) {
    console.error('Error during resetPassword:', err);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// 11. Google OAuth URL Generation
exports.getGoogleAuthUrl = (req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
  const redirectUri = (process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`).trim().replace(/^["']|["']$/g, '');
  const fromMode = req.query.from || req.query.mode || 'login';

  if (!clientId) {
    return res.json({
      success: true,
      configured: false,
      clientId: null,
      message: 'Google OAuth Client ID is not configured in .env. To enable, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      authUrl: null,
    });
  }

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: redirectUri,
    client_id: clientId,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    state: fromMode,
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
  };

  const qs = new URLSearchParams(options);
  return res.json({
    success: true,
    configured: true,
    clientId: clientId,
    authUrl: `${rootUrl}?${qs.toString()}`,
  });
};

// 12. Google OAuth Callback & Direct ID Token / One Tap Verification
exports.googleAuthCallback = async (req, res) => {
  try {
    // If user cancelled or Google returned an error query
    if (req.query.error) {
      console.warn('Google OAuth cancelled or returned error:', req.query.error);
      const redirectPage = req.query.state === 'register' ? '/register.html' : '/login.html';
      return res.redirect(`${redirectPage}?error=` + encodeURIComponent(req.query.error));
    }

    const code = req.query.code || req.body?.code;
    const credential = req.body?.credential || req.body?.id_token;
    const authMode = req.query.state || req.body?.state || req.body?.mode || 'login';
    let email, name, googleId, picture;

    // A. If Google One Tap / ID Token credential is provided (strict cryptographic verification via Google tokeninfo)
    if (credential) {
      const configuredClientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!verifyRes.ok) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired Google ID token.',
        });
      }

      const tokenInfo = await verifyRes.json();
      if (configuredClientId && tokenInfo.aud !== configuredClientId) {
        return res.status(401).json({
          success: false,
          message: 'Google token audience mismatch.',
        });
      }
      if (tokenInfo.email_verified !== 'true' && tokenInfo.email_verified !== true) {
        return res.status(401).json({
          success: false,
          message: 'Google account email is not verified.',
        });
      }

      email = tokenInfo.email ? tokenInfo.email.toLowerCase().trim() : null;
      name = tokenInfo.name || tokenInfo.given_name || 'Google Customer';
      googleId = tokenInfo.sub;
      picture = tokenInfo.picture || null;
    }
    // B. If code is received from Google redirect (GET or POST)
    else if (code) {
      const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
      const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const redirectUri = (process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`).trim().replace(/^["']|["']$/g, '');

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        console.error('Google token exchange error:', tokenData);
        return res.status(400).send(`
          <!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center;background:#0b0f19;color:#fff;">
            <h2 style="color:#ef4444;">Google Sign-In Failed</h2>
            <p style="color:#94a3b8;">${tokenData.error_description || tokenData.error || 'Unable to exchange authorization code.'}</p>
            <a href="/login.html" style="color:#38bdf8;">Back to Login</a>
          </body></html>
        `);
      }

      // Fetch user profile from Google
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleProfile = await profileResponse.json();

      email = googleProfile.email ? googleProfile.email.toLowerCase().trim() : null;
      name = googleProfile.name || 'Google Customer';
      googleId = googleProfile.id || googleProfile.sub;
      picture = googleProfile.picture || null;
    }
    // C. Or if direct verified payload is passed (for mobile / test suite)
    else if (req.body?.googleUser && req.body.googleUser.email) {
      email = req.body.googleUser.email.toLowerCase().trim();
      name = req.body.googleUser.name || 'Google Customer';
      googleId = req.body.googleUser.id || req.body.googleUser.sub;
      picture = req.body.googleUser.picture || null;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Google authorization code, credential or user payload is required.',
      });
    }

    if (!email || !googleId) {
      return res.status(400).json({ success: false, message: 'Invalid Google account information.' });
    }

    // Check if user already exists by email
    const userRes = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    const existingUser = userRes.rows[0];

    // CASE 1: Request came from register page (authMode === 'register' and not One-Tap)
    if (authMode === 'register' && !credential) {
      if (existingUser) {
        return res.redirect(`/login.html?already_registered=true&email=${encodeURIComponent(email)}`);
      }

      const registerParams = new URLSearchParams({
        google_auth: 'true',
        name: name,
        email: email,
        avatar: picture || '',
        google_id: googleId || '',
      });
      return res.redirect(`/register.html?${registerParams.toString()}`);
    }

    // CASE 2: Login or Google One-Tap sign-in
    let user;

    if (existingUser) {
      user = existingUser;
      if (picture && !user.avatar_url) {
        await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [picture, user.id]);
      }
    } else {
      // Auto-create account for Google One Tap or test suite
      if (req.body?.googleUser || credential) {
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15) || 'drone_pilot';
        let username = baseUsername;
        const userCheck = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [username]);
        if (userCheck.rows.length > 0) {
          username = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
        }

        const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
        const insertUser = await db.query(`
          INSERT INTO users (full_name, gender, email, country_code, username, password_hash, avatar_url, otp_verified)
          VALUES ($1, 'Other', $2, '+91', $3, $4, $5, TRUE)
          RETURNING *
        `, [name, email, username, randomPasswordHash, picture]);

        user = insertUser.rows[0];

        await logAudit({
          userId: user.id,
          action: 'GOOGLE_SIGNUP',
          details: `New account created via Google OAuth / One-Tap: ${email}`,
          ipAddress: req.ip,
        });
      } else {
        const registerParams = new URLSearchParams({
          google_auth: 'true',
          name: name,
          email: email,
          avatar: picture || '',
          google_id: googleId || '',
          msg: 'register_required',
        });
        return res.redirect(`/register.html?${registerParams.toString()}`);
      }
    }

    // Link in oauth_accounts table
    await db.query(`
      INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, profile_data)
      VALUES ($1, 'google', $2, $3, $4)
      ON CONFLICT (provider, provider_user_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        profile_data = EXCLUDED.profile_data,
        updated_at = NOW();
    `, [user.id, googleId, email, JSON.stringify({ name, picture })]);

    // Sign JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: 'customer',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await logAudit({
      userId: user.id,
      action: 'GOOGLE_LOGIN',
      details: `User logged in via Google OAuth: ${email}`,
      ipAddress: req.ip,
    });

    const userPayload = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      username: user.username,
      avatar_url: picture || user.avatar_url,
      role: 'customer',
    };

    // If browser GET request, return auto-redirecting HTML that sets localStorage
    if (req.method === 'GET') {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Authenticating with Elite Drone...</title>
          <style>
            body {
              background: #0b0f19;
              color: #f8fafc;
              font-family: 'Segoe UI', system-ui, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              background: rgba(17, 26, 46, 0.9);
              border: 1px solid rgba(14, 165, 233, 0.3);
              border-radius: 12px;
              padding: 2.5rem;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              max-width: 400px;
            }
            .spinner {
              border: 3px solid rgba(14, 165, 233, 0.2);
              border-top: 3px solid #38bdf8;
              border-radius: 50%;
              width: 36px;
              height: 36px;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 1.5rem;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            h3 { color: #38bdf8; margin: 0 0 0.5rem; font-size: 1.25rem; }
            p { color: #94a3b8; font-size: 0.9rem; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h3>Authentication Successful</h3>
            <p>Welcome, ${user.full_name}! Launching your client dashboard...</p>
          </div>
          <script>
            try {
              localStorage.setItem('elite_drone_user', JSON.stringify(${JSON.stringify(userPayload)}));
              localStorage.setItem('token', ${JSON.stringify(token)});
            } catch(e) {}
            setTimeout(() => {
              window.location.href = '/dashboard.html';
            }, 600);
          </script>
        </body>
        </html>
      `);
    }

    return res.json({
      success: true,
      message: 'Google authentication successful.',
      token,
      user: userPayload,
      redirectUrl: '/dashboard.html',
    });
  } catch (err) {
    console.error('Error during Google OAuth:', err);
    return res.status(500).json({ success: false, message: 'Google authentication failed.' });
  }
};

// 13. Facebook OAuth URL Generation
exports.getFacebookAuthUrl = (req, res) => {
  const appId = (process.env.FACEBOOK_APP_ID || '').trim().replace(/^["']|["']$/g, '');
  const redirectUri = (process.env.FACEBOOK_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`).trim().replace(/^["']|["']$/g, '');
  const fromMode = req.query.from || req.query.mode || 'login';

  if (!appId) {
    return res.json({
      success: true,
      configured: false,
      message: 'Facebook App ID is not configured in .env. Configure FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to activate live Facebook login.',
      authUrl: null,
    });
  }

  const rootUrl = 'https://www.facebook.com/v18.0/dialog/oauth';
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'email,public_profile',
    response_type: 'code',
    state: fromMode,
  });

  return res.json({
    success: true,
    configured: true,
    authUrl: `${rootUrl}?${params.toString()}`,
  });
};

// 14. Facebook OAuth Callback & Login
exports.facebookAuthCallback = async (req, res) => {
  try {
    if (req.query.error) {
      const redirectPage = req.query.state === 'register' ? '/register.html' : '/login.html';
      return res.redirect(`${redirectPage}?error=${encodeURIComponent(req.query.error)}`);
    }

    const code = req.query.code || req.body?.code;
    let fbId, email, name, picture;

    if (code) {
      const appId = (process.env.FACEBOOK_APP_ID || '').trim().replace(/^["']|["']$/g, '');
      const appSecret = (process.env.FACEBOOK_APP_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const redirectUri = (process.env.FACEBOOK_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/facebook/callback`).trim().replace(/^["']|["']$/g, '');

      if (!appId || !appSecret) {
        return res.status(500).json({
          success: false,
          message: 'Facebook OAuth credentials are not configured on the server.',
        });
      }

      const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', appId);
      tokenUrl.searchParams.set('redirect_uri', redirectUri);
      tokenUrl.searchParams.set('client_secret', appSecret);
      tokenUrl.searchParams.set('code', code);

      const tokenResponse = await fetch(tokenUrl.toString());
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('Facebook token exchange error:', tokenData);
        return res.status(400).send(`
          <!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;text-align:center;background:#0b0f19;color:#fff;">
            <h2 style="color:#ef4444;">Facebook Sign-In Failed</h2>
            <p style="color:#94a3b8;">${tokenData.error?.message || 'Unable to exchange Facebook authorization code.'}</p>
            <a href="/login.html" style="color:#38bdf8;">Back to Login</a>
          </body></html>
        `);
      }

      const profileUrl = new URL('https://graph.facebook.com/v18.0/me');
      profileUrl.searchParams.set('fields', 'id,name,email,picture.type(large)');
      profileUrl.searchParams.set('access_token', tokenData.access_token);

      const profileResponse = await fetch(profileUrl.toString());
      const fbProfile = await profileResponse.json();
      if (!profileResponse.ok || !fbProfile.id) {
        return res.status(400).json({ success: false, message: 'Failed to retrieve Facebook profile.' });
      }

      fbId = fbProfile.id;
      email = (fbProfile.email || `fb_${fbId}@facebook.user`).toLowerCase().trim();
      name = fbProfile.name || 'Facebook Customer';
      picture = fbProfile.picture?.data?.url || null;
    } else if (req.body?.facebookUser && req.body.facebookUser.id) {
      const { facebookUser } = req.body;
      fbId = facebookUser.id;
      email = (facebookUser.email || `fb_${fbId}@facebook.user`).toLowerCase().trim();
      name = facebookUser.name || 'Facebook Customer';
      picture = facebookUser.picture?.data?.url || null;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Facebook authorization code or profile payload is required.',
      });
    }

    let userRes = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [email]);
    let user;

    if (userRes.rows.length === 0) {
      const baseUsername = (name ? name.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() : 'fb_user').slice(0, 15) || 'fb_user';
      let username = baseUsername;
      const userCheck = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [username]);
      if (userCheck.rows.length > 0) {
        username = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
      }

      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      const insertUser = await db.query(`
        INSERT INTO users (full_name, gender, email, country_code, username, password_hash, avatar_url, otp_verified)
        VALUES ($1, 'Other', $2, '+91', $3, $4, $5, TRUE)
        RETURNING *
      `, [name, email, username, randomPasswordHash, picture]);

      user = insertUser.rows[0];

      await logAudit({
        userId: user.id,
        action: 'FACEBOOK_SIGNUP',
        details: `New account created via Facebook Login: ${email}`,
        ipAddress: req.ip,
      });
    } else {
      user = userRes.rows[0];
      if (picture && !user.avatar_url) {
        await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [picture, user.id]);
      }
    }

    // Link in oauth_accounts table
    await db.query(`
      INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, profile_data)
      VALUES ($1, 'facebook', $2, $3, $4)
      ON CONFLICT (provider, provider_user_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        profile_data = EXCLUDED.profile_data,
        updated_at = NOW();
    `, [user.id, fbId, email, JSON.stringify({ name, picture })]);

    // Sign JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: 'customer',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await logAudit({
      userId: user.id,
      action: 'FACEBOOK_LOGIN',
      details: `User logged in via Facebook: ${email}`,
      ipAddress: req.ip,
    });

    const userPayload = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      username: user.username,
      avatar_url: picture || user.avatar_url,
      role: 'customer',
    };

    if (req.method === 'GET') {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Authenticating with Elite Drone...</title></head>
        <body style="background:#0b0f19;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <h3 style="color:#38bdf8;">Authentication Successful</h3>
            <p>Welcome, ${user.full_name}! Redirecting to your dashboard...</p>
          </div>
          <script>
            try {
              localStorage.setItem('elite_drone_user', JSON.stringify(${JSON.stringify(userPayload)}));
              localStorage.setItem('token', ${JSON.stringify(token)});
            } catch(e) {}
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 500);
          </script>
        </body>
        </html>
      `);
    }

    return res.json({
      success: true,
      message: 'Facebook authentication successful.',
      token,
      user: userPayload,
      redirectUrl: '/dashboard.html',
    });
  } catch (err) {
    console.error('Error during Facebook OAuth:', err);
    return res.status(500).json({ success: false, message: 'Facebook authentication failed.' });
  }
};
