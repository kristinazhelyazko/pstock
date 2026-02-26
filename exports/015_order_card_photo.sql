-- Data for table order_card_photo
-- (no rows)
SELECT setval(pg_get_serial_sequence('order_card_photo', 'id'), COALESCE((SELECT MAX(id) FROM order_card_photo), 0), true);
