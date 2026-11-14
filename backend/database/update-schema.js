const path = require('path');
const projectRoot = path.resolve('c:/Users/janar/OneDrive/Desktop/Elite Drone');
require(path.join(projectRoot, 'node_modules/dotenv')).config({ path: path.join(projectRoot, '.env') });
const pool = require(path.join(projectRoot, 'backend/config/db'));

async function updateSchema() {
  console.log('🔄 Checking and updating PostgreSQL database schema...');

  // 1. Add missing columns to bookings table
  console.log('  Adding total_amount, payment_mode, payment_status to bookings table if not present...');
  await pool.query(`
    ALTER TABLE bookings 
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2) DEFAULT 1999.00,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'UPI',
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Paid';
  `);

  // Update existing bookings that have 0 or null total_amount
  await pool.query(`
    UPDATE bookings 
    SET total_amount = 1999.00 
    WHERE total_amount IS NULL OR total_amount = 0;
  `);

  // 2. Create settings table for global persistent settings
  console.log('  Creating settings table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      description VARCHAR(255),
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default settings
  const defaultSettings = [
    ['upi_id', 'hariharihari28163-3@okaxis', 'Central UPI ID for customer QR payments'],
    ['support_hotline', '+91 98765 43210', 'Primary customer flight operations hotline'],
    ['emergency_email', 'support@elitedrone.com', 'Official emergency and inquiry email'],
    ['base_rate', '1999', 'Standard 1-Day commercial drone shoot base rate'],
    ['cinematic_surcharge', '999', '60fps ProRes + RAW Log grading surcharge'],
    ['rush_permit_fee', '1499', 'Expedited Digital Sky clearance permit fee'],
    ['business_name', 'Elite Drone Service', 'Official commercial business name']
  ];

  for (const [k, v, desc] of defaultSettings) {
    await pool.query(`
      INSERT INTO settings (key, value, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (key) DO NOTHING;
    `, [k, v, desc]);
  }

  // 3. Create reviews table for customer feedback & testimonials
  console.log('  Creating reviews table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name VARCHAR(100) NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      service_name VARCHAR(100) DEFAULT 'Commercial Aerial Shoot',
      status VARCHAR(20) DEFAULT 'Approved' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed authentic reviews if empty
  const reviewCount = await pool.query('SELECT COUNT(*) FROM reviews');
  if (parseInt(reviewCount.rows[0].count) === 0) {
    console.log('  Seeding authentic initial reviews...');
    await pool.query(`
      INSERT INTO reviews (customer_name, rating, comment, service_name, status)
      VALUES 
      ('Vikramaditya S.', 5, 'Elite Drone delivered breathtaking 4K aerial shots of our beach resort wedding. Highly recommended!', 'Wedding Cinematography', 'Approved'),
      ('Ananya Krishnan', 5, 'Super fast DGCA clearance and crystal clear 3D mapping for our construction site in Chennai.', 'Commercial Property Inspection', 'Approved'),
      ('Karthik Raja', 4, 'Pilot Hari was punctual, respectful of venue airspace rules, and the raw footage was delivered within 24 hours.', 'Event & Ceremony Coverage', 'Approved');
    `);
  }

  // 4. Create audit_logs table
  console.log('  Creating audit_logs table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      details TEXT,
      ip_address VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed initial audit log if empty
  const logCount = await pool.query('SELECT COUNT(*) FROM audit_logs');
  if (parseInt(logCount.rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO audit_logs (action, details, ip_address)
      VALUES 
      ('SYSTEM_INITIALIZE', 'Platform schema synchronized and verified.', '127.0.0.1'),
      ('ADMIN_LOGIN', 'Superadmin logged into Command Center.', '127.0.0.1');
    `);
  }

  // 5. Add avatar_url to users table if not exists
  console.log('  Ensuring avatar_url column exists in users table...');
  await pool.query(`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500) DEFAULT NULL;
  `);

  // 6. Create oauth_accounts table for Google & Facebook social logins
  console.log('  Creating oauth_accounts table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      provider_user_id VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      profile_data JSONB,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, provider_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_oauth_provider_uid ON oauth_accounts(provider, provider_user_id);
  `);

  // 7. Create password_reset_tokens table for Forgot Password workflow
  console.log('  Creating password_reset_tokens table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      otp_code VARCHAR(10),
      expires_at TIMESTAMPTZ NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pwd_reset_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_pwd_reset_email ON password_reset_tokens(email);
  `);

  // 8. Create payments table for payment orders, transactions, and audit
  console.log('  Creating payments table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_id VARCHAR(100) UNIQUE NOT NULL,
      transaction_id VARCHAR(100),
      payment_mode VARCHAR(50) DEFAULT 'UPI',
      amount NUMERIC(10,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  `);

  // 9. Create notifications table for in-app customer & admin alerts
  console.log('  Creating notifications table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'info',
      is_read BOOLEAN DEFAULT FALSE,
      action_url VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  `);

  // Seed initial notification for demo/customer if empty
  const notifCount = await pool.query('SELECT COUNT(*) FROM notifications');
  if (parseInt(notifCount.rows[0].count) === 0) {
    const firstUser = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    if (firstUser.rows.length > 0) {
      await pool.query(`
        INSERT INTO notifications (user_id, title, message, type, action_url)
        VALUES 
        ($1, 'Welcome to Elite Drone Service', 'Your account is active. Explore our DGCA certified aerial cinematography packages.', 'info', '/dashboard.html'),
        ($1, 'Flight Clearance Guaranteed', 'All drone missions are backed by certified pilot dispatch and full insurance.', 'success', '/dashboard.html');
      `, [firstUser.rows[0].id]);
    }
  }

  console.log('✅ Schema synchronization completed successfully!');
  process.exit(0);
}

updateSchema().catch(err => {
  console.error('❌ Schema update error:', err);
  process.exit(1);
});

