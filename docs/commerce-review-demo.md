# Checkout and admin review demo

Created 30 October 2026 from production commit `2b81844`. No production deployment or production orders were changed.

Run `npm run preview:commerce-review`, then open http://127.0.0.1:8784/demo.html. The actual storefront, checkout, admin and Worker code are used with local SQLite. The review has a separate `.local/commerce-review-orders.sqlite` database and `.local/commerce-review-site` asset snapshot. Orders survive restarts; no live credentials are loaded and emails cannot send. The default local preview and production database are untouched.

The original demo fixtures were created as follows (their statuses may change during review):

- TEST-001: Demo New Order, awaiting payment, one hat, $50 total.
- TEST-002: Demo Ready To Pack, paid, two hats, $80 total.
- TEST-003: Demo Dispatched Order, shipped, four hats, $145 total.
- TEST-004: Demo Cancelled Order, cancelled and reserved stock released.

Use All orders in admin to see dispatched and cancelled examples. Open an order, expand Emails, then choose Preview customer email. The demo landing page links to customer bank instructions, owner notification and the combined payment/dispatch email. Historical fixtures may still contain earlier separate payment email records.

Validation: 124/124 commerce unit tests pass after combining the payment and dispatch email. The following browser checks were performed during initial demo creation: Browser checks used actual local endpoints, not mocked order responses: checkout submission and receipts; one-, two- and four-hat totals; idempotent duplicate submission; admin payment, dispatch and cancellation; stock reservation/release; four generated email templates; preview-only outbox states; Chromium desktop and WebKit iPhone checkout/admin layouts. Test-harness corrections were needed for navigation response capture, list/detail navigation and the required cancellation reason; no product defect was identified in those flows. Local evidence is in `.local/commerce-review-evidence`.

Limits: local preview bypasses owner sign-in and has no payment transfer or real email delivery. Automated tests simulate provider acceptance, delivery events and retries; they do not prove live credentials, sender configuration, inbox delivery or a real transfer. Live bank details are deliberately absent from preview orders. A real delivery test needs a separately configured hosted preview and an approved recipient, without switching the production store out of live mode.
