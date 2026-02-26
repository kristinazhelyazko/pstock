-- Добавление номера заказа и индекса
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS number BIGINT;

-- Проставляем номер для уже существующих заказов, если он не задан
UPDATE orders
SET number = id
WHERE number IS NULL;

-- Индекс по номеру заказа для ускорения выборок по нему
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(number);

