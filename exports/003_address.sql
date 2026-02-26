-- Data for table address
INSERT INTO address (id, name, created_at) VALUES (1, 'Белгород', 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO address (id, name, created_at) VALUES (2, 'Северный', 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO address (id, name, created_at) VALUES (3, 'Строитель', 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO address (id, name, created_at) VALUES (55, 'Тестовый магазин', 'Wed Feb 18 2026 00:44:05 GMT+0300 (Москва, стандартное время)');
SELECT setval(pg_get_serial_sequence('address', 'id'), COALESCE((SELECT MAX(id) FROM address), 0), true);
