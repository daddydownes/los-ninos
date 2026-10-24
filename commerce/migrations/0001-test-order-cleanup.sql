-- Back up the database before applying this migration to an existing shop.
-- This hash-only tombstone prevents a late checkout retry from recreating a
-- deleted test order. It does not change or delete existing orders.
CREATE TABLE IF NOT EXISTS deleted_test_orders (
  idempotency_hash TEXT PRIMARY KEY,
  deleted_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS orders_reject_deleted_test BEFORE INSERT ON orders
WHEN NEW.mode='preview' AND EXISTS (
  SELECT 1 FROM deleted_test_orders WHERE idempotency_hash=NEW.idempotency_hash
) BEGIN
  SELECT RAISE(ABORT, 'test_order_deleted');
END;
