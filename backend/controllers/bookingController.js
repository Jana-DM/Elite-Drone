const db = require('../config/db');
const { logAudit } = require('../services/auditService');
const { createNotification } = require('../services/notificationService');

// Helper to generate unique booking reference: ELD-YYYYMMDD-XXXX
function generateBookingReference() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ELD-${dateStr}-${rand}`;
}

// 1. Create a New Booking
exports.createBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      customer_name,
      email,
      mobile,
      event_type,
      service_id,
      package_id,
      event_date,
      event_time,
      event_location,
      complete_address,
      additional_requirements,
    } = req.body;

    // Validation
    if (!customer_name || !email || !mobile || !event_type || !service_id || !event_date || !event_time || !event_location || !complete_address) {
      return res.status(400).json({
        success: false,
        message: 'All required booking fields must be completed.',
      });
    }

    // Verify date is not in past
    const bookingDate = new Date(event_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Event date cannot be in the past.',
      });
    }

    // Verify service exists
    const serviceCheck = await db.query('SELECT name FROM services WHERE id = $1 AND is_active = TRUE', [service_id]);
    if (serviceCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Selected drone service not found.' });
    }

    // Prevent duplicate submission check (same user, same date, same service)
    const duplicateCheck = await db.query(
      `SELECT id, booking_reference FROM bookings 
       WHERE user_id = $1 AND event_date = $2 AND service_id = $3 AND status != 'Cancelled'`,
      [userId, event_date, service_id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `You already have an active booking (${duplicateCheck.rows[0].booking_reference}) for this service on ${event_date}.`,
      });
    }

    // Generate unique reference and insert
    let reference = generateBookingReference();
    // In rare collision case, check reference
    let refCheck = await db.query('SELECT id FROM bookings WHERE booking_reference = $1', [reference]);
    while (refCheck.rows.length > 0) {
      reference = generateBookingReference();
      refCheck = await db.query('SELECT id FROM bookings WHERE booking_reference = $1', [reference]);
    }

    const amount = Number(req.body.total_amount || 1999.00);
    const paymentMode = req.body.payment_mode || 'UPI';
    const paymentStatus = req.body.payment_status || 'Paid';

    const insertQuery = `
      INSERT INTO bookings (
        booking_reference,
        user_id,
        customer_name,
        email,
        mobile,
        event_type,
        service_id,
        package_id,
        event_date,
        event_time,
        event_location,
        complete_address,
        additional_requirements,
        total_amount,
        payment_mode,
        payment_status,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'Pending')
      RETURNING *;
    `;

    const values = [
      reference,
      userId,
      customer_name.trim(),
      email.trim().toLowerCase(),
      mobile.trim(),
      event_type.trim(),
      service_id,
      package_id || null,
      event_date,
      event_time,
      event_location.trim(),
      complete_address.trim(),
      additional_requirements ? additional_requirements.trim() : null,
      amount,
      paymentMode,
      paymentStatus
    ];

    const result = await db.query(insertQuery, values);
    const booking = result.rows[0];

    // Audit log
    await logAudit({
      userId,
      action: 'BOOKING_CREATED',
      details: `Direct booking ${reference} created for ${serviceCheck.rows[0].name}`,
      ipAddress: req.ip,
    });

    // In-app customer notification
    await createNotification({
      userId,
      title: 'Booking Request Submitted',
      message: `Your booking request (${reference}) for ${serviceCheck.rows[0].name} has been received and is pending clearance.`,
      type: 'info',
      actionUrl: '/dashboard.html',
    });

    return res.status(201).json({
      success: true,
      message: 'Booking request submitted successfully! Your booking is currently Pending business approval.',
      booking: {
        ...booking,
        service_name: serviceCheck.rows[0].name,
      },
    });
  } catch (err) {
    console.error('Error creating booking:', err);
    return res.status(500).json({ success: false, message: 'Server error while saving booking.' });
  }
};

// 2. Get Bookings for Current Customer
exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const query = `
      SELECT 
        b.*,
        s.name AS service_name,
        s.slug AS service_slug,
        s.image_url AS service_image,
        p.name AS package_name,
        p.price AS package_price,
        p.duration_hours AS package_duration
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN packages p ON b.package_id = p.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC;
    `;

    const result = await db.query(query, [userId]);

    return res.json({
      success: true,
      count: result.rows.length,
      bookings: result.rows,
    });
  } catch (err) {
    console.error('Error fetching customer bookings:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve bookings.' });
  }
};

// 3. Customer Cancel Booking
exports.cancelBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    const bookingRes = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const booking = bookingRes.rows[0];

    if (booking.status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Cannot cancel an already completed flight mission.' });
    }

    if (booking.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'This booking is already cancelled.' });
    }

    await db.query(
      `UPDATE bookings 
       SET status = 'Cancelled', cancellation_reason = $1, updated_at = NOW() 
       WHERE id = $2`,
      [cancellation_reason || 'Cancelled by customer', id]
    );

    // Record audit log
    await logAudit({
      userId,
      action: 'BOOKING_CANCELLED',
      details: `Booking ${booking.booking_reference} cancelled. Reason: ${cancellation_reason || 'Customer request'}`,
      ipAddress: req.ip,
    });

    await createNotification({
      userId,
      title: 'Booking Cancelled',
      message: `Your booking (${booking.booking_reference}) was marked as cancelled.`,
      type: 'warning',
      actionUrl: '/dashboard.html',
    });

    return res.json({
      success: true,
      message: `Booking ${booking.booking_reference} has been cancelled successfully.`,
    });
  } catch (err) {
    console.error('Error cancelling booking:', err);
    return res.status(500).json({ success: false, message: 'Server error while cancelling booking.' });
  }
};

// 4. Customer Reschedule Booking
exports.rescheduleBooking = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { event_date, event_time, reschedule_reason } = req.body;

    if (!event_date) {
      return res.status(400).json({ success: false, message: 'Please provide a valid new event date.' });
    }

    const bookingRes = await db.query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const booking = bookingRes.rows[0];
    if (booking.status === 'Completed' || booking.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: `Cannot reschedule a ${booking.status.toLowerCase()} booking.` });
    }

    await db.query(
      `UPDATE bookings 
       SET event_date = $1, 
           event_time = COALESCE($2, event_time),
           status = 'Pending',
           admin_notes = COALESCE(admin_notes, '') || ' [Client Rescheduled to ' || $1 || ']',
           updated_at = NOW() 
       WHERE id = $3`,
      [event_date, event_time || null, id]
    );

    // Record audit log
    await logAudit({
      userId,
      action: 'BOOKING_RESCHEDULED',
      details: `Booking ${booking.booking_reference} rescheduled to ${event_date} ${event_time || ''}`,
      ipAddress: req.ip,
    });

    await createNotification({
      userId,
      title: 'Flight Rescheduled',
      message: `Your booking (${booking.booking_reference}) has been rescheduled to ${event_date}. Status set to Pending.`,
      type: 'info',
      actionUrl: '/dashboard.html',
    });

    return res.json({
      success: true,
      message: `Flight booking ${booking.booking_reference} has been rescheduled to ${event_date}. Status set to Pending review.`,
    });
  } catch (err) {
    console.error('Error rescheduling booking:', err);
    return res.status(500).json({ success: false, message: 'Server error while rescheduling booking.' });
  }
};
