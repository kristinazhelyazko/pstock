const { Pool } = require('pg');
const dotenv = require('dotenv');
const envResult = dotenv.config();

function resolveSslOption() {
  const val = (process.env.DATABASE_SSL || '').toLowerCase().trim();
  if (val === 'true' || val === '1' || val === 'yes') return { rejectUnauthorized: false };
  if (val === 'false' || val === '0' || val === 'no') return false;
  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

const connectionString =
  (envResult.parsed && envResult.parsed.DATABASE_URL) || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: resolveSslOption(),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;


