-- Стоимости позиций и доставки на уровне заказов
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_delivery_cost NUMERIC(12,2) NOT NULL DEFAULT 0;

