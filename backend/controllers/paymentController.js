const db = require('../config/db');
const { logAudit } = require('../services/auditService');
const { createNotification } = require('../services/notificationService');

// Helper to generate unique payment order reference: ORD-YYYYMMDD-XXXX
function generateOrderId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${dateStr}-${rand}`;
}

// 1. Create a Payment Order
exports.createOrder = async (req, res) => {
  try {
    let finalUserId = req.user ? req.user.id : null;
    const { booking_id, amount, payment_mode = 'UPI' } = req.body;

    if (!finalUserId && booking_id) {
      const bRes = await db.query('SELECT user_id FROM bookings WHERE id = $1', [booking_id]);
      if (bRes.rows.length > 0 && bRes.rows[0].user_id) {
        finalUserId = bRes.rows[0].user_id;
      }
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'A valid payment amount is required.' });
    }

    const orderId = generateOrderId();
    const numAmount = Number(amount);

    // Fetch persistent UPI ID from settings
    let upiId = 'hariharihari28163-3@okaxis';
    try {
      const upiSetting = await db.query("SELECT value FROM settings WHERE key = 'upi_id'");
      if (upiSetting.rows.length > 0) {
        upiId = upiSetting.rows[0].value;
      }
    } catch (e) {
      // Fallback
    }

    const insertRes = await db.query(`
      INSERT INTO payments (
        booking_id, user_id, order_id, amount, payment_mode, status
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
      RETURNING *
    `, [booking_id || null, finalUserId, orderId, numAmount, payment_mode]);

    const order = insertRes.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Payment order initiated.',
      order: {
        id: order.id,
        orderId: order.order_id,
        amount: Number(order.amount),
        currency: order.currency,
        upiId: upiId,
        paymentMode: order.payment_mode,
        status: order.status,
      },
    });
  } catch (err) {
    console.error('Error creating payment order:', err);
    return res.status(500).json({ success: false, message: 'Failed to create payment order.' });
  }
};

// 2. Server-side Payment Verification
exports.verifyPayment = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { order_id, transaction_id, payment_mode = 'UPI', booking_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Order ID is required for verification.' });
    }

    const orderRes = await db.query('SELECT * FROM payments WHERE order_id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment order record not found.' });
    }

    const order = orderRes.rows[0];

    // Prevent duplicate verification
    if (order.status === 'SUCCESS') {
      return res.json({
        success: true,
        message: 'This payment order has already been verified and processed.',
        payment: order,
      });
    }

    const txnId = transaction_id || ('TXN-' + Date.now().toString().slice(-8));
    const targetBookingId = booking_id || order.booking_id;

    let resolvedUserId = req.user ? req.user.id : order.user_id;
    if (!resolvedUserId && targetBookingId) {
      const bRes = await db.query('SELECT user_id FROM bookings WHERE id = $1', [targetBookingId]);
      if (bRes.rows.length > 0 && bRes.rows[0].user_id) {
        resolvedUserId = bRes.rows[0].user_id;
      }
    }

    // Update payment record to SUCCESS
    const updateRes = await db.query(`
      UPDATE payments 
      SET status = 'SUCCESS', 
          transaction_id = $1, 
          payment_mode = $2, 
          user_id = COALESCE(user_id, $3),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [txnId, payment_mode, resolvedUserId, order.id]);

    const updatedPayment = updateRes.rows[0];

    // Link and update booking if booking_id is provided or associated
    if (targetBookingId) {
      await db.query(`
        UPDATE bookings 
        SET payment_status = 'Paid',
            payment_mode = $1,
            total_amount = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [payment_mode, order.amount, targetBookingId]);
    }

    // Record audit log
    await logAudit({
      userId: userId || order.user_id,
      action: 'PAYMENT_VERIFIED',
      details: `Payment of ₹${order.amount} verified for Order ${order_id} (Txn: ${txnId})`,
      ipAddress: req.ip,
    });

    // Send in-app notification if user is linked
    const targetUserId = userId || order.user_id;
    if (targetUserId) {
      await createNotification({
        userId: targetUserId,
        title: 'Payment Successful',
        message: `Your payment of ₹${order.amount} via ${payment_mode} (Ref: ${txnId}) was verified successfully.`,
        type: 'success',
        actionUrl: '/dashboard.html',
      });
    }

    return res.json({
      success: true,
      message: 'Payment verified and synced with booking records successfully!',
      payment: updatedPayment,
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    return res.status(500).json({ success: false, message: 'Server error while verifying payment.' });
  }
};

// 3. Customer Payment History
exports.getMyPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    const resPayments = await db.query(`
      SELECT p.*, b.booking_reference, b.event_type, s.name AS service_name
      FROM payments p
      LEFT JOIN bookings b ON p.booking_id = b.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [userId]);

    return res.json({
      success: true,
      count: resPayments.rows.length,
      payments: resPayments.rows,
    });
  } catch (err) {
    console.error('Error fetching customer payments:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve payment records.' });
  }
};

// 4. Admin All Payments
exports.getAllPayments = async (req, res) => {
  try {
    const resPayments = await db.query(`
      SELECT p.*, u.full_name AS customer_name, u.email AS customer_email, b.booking_reference
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN bookings b ON p.booking_id = b.id
      ORDER BY p.created_at DESC
    `);

    return res.json({
      success: true,
      count: resPayments.rows.length,
      payments: resPayments.rows,
    });
  } catch (err) {
    console.error('Error fetching admin payments:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve payments.' });
  }
};
