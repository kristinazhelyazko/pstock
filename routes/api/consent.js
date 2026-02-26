const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const filePath = path.resolve(__dirname, '../../save.txt');
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return res.json({ text: '' });
        }
        return next(err);
      }
      res.json({ text: data || '' });
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

