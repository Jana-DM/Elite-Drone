const db = require('../config/db');

async function testConnection() {
  console.log('Testing PostgreSQL connection...');
  try {
    const res = await db.query('SELECT NOW() as current_time, current_database() as database');
    console.log('✅ Connection SUCCESSFUL!');
    console.log(`⏰ Server Time: ${res.rows[0].current_time}`);
    console.log(`📦 Database: ${res.rows[0].database}`);

    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('\n📊 Tables in public schema:');
    tables.rows.forEach(t => console.log(`  - ${t.table_name}`));
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection FAILED:', err.message);
    process.exit(1);
  }
}

testConnection();

