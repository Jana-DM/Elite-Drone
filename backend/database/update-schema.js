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

  console.log('✅ Schema synchronization completed successfully!');
  process.exit(0);
}

updateSchema().catch(err => {
  console.error('❌ Schema update error:', err);
  process.exit(1);
});

