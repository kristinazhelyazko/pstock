-- Data for table category
INSERT INTO category (id, name, address_id, created_at) VALUES (1, 'бар', 1, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (2, 'цветы', 1, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (3, 'кухня', 1, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (4, 'цех', 1, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (5, 'бар', 2, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (6, 'цветы', 2, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (7, 'кухня', 2, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (8, 'цех', 2, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (9, 'бар', 3, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (10, 'цветы', 3, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (11, 'кухня', 3, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (12, 'цех', 3, 'Sun Dec 07 2025 01:43:27 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (229, 'бар', 55, 'Wed Feb 18 2026 00:44:11 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (230, 'цветы', 55, 'Wed Feb 18 2026 00:44:11 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (231, 'кухня', 55, 'Wed Feb 18 2026 00:44:11 GMT+0300 (Москва, стандартное время)');
INSERT INTO category (id, name, address_id, created_at) VALUES (232, 'цех', 55, 'Wed Feb 18 2026 00:44:11 GMT+0300 (Москва, стандартное время)');
SELECT setval(pg_get_serial_sequence('category', 'id'), COALESCE((SELECT MAX(id) FROM category), 0), true);
