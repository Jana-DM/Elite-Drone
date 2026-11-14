const db = require('../config/db');

// 1. Get Approved Reviews (Public / Customer Facing)
exports.getApprovedReviews = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, customer_name, rating, comment, service_name, created_at
      FROM reviews
      WHERE status = 'Approved'
      ORDER BY created_at DESC
      LIMIT 12;
    `);

    res.json({
      success: true,
      count: result.rows.length,
      reviews: result.rows
    });
  } catch (err) {
    console.error('Error fetching approved reviews:', err);
    res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
};

// 2. Submit New Review (Authenticated Customer)
exports.createReview = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { rating, comment, service_name } = req.body;

    if (!rating || !comment) {
      return res.status(400).json({ success: false, message: 'Rating and comments are required.' });
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }

    // Get user details
    let customerName = 'Valued Customer';
    if (userId) {
      const uRes = await db.query('SELECT full_name, username FROM users WHERE id = $1', [userId]);
      if (uRes.rows.length > 0) {
        customerName = uRes.rows[0].full_name || uRes.rows[0].username;
      }
    } else if (req.body.customer_name) {
      customerName = req.body.customer_name;
    }

    const result = await db.query(`
      INSERT INTO reviews (user_id, customer_name, rating, comment, service_name, status)
      VALUES ($1, $2, $3, $4, $5, 'Approved')
      RETURNING *;
    `, [
      userId,
      customerName,
      ratingNum,
      comment.trim(),
      service_name || 'Commercial Aerial Shoot'
    ]);

    // Record audit log
    await db.query(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES ($1, 'CUSTOMER_REVIEW_SUBMIT', $2)
    `, [userId, `Review submitted by ${customerName}: ${ratingNum} stars`]);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully! Thank you for your feedback.',
      review: result.rows[0]
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
};

