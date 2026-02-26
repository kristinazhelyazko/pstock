const pool = require('../config/database');

async function run() {
  try {
    const info = await pool.query('SELECT current_database() AS db, current_user AS usr');
    const rows = await pool.query('SELECT id, name, price, image_path FROM catalog_item ORDER BY id');
    console.log('DB info:', info.rows[0]);
    console.log('catalog_item rows:', rows.rows);
    process.exit(0);
  } catch (e) {
    console.error('checkCatalogDb error', e);
    process.exit(1);
  }
}

run();

