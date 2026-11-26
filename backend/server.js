const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { sendSmsOtp, sendEmailOtp } = require('./config/mailer');
const { protect } = require('./middleware/authMiddleware');
require('dotenv').config();

const db = require('./config/db');

// In-memory cache for fast booking OTP verification (stores bcrypt hashes, never plaintext)
const bookingOtps = new Map();

// Ensure database schema extensions
db.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_verified BOOLEAN NOT NULL DEFAULT TRUE;
`).catch(err => console.warn('Database column sync note:', err.message));

const app = express();
const PORT = process.env.PORT || 5000;

// Security & Middlewares
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET || 'elite_drone_secret'));

// Global API rate limiter (100 requests per 15 minutes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../frontend')));

// Health Check API
app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await db.query('SELECT NOW() as now, current_database() as db');
    res.json({
      success: true,
      service: 'Elite Drone Service API',
      status: 'operational',
      environment: process.env.NODE_ENV || 'development',
      timestamp: dbRes.rows[0].now,
      database: dbRes.rows[0].db,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      service: 'Elite Drone Service API',
      status: 'database_unavailable',
      error: err.message,
    });
  }
});

// API routes
app.use('/api/services', require('./routes/serviceRoutes'));
app.use('/api/gallery', require('./routes/galleryRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/authRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Public Live Stats Endpoint for "Our Journey" section
app.get('/api/stats', async (req, res) => {
  try {
    const usersCount = await db.query('SELECT count(*) FROM users');
    const bookingsCount = await db.query("SELECT count(*) FROM bookings WHERE status IN ('Confirmed', 'Completed')");
    const allBookingsCount = await db.query('SELECT count(*) FROM bookings');
    const servicesCount = await db.query('SELECT count(*) FROM services WHERE is_active = TRUE');

    const registeredUsers = parseInt(usersCount.rows[0].count, 10) || 0;
    const completedOrConfirmed = parseInt(bookingsCount.rows[0].count, 10);
    const projectsCompleted = completedOrConfirmed > 0 ? completedOrConfirmed : (parseInt(allBookingsCount.rows[0].count, 10) || 0);
    const aerialWorks = parseInt(servicesCount.rows[0].count, 10) || 5;

    res.json({
      success: true,
      data: {
        registeredUsers,
        projectsCompleted,
        aerialWorks,
        passionRate: 100
      }
    });
  } catch (err) {
    console.error('Error fetching public stats:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch live stats' });
  }
});

// ============================================================
// BOOKING PAGE DEDICATED ENDPOINTS (/send-otp, /verify-otp, /api/booking/notify)
// ============================================================

const bookingOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: { success: false, message: 'Too many OTP requests. Please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 1. Send Booking Email/Mobile OTP
app.post('/send-otp', bookingOtpLimiter, async (req, res) => {
  try {
    const { contact, method } = req.body;
    if (!contact) {
      return res.status(400).json({ success: false, message: 'Contact is required' });
    }

    const cleanContact = String(contact).trim().toLowerCase();
    const isEmail = cleanContact.includes('@') || method === 'email';
    const destType = isEmail ? 'email' : 'mobile';

    // Rate limit per destination in DB (max 4 per 10 mins)
    try {
      const recentOtps = await db.query(
        `SELECT count(*) FROM otp_verifications 
         WHERE LOWER(destination) = $1 AND created_at > (NOW() - INTERVAL '10 minutes')`,
        [cleanContact]
      );
      if (parseInt(recentOtps.rows[0].count, 10) >= 4) {
        return res.status(429).json({
          success: false,
          message: 'Too many OTP requests for this destination. Please wait 10 minutes before requesting again.',
        });
      }
    } catch (rateErr) {
      // Continue with IP rate limiter if DB check fails
    }

    // 4-digit OTP for booking form
    const rawOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store hashed OTP in memory fallback
    bookingOtps.set(cleanContact, { otpHash, expiresAt });

    // Store in PostgreSQL otp_verifications
    try {
      await db.query(
        `UPDATE otp_verifications SET expires_at = NOW()
         WHERE LOWER(destination) = $1 AND purpose = 'booking' AND is_verified = FALSE`,
        [cleanContact]
      );
      await db.query(
        `INSERT INTO otp_verifications (destination_type, destination, otp_hash, purpose, expires_at)
         VALUES ($1, $2, $3, 'booking', NOW() + INTERVAL '10 minutes')`,
        [destType, cleanContact, otpHash]
      );
    } catch (dbErr) {
      console.warn('Booking OTP DB store note:', dbErr.message);
    }

    // Dispatch Email / SMS
    if (isEmail) {
      await sendEmailOtp({
        to: cleanContact,
        otpCode: rawOtp,
        purpose: 'Elite Drone Booking Email Verification'
      });
    } else {
      await sendSmsOtp({
        mobile: cleanContact,
        otpCode: rawOtp,
        purpose: 'Elite Drone Booking Mobile Verification'
      });
    }

    return res.json({
      success: true,
      message: isEmail ? 'OTP sent successfully to your email address.' : 'OTP sent successfully to your mobile number.',
      countdownSeconds: 90,
    });
  } catch (err) {
    console.error('Error in /send-otp:', err);
    return res.status(500).json({ success: false, message: 'Unable to send OTP. Please try again.' });
  }
});

// 2. Verify Booking Email/Mobile OTP
app.post('/verify-otp', bookingOtpLimiter, async (req, res) => {
  try {
    const { contact, otp } = req.body;
    if (!contact || !otp) {
      return res.status(400).json({ success: false, message: 'Contact and OTP are required' });
    }

    const cleanContact = String(contact).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{4}$/.test(cleanOtp)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 4-digit OTP' });
    }

    let isVerified = false;

    // Check database first
    try {
      const dbRes = await db.query(
        `SELECT id, otp_hash, attempts FROM otp_verifications 
         WHERE LOWER(destination) = $1 AND purpose = 'booking' AND is_verified = FALSE AND expires_at > NOW() 
         ORDER BY id DESC LIMIT 1`,
        [cleanContact]
      );
      if (dbRes.rows.length > 0) {
        const record = dbRes.rows[0];
        if (record.attempts >= 5) {
          return res.status(400).json({ success: false, message: 'Maximum OTP attempts exceeded. Please request a new code.' });
        }
        await db.query('UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1', [record.id]);
        const match = await bcrypt.compare(cleanOtp, record.otp_hash);
        if (match) {
          isVerified = true;
          await db.query(`UPDATE otp_verifications SET is_verified = TRUE WHERE id = $1`, [record.id]);
          bookingOtps.delete(cleanContact);
        }
      }
    } catch (dbErr) {
      // Fallback to memory store below
    }

    // Fallback check in memory store if DB record wasn't available
    if (!isVerified) {
      const memRecord = bookingOtps.get(cleanContact);
      if (memRecord && Date.now() < memRecord.expiresAt) {
        const match = await bcrypt.compare(cleanOtp, memRecord.otpHash);
        if (match) {
          isVerified = true;
          bookingOtps.delete(cleanContact);
        }
      }
    }

    if (isVerified) {
      return res.json({
        success: true,
        message: 'Your OTP is verified'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please enter your valid OTP'
      });
    }
  } catch (err) {
    console.error('Error in /verify-otp:', err);
    return res.status(500).json({ success: false, message: 'Please enter your valid OTP' });
  }
});

// 3. Booking Owner Notification & Central Database Record (Authenticated only)
app.post('/api/booking/notify', protect, async (req, res) => {
  try {
    const booking = req.body || {};
    const userId = req.user.id;
    const customerName = String(booking.customerName || booking.name || req.user.full_name || 'Valued Customer').trim();
    const email = String(booking.email || req.user.email || '').trim().toLowerCase();
    const mobile = String(booking.mobile || '0000000000').trim();
    const serviceName = String(booking.service || booking.event || 'Aerial Photography').trim();
    const eventDate = booking.startDate || booking.date || new Date().toISOString().slice(0, 10);
    const endDate = booking.endDate || eventDate;
    const address = String(booking.location || booking.address || 'Address provided on file').trim();

    if (!email || !address) {
      return res.status(400).json({ success: false, message: 'Valid email and address are required.' });
    }

    // Calculate booking days & total amount server-side from persistent settings
    let days = parseInt(booking.numberOfDays, 10) || 1;
    if (booking.startDate && booking.endDate) {
      const sDate = new Date(`${booking.startDate}T00:00:00Z`);
      const eDate = new Date(`${booking.endDate}T00:00:00Z`);
      if (!Number.isNaN(sDate.getTime()) && !Number.isNaN(eDate.getTime()) && eDate >= sDate) {
        days = Math.floor((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
      }
    }
    days = Math.max(1, Math.min(days, 365));

    let baseRate = 1999;
    try {
      const rateSetting = await db.query("SELECT value FROM settings WHERE key = 'base_rate'");
      if (rateSetting.rows.length > 0 && Number(rateSetting.rows[0].value) > 0) {
        baseRate = Number(rateSetting.rows[0].value);
      }
    } catch (e) {}

    const amount = days * baseRate;

    // Never trust client-claimed "Paid" or "Confirmed" status without server-side payment verification
    const rawPaymentText = String(booking.paymentStatus || booking.paymentMode || '').toLowerCase();
    const isOffline = rawPaymentText.includes('offline');
    const paymentMode = isOffline ? 'Cash / Pay on Shoot' : 'UPI';
    const paymentStatus = isOffline ? 'Pending (Pay on Shoot)' : 'Pending Verification';

    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const bookingRef = `ELD-${dateStamp}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const svcRes = await db.query('SELECT id FROM services WHERE is_active = TRUE LIMIT 1');
    const serviceId = svcRes.rows.length > 0 ? svcRes.rows[0].id : 1;

    const insertRes = await db.query(`
      INSERT INTO bookings (
        booking_reference, user_id, customer_name, email, mobile, event_type,
        service_id, event_date, event_time, event_location, complete_address,
        total_amount, payment_mode, payment_status,
        status, admin_notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, '10:00:00', $9, $10,
        $11, $12, $13,
        'Pending', $14
      )
      RETURNING *
    `, [
      bookingRef,
      userId,
      customerName,
      email,
      mobile,
      serviceName,
      serviceId,
      eventDate,
      address.slice(0, 140),
      address,
      amount,
      paymentMode,
      paymentStatus,
      `Payment: ${paymentStatus} via ${paymentMode}. Server-calculated amount: ₹${amount} (${days} day(s) @ ₹${baseRate}/day). End Date: ${endDate}.`
    ]);

    await db.query(`
      INSERT INTO audit_logs (user_id, action, details, ip_address)
      VALUES ($1, 'BOOKING_CREATED', $2, $3)
    `, [userId, `Booking ${bookingRef} submitted (${serviceName} on ${eventDate}, ₹${amount})`, req.ip]);

    await db.query(`
      INSERT INTO notifications (user_id, title, message, type, action_url)
      VALUES ($1, 'Booking Request Received', $2, 'info', '/dashboard.html')
    `, [userId, `Your flight booking ${bookingRef} for ${serviceName} on ${eventDate} is pending review.`]);

    return res.status(201).json({
      success: true,
      message: 'Booking submitted successfully and is pending review.',
      bookingReference: bookingRef,
      booking: insertRes.rows[0],
    });
  } catch (err) {
    console.error('Error in /api/booking/notify:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit booking.' });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found`,
  });
});

// Fallback to index.html for frontend navigation if needed
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start Server
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚁 ELITE DRONE SERVICE backend running!`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🩺 Health: http://localhost:${PORT}/api/health`);
    console.log(`===============================================`);
  });

  const shutdown = () => {
    console.log('\nGracefully shutting down Elite Drone Service server...');
    server.close(() => {
      db.pool.end(() => {
        console.log('Database pool closed. Exiting process.');
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
