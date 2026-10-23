PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT NOT NULL CHECK (json_valid(value)),
  revision INTEGER NOT NULL DEFAULT 1,
  mutation_id TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO settings (id, value) VALUES (1, '{"productPriceCents":3000,"stockOnHand":null,"maxQuantity":10,"shippingCents":2000,"shippingConfirmed":true,"bank":{"accountName":"","bsb":"","accountNumber":""},"ownerEmail":"","supportEmail":""}');

CREATE TABLE IF NOT EXISTS inventory (
  mode TEXT PRIMARY KEY CHECK (mode IN ('preview', 'live')),
  stock_on_hand INTEGER NOT NULL CHECK (stock_on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= stock_on_hand)
);
INSERT OR IGNORE INTO inventory (mode, stock_on_hand) VALUES ('preview', 10), ('live', 0);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('awaiting_payment','paid','shipped','cancelled')),
  mode TEXT NOT NULL CHECK (mode IN ('preview','live')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  idempotency_hash TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  tracking_number TEXT NOT NULL DEFAULT '',
  mutation_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status ON orders (status, created_at DESC);

-- Retain no customer data, only the retry guard for a deleted test checkout.
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

CREATE TRIGGER IF NOT EXISTS orders_require_stock BEFORE INSERT ON orders BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM inventory WHERE mode = NEW.mode AND stock_on_hand - reserved >= NEW.quantity
  ) THEN RAISE(ABORT, 'insufficient_stock') END;
END;
CREATE TRIGGER IF NOT EXISTS orders_reserve_stock AFTER INSERT ON orders BEGIN
  UPDATE inventory SET reserved = reserved + NEW.quantity WHERE mode = NEW.mode;
END;
CREATE TRIGGER IF NOT EXISTS orders_immutable_snapshot BEFORE UPDATE OF snapshot, mode, quantity, reference, idempotency_hash, request_hash, token_hash ON orders BEGIN
  SELECT RAISE(ABORT, 'immutable_order');
END;
CREATE TRIGGER IF NOT EXISTS orders_status_flow BEFORE UPDATE OF status ON orders
WHEN OLD.status <> NEW.status BEGIN
  SELECT CASE WHEN NOT (
    (OLD.status = 'awaiting_payment' AND NEW.status IN ('paid','cancelled')) OR
    (OLD.status = 'paid' AND NEW.status = 'shipped')
  ) THEN RAISE(ABORT, 'invalid_status_transition') END;
END;
CREATE TRIGGER IF NOT EXISTS orders_release_stock AFTER UPDATE OF status ON orders
WHEN OLD.status <> NEW.status AND NEW.status IN ('cancelled','shipped') BEGIN
  UPDATE inventory SET
    reserved = reserved - NEW.quantity,
    stock_on_hand = stock_on_hand - CASE WHEN NEW.status = 'shipped' THEN NEW.quantity ELSE 0 END
  WHERE mode = NEW.mode;
  UPDATE settings SET revision = revision + 1 WHERE id = 1 AND NEW.mode = 'live' AND NEW.status = 'shipped';
END;

CREATE TABLE IF NOT EXISTS order_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS history_order ON order_history (order_id, created_at);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('awaiting_payment','paid','shipped','owner_order')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  status TEXT NOT NULL CHECK (status IN ('queued','sending','sent','delivered','bounced','complained','failed','needs_review','preview','cancelled')),
  created_at TEXT NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  first_attempt_at INTEGER,
  ambiguous_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  failure_code TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS outbox_due ON email_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS outbox_order ON email_outbox (order_id, created_at);

CREATE TABLE IF NOT EXISTS settings_history (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  changed_fields TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
