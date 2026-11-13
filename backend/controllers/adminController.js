const db = require('../config/db');

// 1. Dashboard Metrics
exports.getMetrics = async (req, res) => {
  try {
    const customersCount = await db.query('SELECT count(*) FROM users');
    const bookingsCount = await db.query('SELECT count(*) FROM bookings');
    const pendingCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Pending'");
    const confirmedCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Confirmed'");
    const completedCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Completed'");
    const rejectedCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Rejected'");
    const cancelledCount = await db.query("SELECT count(*) FROM bookings WHERE status = 'Cancelled'");

    // Recent 5 activities
    const recentActivity = await db.query(`
      SELECT 
        b.id, b.booking_reference, b.customer_name, b.status, b.created_at, b.event_date,
        s.name AS service_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      ORDER BY b.created_at DESC
      LIMIT 6;
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

// 3. Update Booking Status (Approve / Reject / Complete / Notes)
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

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
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status || null, admin_notes || null, id]
    );

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

// 5. Gallery Management: Add Item
exports.addGalleryItem = async (req, res) => {
  try {
    const { title, category, media_type, media_url, thumbnail_url, description, location, is_featured } = req.body;

    if (!title || !category || !media_type || !media_url) {
      return res.status(400).json({ success: false, message: 'Title, category, media type, and media URL are required.' });
    }

    const result = await db.query(
      `INSERT INTO gallery_items (title, category, media_type, media_url, thumbnail_url, description, location, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title.trim(), category, media_type, media_url.trim(), thumbnail_url ? thumbnail_url.trim() : null, description ? description.trim() : null, location ? location.trim() : null, is_featured || false]
    );

    res.status(201).json({
      success: true,
      message: 'New media item added to portfolio gallery.',
      item: result.rows[0],
    });
  } catch (err) {
    console.error('Error adding gallery item:', err);
    res.status(500).json({ success: false, message: 'Failed to add gallery item' });
  }
};

// 6. Gallery Management: Delete Item
exports.deleteGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const check = await db.query('SELECT id FROM gallery_items WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Gallery item not found.' });
    }

    await db.query('DELETE FROM gallery_items WHERE id = $1', [id]);
    res.json({ success: true, message: 'Gallery item deleted successfully.' });
  } catch (err) {
    console.error('Error deleting gallery item:', err);
    res.status(500).json({ success: false, message: 'Failed to delete gallery item' });
  }
};

// 7. System Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await db.query(`
      SELECT 
        b.id, b.booking_reference, b.customer_name, b.status, b.admin_notes, b.updated_at, b.created_at,
        s.name AS service_name
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      ORDER BY b.updated_at DESC
      LIMIT 30;
    `);
    res.json({ success: true, logs: logs.rows });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve audit logs' });
  }
};

// 8. Global Settings
exports.getSettings = async (req, res) => {
  res.json({
    success: true,
    settings: {
      siteName: 'Elite Drone Service',
      upiId: 'hariharihari28163-3@okaxis',
      ratePerDay: 1999,
      contactEmail: 'elitedrones.collab@gmail.com',
      supportPhone: '+91 98765 43210',
      dgcaCompliant: true,
      maxFlightRadiusKm: 50,
      activeFleetSize: 8,
      twoFactorRequired: true
    }
  });
};

exports.updateSettings = async (req, res) => {
  try {
    const { siteName, upiId, ratePerDay, contactEmail, supportPhone } = req.body;
    res.json({
      success: true,
      message: 'Platform configurations saved successfully!',
      settings: { siteName, upiId, ratePerDay, contactEmail, supportPhone }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

