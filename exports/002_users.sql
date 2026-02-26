-- Data for table users
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (1, 'postgres', '$2b$10$2Jb/hMXOStoQX3s54HQnq.0v8Tfc1BiTMUXOtNZl6Ac0/kc/6t2YW', 2, 'Sun Dec 07 2025 01:44:02 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (2, 'admin_test', '3344', 2, 'Sun Dec 21 2025 13:39:04 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (4, 'admin', '4321', 2, 'Wed Dec 24 2025 01:11:42 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (5, 'kris', '3344', 37, 'Sat Jan 24 2026 00:37:29 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (7, 'gubkina733', '$2b$10$BASSakp/uz/2uitw75RI5epxSadK/btpe2B1MEsI6CNbYNfJnqmle', 1, 'Mon Feb 02 2026 22:06:02 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (8, 'Novikova03', '$2b$10$S.5IHqrXhEFfsHd/T2XoiuFMUag3m76nuBOKcu1lZmzPcvp9rrZAm', 2, 'Tue Feb 03 2026 10:16:16 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (9, 'терновка', '$2b$10$hCWBEy6cmwYah/vjovjNNOrqwS31AaX1nd3PelsAyheLqGggbCIT6', 1, 'Sat Feb 07 2026 13:08:23 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (10, 'Северный', '$2b$10$t7tPEd8HW.casxB98DftVeGE0L4sR.Wzad8laRY8qQOWdYFjojfOC', 1, 'Sat Feb 07 2026 13:09:09 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (11, 'Строитель', '$2b$10$J3y6LC39E5rNnutGROpoNuX5oq3LA4yPyAq/Hqf7n8wa6tgWjJTky', 1, 'Sat Feb 07 2026 13:09:25 GMT+0300 (Москва, стандартное время)');
INSERT INTO users (id, login, password, rights_id, created_at) VALUES (12, 'Губкина', '$2b$10$ICLJy2P.0ik96/12D7fG.ufDuu/6WRmj0ORrtIAGm1gnZUTEUl5mm', 1, 'Sat Feb 07 2026 13:09:37 GMT+0300 (Москва, стандартное время)');
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 0), true);
