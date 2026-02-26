-- Дополнительное поле для хранения времени "по"
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS execution_time_to TIME;

-- Для существующих заказов заполняем временем "с"
UPDATE orders
SET execution_time_to = execution_time
WHERE execution_time_to IS NULL;

