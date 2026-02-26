-- Data for table ordertype
INSERT INTO ordertype (id, name, called) VALUES (1, 'wedding', 'Свадебный букет');
INSERT INTO ordertype (id, name, called) VALUES (2, 'composition', 'Композиция');
INSERT INTO ordertype (id, name, called) VALUES (3, 'food', 'Еда');
INSERT INTO ordertype (id, name, called) VALUES (4, 'flowers_food', 'Цветы + еда');
INSERT INTO ordertype (id, name, called) VALUES (13, 'test', 'Тестовый заказ');
SELECT setval(pg_get_serial_sequence('ordertype', 'id'), COALESCE((SELECT MAX(id) FROM ordertype), 0), true);
