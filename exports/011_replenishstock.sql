-- Data for table replenishstock
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (26, 332, 18, 4, 'Thu Jan 08 2026 20:52:02 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (27, 392, 19, 6, 'Thu Jan 08 2026 20:52:42 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (28, 316, 20, 0, 'Thu Jan 08 2026 22:40:32 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (29, 150, 21, 0, 'Thu Jan 08 2026 22:56:30 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (31, 392, 22, 2, 'Thu Jan 08 2026 22:58:15 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (32, 316, 23, 3, 'Wed Jan 14 2026 19:33:22 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (33, 392, 24, 3, 'Mon Jan 19 2026 16:27:33 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (34, 150, 25, 2, 'Mon Jan 19 2026 21:47:44 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (35, 150, 26, 3, 'Mon Jan 19 2026 22:00:30 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (36, 333, 27, 2, 'Mon Jan 19 2026 22:03:39 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (37, 529, 28, 4, 'Mon Jan 19 2026 22:04:21 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (38, 324, 29, 2, 'Sat Jan 24 2026 00:33:42 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (39, 317, 30, 3, 'Sat Jan 24 2026 00:34:06 GMT+0300 (Москва, стандартное время)');
INSERT INTO replenishstock (id, item_id, replenish_id, qty, created_at) VALUES (40, 316, 31, 2, 'Sun Jan 25 2026 21:15:10 GMT+0300 (Москва, стандартное время)');
SELECT setval(pg_get_serial_sequence('replenishstock', 'id'), COALESCE((SELECT MAX(id) FROM replenishstock), 0), true);
