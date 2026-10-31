const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
  console.log('🔄 Starting Elite Drone Service database migration...');

  // 1. First ensure target database exists
  const rootPool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });

  const targetDb = process.env.DB_NAME || 'elite_drone';

  try {
    const checkDb = await rootPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb]
    );
    if (checkDb.rows.length === 0) {
      console.log(`📦 Database '${targetDb}' does not exist. Creating...`);
      await rootPool.query(`CREATE DATABASE ${targetDb}`);
      console.log(`✅ Database '${targetDb}' created successfully.`);
    } else {
      console.log(`ℹ️ Database '${targetDb}' already exists.`);
    }
  } catch (err) {
    console.error('⚠️ Notice checking root database:', err.message);
  } finally {
    await rootPool.end();
  }

  // 2. Connect to the application database and apply schema
  const dbPool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: targetDb,
  });

  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    console.log('📜 Executing schema.sql...');
    await dbPool.query(schemaSql);
    console.log('✅ Schema migration completed successfully!');

    // 3. Run seeds
    const seed = require('./seed');
    await seed.runSeed(dbPool);

    console.log('🎉 Database setup and initial seeding completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await dbPool.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };

