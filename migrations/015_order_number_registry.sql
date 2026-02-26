-- Реестр использованных номеров заказов для строгой уникальности
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'order_number_registry'
  ) THEN
    CREATE TABLE order_number_registry (
      number BIGINT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      source TEXT
    );
  ELSE
    IF EXISTS (
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_name = 'order_number_registry'
        AND column_name = 'number'
        AND data_type <> 'bigint'
    ) THEN
      ALTER TABLE order_number_registry
        ALTER COLUMN number TYPE BIGINT;
    END IF;
  END IF;
END
$$;

-- Заполняем реестр уже существующими номерами заказов
INSERT INTO order_number_registry (number, created_at, source)
SELECT DISTINCT number, NOW(), 'backfill'
FROM orders
WHERE number IS NOT NULL
ON CONFLICT (number) DO NOTHING;
