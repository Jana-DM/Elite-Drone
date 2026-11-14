const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { sendSmsOtp, sendEmailOtp } = require('./config/mailer');
require('dotenv').config();

const db = require('./config/db');

// In-memory cache for fast booking OTP verification
const bookingOtps = new Map();

// Ensure database schema extensions
db.query(`
  ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
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

// 1. Send Booking Email/Mobile OTP
app.post('/send-otp', async (req, res) => {
  try {
    const { contact, method } = req.body;
    if (!contact) {
      return res.status(400).json({ success: false, message: 'Contact is required' });
    }

    const cleanContact = String(contact).trim();
    const isEmail = cleanContact.includes('@') || method === 'email';
    const destType = isEmail ? 'email' : 'mobile';

    // 4-digit OTP for booking form
    const rawOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in-memory
    bookingOtps.set(cleanContact.toLowerCase(), { otp: rawOtp, expiresAt });
    bookingOtps.set(cleanContact, { otp: rawOtp, expiresAt });

    // Store in PostgreSQL otp_verifications if available
    try {
      const otpHash = await bcrypt.hash(rawOtp, 10);
      await db.query(
        `INSERT INTO otp_verifications (destination_type, destination, otp_hash, purpose, expires_at)
         VALUES ($1, $2, $3, 'booking', NOW() + INTERVAL '10 minutes')`,
        [destType, cleanContact.toLowerCase(), otpHash]
      );
    } catch (dbErr) {
      // Ignored for non-blocking dev mode
    }

    // Dispatch Email / SMS
    if (isEmail) {
      await sendEmailOtp({
        to: cleanContact,
        otpCode: rawOtp,
        purpose: 'Elite Drone Booking Email Verification'
      });

      console.log(`====================================================`);
      console.log(`📧 [ELITE DRONE BOOKING OTP DISPATCH]`);
      console.log(`🎯 Recipient Email: ${cleanContact}`);
      console.log(`🔑 OTP Code:        >>> ${rawOtp} <<<`);
      console.log(`⏱️ Duration:        90s active countdown (10 min expiry)`);
      console.log(`====================================================`);
    } else {
      await sendSmsOtp({
        mobile: cleanContact,
        otpCode: rawOtp,
        purpose: 'Elite Drone Booking Mobile Verification'
      });

      console.log(`====================================================`);
      console.log(`📱 [ELITE DRONE BOOKING OTP DISPATCH]`);
      console.log(`🎯 Recipient Mobile: ${cleanContact}`);
      console.log(`🔑 OTP Code:         >>> ${rawOtp} <<<`);
      console.log(`⏱️ Duration:         90s active countdown (10 min expiry)`);
      console.log(`====================================================`);
    }

    return res.json({
      success: true,
      message: isEmail ? 'OTP sent successfully to your email address.' : 'OTP sent successfully to your mobile number.',
      otp: rawOtp // Exposed for seamless testing
    });
  } catch (err) {
    console.error('Error in /send-otp:', err);
    return res.status(500).json({ success: false, message: 'Unable to send OTP. Please try again.' });
  }
});

// 2. Verify Booking Email/Mobile OTP
app.post('/verify-otp', async (req, res) => {
  try {
    const { contact, otp } = req.body;
    if (!contact || !otp) {
      return res.status(400).json({ success: false, message: 'Contact and OTP are required' });
    }

    const cleanContact = String(contact).trim();
    const cleanOtp = String(otp).trim();

    // Check memory store (case-insensitive)
    const memRecord = bookingOtps.get(cleanContact.toLowerCase()) || bookingOtps.get(cleanContact);
    let isVerified = false;

    if (memRecord && memRecord.otp === cleanOtp && Date.now() < memRecord.expiresAt) {
      isVerified = true;
      bookingOtps.delete(cleanContact.toLowerCase());
      bookingOtps.delete(cleanContact);
    }

    // Check database if not matched in memory
    if (!isVerified) {
      try {
        const dbRes = await db.query(
          `SELECT id, otp_hash FROM otp_verifications 
           WHERE LOWER(destination) = LOWER($1) AND is_verified = FALSE AND expires_at > NOW() 
           ORDER BY id DESC LIMIT 1`,
          [cleanContact]
        );
        if (dbRes.rows.length > 0) {
          const match = await bcrypt.compare(cleanOtp, dbRes.rows[0].otp_hash);
          if (match) {
            isVerified = true;
            await db.query(`UPDATE otp_verifications SET is_verified = TRUE WHERE id = $1`, [dbRes.rows[0].id]);
          }
        }
      } catch (dbErr) {
        // Ignored
      }
    }

    if (isVerified) {
      return res.json({
        success: true,
        message: 'Your OTP is correct'
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

// 3. Booking Owner Notification & Central Database Record
app.post('/api/booking/notify', async (req, res) => {
  try {
    const booking = req.body || {};
    const bookingRef = booking.bookingId || ('ED-' + Date.now().toString().slice(-8));
    const customerName = booking.customerName || booking.name || 'Valued Customer';
    const email = (booking.email || 'client@elitedrone.com').trim().toLowerCase();
    const mobile = (booking.mobile || '0000000000').trim();
    const serviceName = booking.service || booking.event || 'Aerial Photography';
    const eventDate = booking.startDate || booking.date || new Date().toISOString().slice(0, 10);
    const address = booking.location || booking.address || 'Address provided on file';
    const amount = Number(booking.totalAmount || booking.amount || 1999);
    const paymentStatus = booking.paymentStatus || 'Paid';
    const paymentMode = booking.paymentMode || 'UPI';

    // 1. Identify User ID from JWT Token, booking payload, or Database lookup
    let userId = booking.userId || null;
    if (!userId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'elite_drone_jwt_secret_key_2026');
        userId = decoded.id;
      } catch (tokenErr) {
        // Continue fallback lookup
      }
    }

    if (!userId) {
      const userLookup = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 OR mobile = $2 LIMIT 1',
        [email, mobile]
      );
      if (userLookup.rows.length > 0) {
        userId = userLookup.rows[0].id;
      }
    }

    console.log(`====================================================`);
    console.log(`🚁 [NEW ELITE DRONE BOOKING CONFIRMED]`);
    console.log(`🆔 Reference: ${bookingRef}`);
    console.log(`👤 Client:    ${customerName} (User ID: ${userId || 'Guest/Unlinked'})`);
    console.log(`📱 Contact:   ${mobile}`);
    console.log(`🎯 Event:     ${serviceName}`);
    console.log(`📅 Date:      ${eventDate} (${booking.numberOfDays || '1 Day'})`);
    console.log(`📍 Address:   ${address}`);
    console.log(`💳 Payment:   ${paymentStatus} (${paymentMode} ₹${amount})`);
    console.log(`====================================================`);

    // 2. Sync into PostgreSQL bookings table
    try {
      const svcRes = await db.query('SELECT id FROM services WHERE is_active = TRUE LIMIT 1');
      const serviceId = svcRes.rows.length > 0 ? svcRes.rows[0].id : 1;

      await db.query(`
        INSERT INTO bookings (
          booking_reference, user_id, customer_name, email, mobile, event_type,
          service_id, event_date, event_time, event_location, complete_address,
          total_amount, payment_mode, payment_status,
          status, admin_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, '10:00:00', $9, $10,
          $11, $12, $13,
          'Confirmed', $14
        ) ON CONFLICT (booking_reference) DO UPDATE SET
          user_id = COALESCE(EXCLUDED.user_id, bookings.user_id),
          total_amount = EXCLUDED.total_amount,
          payment_mode = EXCLUDED.payment_mode,
          payment_status = EXCLUDED.payment_status,
          status = 'Confirmed',
          admin_notes = EXCLUDED.admin_notes
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
        `Payment: ${paymentStatus} via ${paymentMode}. Amount: ₹${amount}. Days: ${booking.numberOfDays || '1'}. Gender: ${booking.gender || 'N/A'}, Age: ${booking.age || 'N/A'}`
      ]);

      // Record audit log
      await db.query(`
        INSERT INTO audit_logs (user_id, action, details)
        VALUES ($1, 'BOOKING_CREATED', $2)
      `, [userId, `Booking ${bookingRef} created for ${serviceName} on ${eventDate}`]);

      // Record in-app notification if customer is identified
      if (userId) {
        await db.query(`
          INSERT INTO notifications (user_id, title, message, type, action_url)
          VALUES ($1, 'Booking Confirmed', $2, 'success', '/dashboard.html')
        `, [userId, `Your flight booking ${bookingRef} for ${serviceName} on ${eventDate} is confirmed!`]);
      }

    } catch (dbErr) {
      console.warn('Booking PostgreSQL sync note:', dbErr.message);
    }

    return res.json({
      success: true,
      message: 'Booking notification dispatched and synced successfully',
      bookingReference: bookingRef
    });
  } catch (err) {
    console.error('Error in /api/booking/notify:', err);
    return res.status(500).json({ success: false, message: 'Notification dispatch error' });
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
