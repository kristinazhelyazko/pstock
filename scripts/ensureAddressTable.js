const pool = require('../config/database');
const logger = require('../utils/logger');

async function ensureAddress() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS address (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(
      `INSERT INTO address (name) VALUES ('Белгород'), ('Северный'), ('Строитель')
       ON CONFLICT (name) DO NOTHING`
    );

    logger.info('Address table ensured and base rows inserted');
    process.exit(0);
  } catch (error) {
    logger.error('Error ensuring address table:', error);
    process.exit(1);
  }
}

ensureAddress();

