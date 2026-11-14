const db = require('../config/db');

/**
 * Record an audit log entry in PostgreSQL
 * @param {Object} params
 * @param {number|null} [params.userId]
 * @param {number|null} [params.adminId]
 * @param {string} params.action - E.g. 'LOGIN', 'BOOKING_CREATED', 'STATUS_CHANGE', 'PASSWORD_RESET'
 * @param {string} params.details - Descriptive details of the action (no passwords/tokens)
 * @param {string} [params.ipAddress]
 */
async function logAudit({ userId = null, adminId = null, action, details = '', ipAddress = '127.0.0.1' }) {
  try {
    if (!action) return;
    await db.query(`
      INSERT INTO audit_logs (user_id, admin_id, action, details, ip_address)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, adminId, action, details, ipAddress]);
  } catch (err) {
    // Non-blocking error handling for audit trail
    console.error('Audit log write notice:', err.message);
  }
}

module.exports = { logAudit };
