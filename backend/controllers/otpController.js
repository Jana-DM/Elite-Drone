const bcrypt = require('bcrypt');
const db = require('../config/db');
const { sendEmailOtp, sendSmsOtp } = require('../config/mailer');

// Send OTP Endpoint
exports.sendOtp = async (req, res) => {
  try {
    const { destinationType, destination, purpose = 'registration' } = req.body;

    if (!destinationType || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Destination type (email or mobile) and destination are required.',
      });
    }

    const type = destinationType.toLowerCase();
    const dest = destination.trim().toLowerCase();

    // 1. Validation based on destination type
    if (type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(dest)) {
        return res.status(400).json({ success: false, message: 'Invalid email address format.' });
      }

      // Check if email already registered
      if (purpose === 'registration') {
        const userExists = await db.query('SELECT id FROM users WHERE email = $1', [dest]);
        if (userExists.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'This email address is already registered. Please login instead.',
          });
        }
      }
    } else if (type === 'mobile') {
      // Indian mobile number validation (10 digits starting with 6, 7, 8, or 9)
      const cleanMobile = dest.replace(/\D/g, '').slice(-10);
      const mobileRegex = /^[6-9]\d{9}$/;
      if (!mobileRegex.test(cleanMobile)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid mobile number. Please enter a valid 10-digit Indian mobile number.',
        });
      }

      // Check if mobile already registered
      if (purpose === 'registration') {
        const userExists = await db.query('SELECT id FROM users WHERE mobile = $1', [cleanMobile]);
        if (userExists.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'This mobile number is already registered. Please login instead.',
          });
        }
      }
    } else {
      return res.status(400).json({ success: false, message: 'Invalid destination type.' });
    }

    // 2. Rate limiting check per destination (max 4 per 10 mins)
    const recentOtps = await db.query(
      `SELECT count(*) FROM otp_verifications 
       WHERE destination = $1 AND created_at > (NOW() - INTERVAL '10 minutes')`,
      [dest]
    );

    if (parseInt(recentOtps.rows[0].count, 10) >= 4) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests for this destination. Please wait 10 minutes before requesting again.',
      });
    }

    // 3. Generate 6-digit numeric OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate previous unverified OTPs for this destination and purpose
    await db.query(
      `UPDATE otp_verifications SET expires_at = NOW() 
       WHERE destination = $1 AND purpose = $2 AND is_verified = FALSE`,
      [dest, purpose]
    );

    // 4. Save to PostgreSQL
    await db.query(
      `INSERT INTO otp_verifications (destination_type, destination, otp_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [type, dest, otpHash, purpose, expiresAt]
    );

    // 5. Send via Mailer or SMS
    let deliveryInfo = {};
    if (type === 'email') {
      deliveryInfo = await sendEmailOtp({
        to: dest,
        otpCode: rawOtp,
        purpose: purpose === 'registration' ? 'Account Registration' : 'Password Reset',
      });
    } else {
      deliveryInfo = await sendSmsOtp({
        mobile: dest,
        otpCode: rawOtp,
        purpose: purpose === 'registration' ? 'Account Registration' : 'Password Reset',
      });
    }

    return res.json({
      success: true,
      message: `OTP sent successfully to your ${type}. Code expires in 10 minutes.`,
      destinationType: type,
      destination: dest,
      method: deliveryInfo.method,
      note: deliveryInfo.note || null,
      countdownSeconds: 90,
    });
  } catch (err) {
    console.error('Error sending OTP:', err);
    return res.status(500).json({ success: false, message: 'Failed to dispatch OTP. Please try again.' });
  }
};

// Verify OTP Endpoint
exports.verifyOtp = async (req, res) => {
  try {
    const { destinationType, destination, otpCode, purpose = 'registration' } = req.body;

    if (!destinationType || !destination || !otpCode) {
      return res.status(400).json({
        success: false,
        message: 'Destination type, destination, and 6-digit OTP code are required.',
      });
    }

    const dest = destination.trim().toLowerCase();
    const cleanOtp = otpCode.trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({ success: false, message: 'OTP must be exactly 6 digits.' });
    }

    // Find latest active OTP record
    const otpRecord = await db.query(
      `SELECT * FROM otp_verifications 
       WHERE destination = $1 AND purpose = $2 AND is_verified = FALSE 
       ORDER BY created_at DESC LIMIT 1`,
      [dest, purpose]
    );

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active OTP request found. Please request a new OTP.',
      });
    }

    const record = otpRecord.rows[0];

    // Check expiration
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This OTP has expired. Please request a new code.',
      });
    }

    // Check attempts limit
    if (record.attempts >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new OTP.',
      });
    }

    // Increment attempts
    await db.query(
      'UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1',
      [record.id]
    );

    // Verify hash with bcrypt
    const isMatch = await bcrypt.compare(cleanOtp, record.otp_hash);
    if (!isMatch) {
      const remaining = 5 - (record.attempts + 1);
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Please request a new code.'}`,
      });
    }

    // Mark as verified
    await db.query(
      'UPDATE otp_verifications SET is_verified = TRUE WHERE id = $1',
      [record.id]
    );

    return res.json({
      success: true,
      message: 'OTP verified successfully! You can now proceed.',
      verifiedDestination: dest,
      destinationType: record.destination_type,
    });
  } catch (err) {
    console.error('Error verifying OTP:', err);
    return res.status(500).json({ success: false, message: 'Verification error. Please try again.' });
  }
};
