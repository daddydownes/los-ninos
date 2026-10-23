# Deployment status

Updated 24 October 2026 (Australia/Sydney).

The shop runs on the `los-ninos-shop` Cloudflare Worker with the private
`los-ninos-orders` D1 database. No customer data, bank details, personal inboxes
or runtime secrets are committed to Git.

## Addresses and connection checks

- Shop: https://losninos.com.au/ (also https://www.losninos.com.au/).
- Temporary host: https://los-ninos-shop.los-ninos.workers.dev/.
- GoDaddy delegates DNS to `dalary.ns.cloudflare.com` and
  `fred.ns.cloudflare.com`. Both authoritative servers and all five parent
  nameservers agree. Cloudflare's certificate validates for the shop hostname.
- During migration, old GoDaddy parking addresses caused TLS failures on some
  networks. Cloudflare's public DNS cache was refreshed. The affected Pixel now
  opens the shop after restoring normal DNS; ordinary IPv4 requests on the
  previously failing development network also return HTTP 200 for root and www.
  These checks do not guarantee every resolver worldwide has refreshed.
- HTTP/3 remains disabled after the reported QUIC failure. HTTP/2, HTTPS
  enforcement and TLS 1.3 remain enabled.

## Purchase rehearsal

Public browsing and ordinary preview checkout are enabled. The configured price
is A$50 with free Australian shipping. Live inventory is 100; preview inventory
is separate. A previous preview order reserves one test hat.

The owner dashboard includes **Test purchase** and **Delete test order**.
The email rehearsal uses the actual checkout form, configured prices and payment
instructions, but remains a clearly labelled preview order with no payment due.
All four message types and Reply-To are restricted to one deployment-configured
test inbox. Public preview submissions cannot enable email sending.

Deleting a test order removes its order details and outbox and restores test
stock. Live orders cannot be deleted. A hash-only tombstone prevents delayed
checkout retries from recreating deleted tests. Active email sends block cleanup;
messages already delivered to an inbox cannot be withdrawn.

The existing D1 database was privately backed up before applying the additive
`commerce/migrations/0001-test-order-cleanup.sql` migration. Confirmed bank and
owner/contact settings are stored privately in D1, not the public build.

## What is not live yet

`STORE_MODE=preview`, `HOSTED_TEST_CHECKOUT=true`, `LOCAL_PREVIEW=false`,
`TEST_EMAILS_ENABLED=false`; the live launch flag remains unset.
The order-token secret is configured. Owner routes remain protected and reject
unsigned requests; no hosted login bypass has been added.

Account setup still requires:

1. Activate Cloudflare Zero Trust and configure the exact owner email allowlist
   for `/admin*` and `/api/admin*` under one Access application. The current free
   plan activation screen requests billing details and terms/usage authorization;
   this has not been accepted by the agent.
2. Sign in to Resend, verify the sending domain and configure the private API key
   and sender address.
3. Enable the explicit owner-only test-email switch and complete an authorized
   purchase/payment/dispatch rehearsal. Confirm actual inbox receipt, then delete
   the test order and turn test sending off.
4. Complete the live-launch checks before enabling real ordering.

No real email, payment or fulfilment has been performed in this setup step.

## Verification

- 61 commerce tests pass, covering checkout, owner authentication, idempotency,
  inventory, cleanup races, exact test recipients, send retries and queue
  isolation. Provider calls are mocked in automated tests.
- 20 targeted browser checks pass across desktop Chrome and a Pixel profile,
  using the installed Chromium 1234 binary. The local browser rehearsal also
  completed checkout, simulated payment and dispatch, then deleted only its
  disposable order and restored test availability from 8 back to 9.
- Prior broader regression checks passed across eight Safari/Chrome profiles.
  Real Cloudflare login and Resend inbox delivery remain outstanding checks.

Configuration and operator instructions are in `wrangler.jsonc`,
`docs/commerce-setup.md` and `docs/commerce-owner-guide.md`.
