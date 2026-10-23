# Deployment status

Updated 24 October 2026 (Australia/Sydney).

The checkout branch is deployed to the `los-ninos-shop` Cloudflare Worker with
the `los-ninos-orders` D1 database. The database was created empty in Oceania and
initialized with `commerce/schema.sql`. The existing local test database was not
copied to Cloudflare. No customer data or bank details are committed to Git.

## Addresses and routing

- Hosted test site: https://los-ninos-shop.los-ninos.workers.dev/
- Intended shop: https://losninos.com.au/
- The Worker handles all paths on `losninos.com.au` and `www.losninos.com.au`.
- GoDaddy has accepted `dalary.ns.cloudflare.com` and
  `fred.ns.cloudflare.com` as the domain's nameservers. Cloudflare reports the
  zone active and its universal certificate active. Public DNS at 1.1.1.1 resolves
  the new Cloudflare addresses; some local resolvers still cache the old parking
  addresses. HTTPS at the new address passes certificate validation and returns
  HTTP 200. Always Use HTTPS is enabled.
- Cloudflare imported the previous public DNS records. Worker routes serve the
  shop before the origin; the imported website A/CNAME records stay proxied.
- The registrar remains GoDaddy. The domain uses Cloudflare's Free zone plan.

## Confirmed checks

- The Worker and all 84 storefront assets deployed successfully.
- The test site's home page, checkout page and hat image return HTTP 200.
- The deployed catalog reports A$50, free Australian shipping, preview mode and
  enabled test checkout. Stock was set to 100 in both preview and live inventory
  at the owner's request; test reservations only affect preview inventory.
- The intro completes, Add to bag updates the count, and the bag drawer opens.
- Unsigned requests for `/admin.html` and `/api/admin/orders` return HTTP 403.
- A complete hosted browser journey succeeded: bag to checkout, fictional
  customer/address entry, submission, confirmation and status refresh. One
  preview order is saved, its two email rows remain `preview`, and live inventory
  remains 100 with no live reservations. The sample preview reserves one test hat.
- All 32 commerce and email-rendering tests passed locally. A Worker dry run
  also completed. These do not establish live email delivery.

## Remaining checkout setup

The site is publicly browseable and allows test checkout without a login.
`STORE_MODE=preview`, `HOSTED_TEST_CHECKOUT=true`, `LOCAL_PREVIEW=false`, and the
live launch flag remains unset. A private order-token secret is configured.
Test confirmation pages clearly request no payment; preview mail never sends.
Hosted preview intentionally does not use the local owner-login bypass.

Finish these before accepting orders or running an authorized live email test:

1. Confirm the owner login/test email and support reply inbox. Stock is currently
   100 and can be changed later.
2. Configure Cloudflare Access for the owner pages and APIs and test sign-in.
3. Verify the sending domain with Resend and store its API key as a secret.
4. Store the confirmed bank settings privately; the order-token secret is set.
5. Test a controlled hosted order, inbox delivery, owner actions and stock.
6. Review the production values before enabling ordering.

The five-minute email processing schedule is deployed but preview mode does not
send emails. No live order or customer email has been sent during deployment.
The Resend API key and bank details are absent from the deployed preview.

Deployment configuration is in `wrangler.jsonc`. Use the bundled or installed
Wrangler CLI with the authorized account. It stores its OAuth credentials in an
encrypted file backed by Windows Credential Manager, outside this repository.
Never copy those credentials into source, build output or deployment notes.
