# Deployment status

Updated 25 October 2026 (Australia/Sydney).

The live shop runs on the `los-ninos-shop` Cloudflare Worker with the private
`los-ninos-orders` D1 database. Bank details, customer records, approved personal
inboxes and runtime secrets are kept out of Git.

## Live configuration

- Shop: https://losninos.com.au/ and https://www.losninos.com.au/.
- Owner dashboard: https://losninos.com.au/admin.
- Temporary host: https://los-ninos-shop.los-ninos.workers.dev/.
- `STORE_MODE=live`, `LAUNCH_CONFIRMED=true`, `LOCAL_PREVIEW=false`.
- Public test ordering and test email sending are disabled.
- Owner access uses an allowlisted email address and a six-digit email code.
  Cloudflare Access / Zero Trust is not used by this deployment.
- The brand inbox is configured for owner notifications and customer replies.
  Dashboard access is configured separately; changing the notification email
  does not grant login access.
- The sender is `Los Niños <orders@losninos.com.au>`, using the configured Resend
  secret. Open and click tracking were disabled during sender setup.

The catalogue and D1 settings were checked on 25 October. Hats are A$30 each,
with Australian shipping of A$20 for one to three hats or A$25 for four or more.
The maximum is ten hats per order. Three hats total A$110; four total A$145.
Shipping and the full total appear after entering delivery details and before
final submission. These are owner-set charges, not live Australia Post quotes;
packed carrier postage has not been validated.

At that check, live inventory was 100 with no reservations, and the hosted
database had no orders or queued emails. Inventory will change as customers order.

## Payment and email flow

1. A saved order reserves stock and queues the customer's bank instructions and
   a separate owner notification. The receipt page also shows the bank details,
   exact total and unique payment reference.
2. The owner checks the actual bank account and confirms that payment arrived.
   Only then does the dashboard mark the order paid and queue its payment email.
3. After handing over the parcel, the owner marks it shipped. This queues the
   dispatch email. Tracking is sent separately by the owner by text; it is not
   included in the email and the site does not automatically send SMS.

The confirmed bank details are stored privately. Each order preserves its own
price, shipping and bank snapshot so later settings changes do not rewrite
instructions already given to a customer. The app does not move money or
automatically reconcile bank transfers.

Email sends are queued and retried by a five-minute schedule. The dashboard
distinguishes provider acceptance from delivery and flags failures, bounces,
complaints or uncertain sends. The owner must check the dashboard; there is no
separate guaranteed alert for every email failure.

## Owner handover and testing

The owner dashboard now uses a light, minimal layout. Confirming payment or
dispatch is the primary action. Email details and history expand when needed;
email problems expand automatically. On a phone, an order has a **Back to orders**
control. Test and export actions sit under **Tools**.

The brand owner has not yet checked receipt of his sign-in code and completed
his first sign-in. The user explicitly deferred this check. His inbox delivery
and first login must not be described as verified.

Previously, the approved test recipient received all four test email types and
confirmed receipt, and that recipient's hosted email-code login was verified.
No new message or live customer order was created during the 25 October review.
Today's email checks rendered the real templates locally with the stored bank
configuration and a fictional customer; they did not establish fresh provider
delivery or appearance in every email client.

Test orders use separate inventory and can be deleted through the dashboard.
Live customer orders cannot be deleted with that control. Deletion restores
test stock and removes that test's stored history and outbox, but cannot retract
emails already delivered. Active sends block cleanup.

## Verification on 25 October

- 79 commerce tests passed, covering authentication, checkout, shipping tiers,
  bank snapshots, idempotency, stock, cleanup and email retries. Provider calls
  are mocked in automated tests.
- 45 targeted browser checks passed across desktop Chromium, Android Chromium
  and iPhone WebKit profiles, covering the dashboard, payment guard, email
  attention state, test cleanup, shipping review and retry handling.
- Sixteen locally rendered email cases checked the four message types at one,
  three, four and ten hats, including totals and payment-reference formatting.
- Dashboard and email layouts were reviewed at desktop and phone widths.
- Public root, www and checkout responded successfully; HTTP redirected to
  HTTPS. `/admin` redirected to owner sign-in, and an unsigned owner API request
  was rejected with HTTP 403.

Earlier DNS migration checks resolved the reported stale parking/TLS issue on
the affected Pixel. HTTP/3 was disabled after its QUIC error. Those historical
checks and today's successful requests do not guarantee every device or network.

The [owner guide](commerce-owner-guide.md) explains daily operation. The
[setup guide](commerce-setup.md) covers hosting and recovery. Account ownership,
recovery access, parcel costs and a backup routine remain handover responsibilities.
