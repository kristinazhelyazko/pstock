const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const logger = require('../utils/logger');

async function seed() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog_item (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INTEGER NOT NULL,
        image_path TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const elementsDir = path.join(__dirname, '..', 'elements');
    const files = fs.readdirSync(elementsDir).filter((f) => /\.(jpe?g|png)$/i.test(f));

    logger.info(`Found ${files.length} catalog image files`);

    for (const file of files) {
      const base = path.basename(file, path.extname(file));
      const name = base.replace(/[_\-]+/g, ' ').trim();
      const price = 0;
      const imagePath = `/elements/${file}`;

      const existing = await pool.query(
        'SELECT id FROM catalog_item WHERE image_path = $1',
        [imagePath]
      );
      if (existing.rows.length > 0) {
        logger.info(`Catalog item for ${file} already exists, skipping`);
        continue;
      }

      await pool.query(
        'INSERT INTO catalog_item (name, price, image_path) VALUES ($1, $2, $3)',
        [name, price, imagePath]
      );
      logger.info(`Inserted catalog item: ${name} (${imagePath})`);
    }

    logger.info('Catalog seed completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error seeding catalog from elements:', error);
    process.exit(1);
  }
}

seed();
