const express = require('express');
const router = express.Router();

// API routes
router.use('/addresses', require('./addresses'));
router.use('/categories', require('./categories'));
router.use('/items', require('./items'));
router.use('/sections', require('./sections'));
router.use('/stock', require('./stock'));
router.use('/replenish', require('./replenish'));
router.use('/reports', require('./reports'));
router.use('/catalog', require('./catalog'));
router.use('/consent', require('./consent'));
router.use('/store', require('./store'));

module.exports = router;
