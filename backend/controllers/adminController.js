const db = require('../config/db');

// 1. Dashboard Metrics & Revenue Analytics
exports.getMetrics = async (req, res) => {
  try {
    const customersCount = await db.query('SELECT count(*) FROM users');
    const bookingsCount = await db.query('SELECT count(*) FROM bookings');
    const pendingCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Pending'");
    const confirmedCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Confirmed'");
    const completedCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Completed'");
    const rejectedCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Rejected'");
    const cancelledCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Cancelled'");

    // Revenue calculation from database
    const revenueRes = await db.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
      FROM bookings
      WHERE status IN ('Confirmed', 'Completed') OR payment_status = 'Paid';
    `);

    // Recent activities
    const recentActivity = await db.query(`
      SELECT 
        b.id, b.booking_reference, b.customer_name, b.status, b.created_at, b.event_date,
        b.total_amount, b.payment_status,
        s.name AS service_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      ORDER BY b.created_at DESC
      LIMIT 8;
    `);

    res.json({
      success: true,
      metrics: {
        totalCustomers: parseInt(customersCount.rows[0].count, 10),
        totalBookings: parseInt(bookingsCount.rows[0].count, 10),
        pendingBookings: parseInt(pendingCount.rows[0].count, 10),
        confirmedBookings: parseInt(confirmedCount.rows[0].count, 10),
        completedBookings: parseInt(completedCount.rows[0].count, 10),
        rejectedBookings: parseInt(rejectedCount.rows[0].count, 10),
        cancelledBookings: parseInt(cancelledCount.rows[0].count, 10),
        totalRevenue: parseFloat(revenueRes.rows[0].total_revenue || 0),
        activeFleet: 8
      },
      recentActivity: recentActivity.rows,
    });
  } catch (err) {
    console.error('Error fetching admin metrics:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve administrative metrics' });
  }
};

// 2. Manage Bookings (List All with filter)
exports.getAllBookings = async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT 
        b.*,
        s.name AS service_name,
        p.name AS package_name,
        p.price AS package_price
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN packages p ON b.package_id = p.id
    `;
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      query += ` WHERE b.status = $1`;
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      bookings: result.rows,
    });
  } catch (err) {
    console.error('Error fetching admin bookings:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve bookings list' });
  }
};

// 3. Update Booking Status & Payment Management
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, payment_status } = req.body;

    const allowed = ['Pending', 'Confirmed', 'Rejected', 'Completed', 'Cancelled'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid booking status.' });
    }

    const check = await db.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const updated = await db.query(
      `UPDATE bookings 
       SET status = COALESCE($1, status),
           admin_notes = COALESCE($2, admin_notes),
           payment_status = COALESCE($3, payment_status),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status || null, admin_notes || null, payment_status || null, id]
    );

    // Record audit log
    await db.query(`
      INSERT INTO audit_logs (admin_id, action, details)
      VALUES ($1, 'BOOKING_STATUS_UPDATE', $2)
    `, [req.user.id, `Booking ${check.rows[0].booking_reference} status changed to ${status || check.rows[0].status}`]);

    res.json({
      success: true,
      message: `Booking ${updated.rows[0].booking_reference} updated to ${updated.rows[0].status}.`,
      booking: updated.rows[0],
    });
  } catch (err) {
    console.error('Error updating booking status:', err);
    res.status(500).json({ success: false, message: 'Failed to update booking status' });
  }
};

// 4. View Registered Customers
exports.getCustomers = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        u.id, u.full_name, u.gender, u.email, u.country_code, u.mobile, u.username, u.created_at,
        COUNT(b.id) AS total_bookings
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rows.length,
      customers: result.rows,
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve customers' });
  }
};

// 5. Gallery Management (Add & Delete)
exports.addGalleryItem = async (req, res) => {
  try {
    const { title, category, media_type, media_url, thumbnail_url, description, location } = req.body;
    if (!title || !category || !media_type || !media_url) {
      return res.status(400).json({ success: false, message: 'Title, category, type and URL are required.' });
    }

    const result = await db.query(
      `INSERT INTO gallery_items (title, category, media_type, media_url, thumbnail_url, description, location, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
      [title, category, media_type, media_url, thumbnail_url || media_url, description || '', location || '']
    );

    // Record audit log
    await db.query(`
      INSERT INTO audit_logs (admin_id, action, details)
      VALUES ($1, 'GALLERY_ITEM_ADDED', $2)
    `, [req.user.id, `Added gallery item: ${title} (${category})`]);

    res.status(201).json({
      success: true,
      message: 'New media item added to portfolio gallery.',
      item: result.rows[0]
    });
  } catch (err) {
    console.error('Error adding gallery item:', err);
    res.status(500).json({ success: false, message: 'Failed to add gallery item' });
  }
};

exports.deleteGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await db.query('SELECT id, title FROM gallery_items WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Gallery item not found' });
    }

    await db.query('DELETE FROM gallery_items WHERE id = $1', [id]);

    // Record audit log
    await db.query(`
      INSERT INTO audit_logs (admin_id, action, details)
      VALUES ($1, 'GALLERY_ITEM_DELETED', $2)
    `, [req.user.id, `Deleted gallery item ID: ${id} (${check.rows[0].title})`]);

    res.json({ success: true, message: 'Gallery item removed from portfolio.' });
  } catch (err) {
    console.error('Error deleting gallery item:', err);
    res.status(500).json({ success: false, message: 'Failed to delete gallery item' });
  }
};

// 6. Customer Reviews Moderation
exports.getAllReviews = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.*, u.username, u.email
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC;
    `);

    res.json({
      success: true,
      count: result.rows.length,
      reviews: result.rows
    });
  } catch (err) {
    console.error('Error fetching admin reviews:', err);
    res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
};

exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid review status.' });
    }

    const updated = await db.query(
      'UPDATE reviews SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found.' });
    }

    // Record audit log
    await db.query(`
      INSERT INTO audit_logs (admin_id, action, details)
      VALUES ($1, 'REVIEW_STATUS_UPDATE', $2)
    `, [req.user.id, `Review ID ${id} status set to ${status}`]);

    res.json({
      success: true,
      message: `Review marked as ${status}.`,
      review: updated.rows[0]
    });
  } catch (err) {
    console.error('Error updating review status:', err);
    res.status(500).json({ success: false, message: 'Failed to update review status' });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM reviews WHERE id = $1', [id]);

    await db.query(`
      INSERT INTO audit_logs (admin_id, action, details)
      VALUES ($1, 'REVIEW_DELETED', $2)
    `, [req.user.id, `Deleted review ID ${id}`]);

    res.json({ success: true, message: 'Review removed successfully.' });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
};

// 7. System Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await db.query(`
      SELECT 
        l.id, l.action, l.details, l.created_at, l.ip_address,
        u.username AS customer_username,
        a.username AS admin_username
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN admin_users a ON l.admin_id = a.id
      ORDER BY l.created_at DESC
      LIMIT 50;
    `);
    res.json({ success: true, logs: logs.rows });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve audit logs' });
  }
};

// 8. Global Settings & Pricing (PostgreSQL Backed)
exports.getSettings = async (req, res) => {
  try {
    const result = await db.query('SELECT key, value FROM settings');
    const settingsMap = {};
    result.rows.forEach(r => { settingsMap[r.key] = r.value; });

    res.json({
      success: true,
      settings: {
        siteName: settingsMap.business_name || 'Elite Drone Service',
        upiId: settingsMap.upi_id || 'hariharihari28163-3@okaxis',
        ratePerDay: Number(settingsMap.base_rate || 1999),
        baseRate: Number(settingsMap.base_rate || 1999),
        cinematicSurcharge: Number(settingsMap.cinematic_surcharge || 999),
        rushPermitFee: Number(settingsMap.rush_permit_fee || 1499),
        contactEmail: settingsMap.emergency_email || 'support@elitedrone.com',
        supportPhone: settingsMap.support_hotline || '+91 98765 43210',
        dgcaCompliant: true,
        maxFlightRadiusKm: 50,
        activeFleetSize: 8,
        twoFactorRequired: true
      }
    });
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { hotline, email, upi, base_rate, rush_permit_fee, cinematic_surcharge, siteName } = req.body;
    const updates = [];
    if (upi) updates.push(['upi_id', upi]);
    if (hotline) updates.push(['support_hotline', hotline]);
    if (email) updates.push(['emergency_email', email]);
    if (base_rate) updates.push(['base_rate', String(base_rate)]);
    if (rush_permit_fee) updates.push(['rush_permit_fee', String(rush_permit_fee)]);
    if (cinematic_surcharge) updates.push(['cinematic_surcharge', String(cinematic_surcharge)]);
    if (siteName) updates.push(['business_name', siteName]);

    for (const [k, v] of updates) {
      await db.query(`
        INSERT INTO settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `, [k, v]);
    }

    // Record audit log
    await db.query(`
      INSERT INTO audit_logs (admin_id, action, details)
      VALUES ($1, 'SETTINGS_UPDATE', $2)
    `, [req.user ? req.user.id : 1, `Settings updated: ${updates.map(u => u[0]).join(', ')}`]);

    res.json({
      success: true,
      message: 'Platform configurations saved to database successfully!'
    });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};
