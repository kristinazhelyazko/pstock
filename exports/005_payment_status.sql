-- Data for table payment_status
INSERT INTO payment_status (id, name) VALUES (1, 'Оплачен полностью');
INSERT INTO payment_status (id, name) VALUES (2, 'Оплачен частично');
INSERT INTO payment_status (id, name) VALUES (3, 'Не оплачен');
SELECT setval(pg_get_serial_sequence('payment_status', 'id'), COALESCE((SELECT MAX(id) FROM payment_status), 0), true);
