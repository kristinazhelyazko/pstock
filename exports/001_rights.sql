-- Data for table rights
INSERT INTO rights (id, name) VALUES (1, 'сотрудник');
INSERT INTO rights (id, name) VALUES (2, 'администратор');
INSERT INTO rights (id, name) VALUES (37, 'разработчик');
SELECT setval(pg_get_serial_sequence('rights', 'id'), COALESCE((SELECT MAX(id) FROM rights), 0), true);
