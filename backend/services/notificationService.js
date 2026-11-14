const db = require('../config/db');

/**
 * Create a new user notification
 */
async function createNotification({ userId, title, message, type = 'info', actionUrl = '/dashboard.html' }) {
  try {
    if (!userId || !title || !message) return null;
    const res = await db.query(`
      INSERT INTO notifications (user_id, title, message, type, action_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, title, message, type, actionUrl]);
    return res.rows[0];
  } catch (err) {
    console.error('Notification creation notice:', err.message);
    return null;
  }
}

/**
 * Retrieve notifications for a user
 */
async function getUserNotifications(userId) {
  try {
    const res = await db.query(`
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [userId]);
    return res.rows;
  } catch (err) {
    console.error('Fetch notifications error:', err);
    return [];
  }
}

/**
 * Mark a single notification as read
 */
async function markNotificationRead(id, userId) {
  try {
    const res = await db.query(`
      UPDATE notifications 
      SET is_read = TRUE 
      WHERE id = $1 AND user_id = $2 
      RETURNING *
    `, [id, userId]);
    return res.rows.length > 0;
  } catch (err) {
    console.error('Mark notification read error:', err);
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 */
async function markAllNotificationsRead(userId) {
  try {
    await db.query(`
      UPDATE notifications 
      SET is_read = TRUE 
      WHERE user_id = $1 AND is_read = FALSE
    `, [userId]);
    return true;
  } catch (err) {
    console.error('Mark all read error:', err);
    return false;
  }
}

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};

