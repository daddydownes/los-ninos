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
  `fred.ns.cloudflare.com` as the domain's nameservers. DNS propagation and
  Cloudflare activation must complete before the main address works everywhere.
- Cloudflare imported the previous public DNS records. Worker routes serve the
  shop before the origin; the imported website A/CNAME records stay proxied.
- The registrar remains GoDaddy. The domain uses Cloudflare's Free zone plan.

## Confirmed checks

- The Worker and all 84 storefront assets deployed successfully.
- The test site's home page, checkout page and hat image return HTTP 200.
- The deployed catalog reports A$50, free Australian shipping and preview mode.
- The intro completes, Add to bag updates the count, and the bag drawer opens.
- Unsigned requests for `/admin.html` and `/api/admin/orders` return HTTP 403.
- All 30 commerce and email-rendering tests passed locally. A Worker dry run
  also completed. These do not establish live email delivery.

## Remaining checkout setup

The site is publicly browseable; submitting orders is not enabled yet.
`STORE_MODE=preview`, `LOCAL_PREVIEW=false`, and the launch flag remains unset.
Hosted preview intentionally does not use the local owner-login bypass.

Finish these before accepting orders or running an authorized live email test:

1. Confirm the owner login/test email, support reply inbox and actual stock.
2. Configure Cloudflare Access for the owner pages and APIs and test sign-in.
3. Verify the sending domain with Resend and store its API key as a secret.
4. Store a strong order-token secret and the confirmed bank settings privately.
5. Test a controlled hosted order, inbox delivery, owner actions and stock.
6. Review the production values before enabling ordering.

The five-minute email processing schedule is deployed but preview mode does not
send emails. No live order or customer email has been sent during deployment.
The two intended secrets and bank details are absent from the deployed preview.

Deployment configuration is in `wrangler.jsonc`. Use the bundled or installed
Wrangler CLI with the authorized account. It stores its OAuth credentials in an
encrypted file backed by Windows Credential Manager, outside this repository.
Never copy those credentials into source, build output or deployment notes.
