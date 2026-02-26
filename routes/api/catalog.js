const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const logger = require('../../utils/logger');

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, price, image_path FROM catalog_item ORDER BY id'
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching catalog items:', error);
    next(error);
  }
});

module.exports = router;

