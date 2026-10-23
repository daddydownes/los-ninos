# Bank-transfer checkout setup

This guide configures the implemented checkout under the shop owner's accounts.
Production hosting, a domain, live sending credentials, final commercial details,
and real inbox tests are not supplied by the repository. Keep launch disabled
until those steps are complete.

## Components and defaults

| Component | Responsibility |
| --- | --- |
| `commerce/worker.mjs` | Validates checkout, calculates totals from stored settings, reserves stock, saves orders, and handles owner actions. |
| Cloudflare D1 (`DB`) | Stores settings, separate preview/live inventory, orders, history, and a durable email outbox. |
| Static assets (`ASSETS`) | Serves the built storefront, checkout, and owner interface from the same origin. |
| Cloudflare Access | Requires an approved owner's email-code login; the Worker also validates the signed Access token and owner allowlist. |
| Resend | Sends customer and owner emails and supplies delivery status. |
| Five-minute Worker cron | Retries queued emails and checks accepted-email delivery state. |

The store defaults to `STORE_MODE=preview`. Hosted preview refuses orders unless
`HOSTED_TEST_CHECKOUT=true` and a private `ORDER_TOKEN_SECRET` of at least 32
characters is configured. That explicit test mode allows HTTPS checkout without
customer login, uses separate preview inventory and sends no email or real bank
details. It never grants owner access. Local loopback preview also accepts test
orders without login.
An authenticated owner can separately enable the purchase rehearsal described
below to send clearly marked test emails to one approved inbox.
The hat price defaults to A$30 with A$20 Australian shipping for one to three hats
(`productPriceCents=3000`, `shippingCents=2000`). The four-or-more tier is A$25
(`shippingTierFromQuantity=4`, `shippingTierCents=2500`). Three hats total A$110;
four total A$145. Shipping is charged once per order.
Stock is initially unset, bank/email fields are blank, and the maximum order
quantity is ten. The requested shipping charge is not a verified carrier quote;
check packed postage before live launch.
Existing databases retain their current settings; update those through the
protected dashboard before launch.

The code can remain on GitHub. The existing Pages workflow builds the ordinary
demonstration site; it does not enable the commerce entry point. Use Cloudflare
for the live shop: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
do not permit using Pages to run an ecommerce business. No existing deployment
workflow is disabled by these instructions; once a live domain is ready, decide
whether to retain the separate demonstration or retire its Pages publishing.

## Local preview and tests

Use Python 3.11+ and Node.js 22.13+. The local D1 adapter uses `node:sqlite`;
Node may print an experimental-feature warning.

```sh
npm run preview:shop
```

Open `http://127.0.0.1:8766/` and `http://127.0.0.1:8766/admin.html`. The preview
binds to loopback, hardcodes preview mode, and uses `.local/orders.sqlite`. Use
fictional names, addresses, and emails. It does not send email, call the email
provider, request payment, or exercise production owner authentication. Stop it
with Ctrl-C. Local orders persist between restarts; `.local/` is ignored by Git.
To start over, stop the server and move that local database aside. Never use a
live database export as preview seed data.

```sh
npm run test:commerce
```

These are the commerce checks, not a claim that they have passed on your machine.
The existing browser suite remains available separately:

```sh
npm ci
npx playwright install webkit chromium
npm test
```

Use `npm run build:shop` for the Worker build. Plain `npm run build` keeps the
demonstration entry point. A build output is not a deployment or a live-email test.

## Owner accounts, domain, and email

The owner should own the registrar, Cloudflare account, Resend account, and GitHub
repository, including billing and recovery. Record who maintains the system and
where recovery information is kept privately. Decide any license for the project
code explicitly; do not add an assumed open-source license. Preserve third-party
font notices and verify asset rights independently.

Choose the shop domain and confirm its renewal. Resend needs a domain the owner
controls: add the required DNS records, complete verification, and choose a
sender on that verified domain. The `resend.dev` test sender is not suitable for
live customers. A sending service does not create a customer-support inbox;
ensure the configured reply address receives mail.

References: [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction),
[Resend pricing and quotas](https://resend.com/pricing),
[Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
Review current daily and monthly email limits before launch; customer and owner
messages, payment confirmations, dispatch messages, and resends all consume quota.

## Create the database and deploy a closed preview

Run commands from this repository, while signed in to the owner's Cloudflare
account. These commands create remote resources and publish the application;
they have not been run as part of merely writing this guide.

```sh
npx wrangler@4 login
npx wrangler@4 d1 create los-ninos-orders
```

Copy the returned database ID into `wrangler.jsonc`, replacing
`REPLACE_WITH_OWNER_DATABASE_ID`. Keep the binding named `DB`. Do not add a second
binding if Wrangler offers to update the file automatically.

For a **new, empty** database, apply the supplied schema and build:

```sh
npx wrangler@4 d1 execute los-ninos-orders --remote --file=commerce/schema.sql
npm run build:shop
npx wrangler@4 deploy
```

Keep `STORE_MODE=preview`, `LOCAL_PREVIEW=false`, and `LAUNCH_CONFIRMED=false`
during setup. An unset `LAUNCH_CONFIRMED` also keeps launch blocked. The schema is
an initial bootstrap, not an automatic upgrade system: future changes to an
existing database need a reviewed migration and a backup.

Set `HOSTED_TEST_CHECKOUT=false` to close test submissions too. The current
deployment explicitly enables hosted test checkout at the owner's request;
keep the visible test-order notices and use fictional details. A test order
reserves only preview inventory, leaving the 100-hat live inventory unchanged.

Keep `assets.run_worker_first` set to **true**. Owner authentication must run
before static files are served. Do not publish `_site` as a standalone live shop
or give a second host unprotected access to admin/API routes.

Reference: [Cloudflare D1 setup](https://developers.cloudflare.com/d1/get-started/).

## Protect owner access

1. Add the final shop hostname to the Worker, then set up a Cloudflare Access
   self-hosted application for its owner paths. Include `/admin*` and
   `/api/admin*` under the **same application**, so they share an audience value.
   This must cover `/admin`, `/admin.html`, nested owner routes, email previews,
   exports, and all owner API actions.
2. Enable **One-time PIN** as an identity provider. Use an Allow policy containing
   only the exact approved owner email addresses. Do not use an Everyone,
   entire-email-domain, Bypass, or public-service-token policy for the owner UI.
3. Copy the application's audience (AUD) into `ACCESS_AUD`. Set
   `ACCESS_TEAM_DOMAIN` to the full `https://your-team.cloudflareaccess.com`
   origin, and set `OWNER_EMAILS` to the same approved emails, comma-separated.
4. Test in a private browser: an unsigned visitor must not see owner records;
   an unapproved email must be denied; the approved owner must be able to log in
   and use both the dashboard and its API.
5. Disable unused alternate public hostnames such as a `workers.dev` address, or
   verify that the same Worker authentication remains effective through them.

The Worker verifies the Access token's signature, issuer, audience, timing, and
email. The Access policy and `OWNER_EMAILS` are both required. No login bypass is
allowed on hosted preview: `LOCAL_PREVIEW` stays the string `false` there.

References: [Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/),
[one-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

## Runtime configuration and secrets

Configure the Worker variables in Cloudflare for the selected deployment. The
checked-in `wrangler.jsonc` contains safe preview defaults. A later CLI deployment
can replace dashboard variable values with those defaults: after each deploy,
review the variables and explicitly restore the intended state before reopening
orders. Never assume a dashboard-only setting survives deployment.

| Name | Required value |
| --- | --- |
| `DB` | D1 binding to the intended owner's database. |
| `ASSETS` | Built `_site` binding; keep Worker-first routing enabled. |
| `STORE_MODE` | `preview` during setup; `live` only for the controlled live test or approved launch. |
| `HOSTED_TEST_CHECKOUT` | `true` to permit HTTPS test checkout in preview mode with a private order-token secret; `false` to close hosted preview submissions. Does not bypass owner login or live launch checks. |
| `TEST_EMAILS_ENABLED` | Explicit `true` permits owner-created email tests while the store remains in `preview`; default `false`. Public preview checkout still never sends mail. |
| `TEST_EMAIL_TO` | One approved test inbox, stored privately in the deployment. All email-test recipients and replies are restricted to this exact address. |
| `LOCAL_PREVIEW` | `false` for every hosted environment. |
| `PUBLIC_STORE_URL` | Final HTTPS origin, with no path, credentials, query, or fragment. |
| `ACCESS_TEAM_DOMAIN` | Full HTTPS Cloudflare Access team origin. |
| `ACCESS_AUD` | Audience for the single protected owner application. |
| `OWNER_EMAILS` | Comma-separated exact owner-login email allowlist. |
| `EMAIL_FROM` | Sender address on the verified domain, optionally `Los Niños <sender@your-domain>`. |
| `LAUNCH_CONFIRMED` | `true` only after the relevant launch checks and owner confirmation. |
| `RESEND_API_KEY` | Secret for sending and retrieving email delivery status. |
| `ORDER_TOKEN_SECRET` | Secret containing at least 32 strong random characters; use a password generator. |

Store the two secrets through Cloudflare's secret interface or interactive
commands, never by putting their values in shell commands, source, HTML, a public
Page, or a commit:

```sh
npx wrangler@4 secret put RESEND_API_KEY
npx wrangler@4 secret put ORDER_TOKEN_SECRET
```

Keep the order-token secret stable and backed up privately. Replacing it can stop
an existing checkout retry from recovering its original order link. Ensure the
Resend key supports retrieving email status as well as sending; a sending-only
key cannot support all delivery checks. Restrict account access and scope the key
as tightly as those operations permit.

Use **Store settings** in the protected dashboard to enter the final price, stock,
shipping, bank details, owner notification inbox, and customer reply inbox. Do not
put real bank details or customer data in repository fixtures. The current
`maxQuantity=10` allows multiple hats, with a higher shipping fee starting at four.
Verify packed postage for the maximum allowed parcel before live launch. The
configured quantity tiers do not measure parcel weight or call Australia Post's
API. Existing orders retain their original shipping snapshot.

## Hosted checks and launch

### Owner-only purchase rehearsal

After Access and the verified email sender are configured, keep `STORE_MODE=preview`
and set `TEST_EMAILS_ENABLED=true` with the authorized `TEST_EMAIL_TO` inbox.
Open **Test purchase** from the owner dashboard. The ordinary checkout form is
used, but both its bootstrap and submission require owner authentication. Its
email address is fixed to the approved inbox. The order stays in preview
inventory and shows a test label; no bank transfer or real shipment is required.

This path sends payment-instruction and owner-notification test emails only to
the approved inbox. Simulating payment and dispatch in the dashboard exercises
the other messages. Recipients and Reply-To are checked again when sending;
public preview submissions cannot enable email delivery. Provider acceptance is
not proof of inbox delivery—confirm receipt with the authorized tester.

Use **Delete test order** after testing to remove its order details and queued
mail and restore test stock. Sent emails cannot be withdrawn from inboxes. Live
orders cannot be deleted this way. A non-reversible hash of the retry key remains
so a delayed checkout retry cannot recreate a deleted test. Before upgrading an
existing database, take a private backup and apply
`commerce/migrations/0001-test-order-cleanup.sql` before deploying this code.

Set `TEST_EMAILS_ENABLED=false` when the rehearsal is finished. Enabling live
ordering remains a separate launch step.

### Live launch verification

Local preview does not validate production email or Access. Use a separate
staging Worker/database and owner-only hostname for hosted checks, with the same
configuration model. To exercise real sends, obtain the owner's authorization
for the recipients and test details before setting that isolated deployment to
`live` and `LAUNCH_CONFIRMED=true`. Do not enable public customer orders just to
test email. Keep local preview email-free.

Before opening the production shop, record the results of these checks:

- Owner login, unapproved-email denial, and denied direct access to owner/API
  routes, including alternate URLs.
- Verified price, single-hat packed postage, physical stock, bank details,
  receiving/support inboxes, and owner account recovery.
- A checkout that saves once when submitted or retried, validates quantity and
  address, uses stored prices, and shows the correct total and reference.
- A limited-stock test using a separate test database, plus cancellation releasing
  unpaid reservations and shipping reducing stock only once.
- Actual payment-instruction, owner, payment-confirmation, and tracking emails.
  Inspect Gmail, Apple Mail, and Outlook on the intended devices, including
  narrow screens, bank details, totals, replies, and tracking links. HTML previews
  and provider acceptance are insufficient evidence of inbox delivery/rendering.
- Payment is marked paid only after the receiving-bank match; shipped is marked
  only after dispatch. The customer promise is 1–3 business days after payment
  confirmation.
- Email failure/retry and `needs_review` behavior, the five-minute cron, and the
  owner's ability to find orders even if an email is missing.
- A private backup and successful restore rehearsal into a separate database.

Then configure the production domain and database, review all values, and enable
`STORE_MODE=live` and `LAUNCH_CONFIRMED=true` for the approved launch.
`LOCAL_PREVIEW` remains `false`. Confirm the public catalog reports accepting
orders and make one final owner-authorized smoke test. Hosted preview never
accepts real orders; its optional test checkout only creates preview orders.

To close ordering without deleting records, return `STORE_MODE` to `preview`,
`HOSTED_TEST_CHECKOUT` to `false`, and `LAUNCH_CONFIRMED` to `false`. Coordinate fulfilment of existing orders: preview
mode also stops outbound-email processing. Do not clear orders, change live stock
to a false count, or remove customer history to pause the shop.

## Email operations

New orders and their email-outbox records are saved together. Sending is attempted
after a live order/action and retried by the five-minute cron. Temporary provider
failures use delayed retries; permanent failures remain visible for review. An
uncertain send older than 23 hours becomes `needs_review` so automatic retries
do not pass the provider's deduplication window and risk duplicate messages.

`sent` means the provider accepted the message. Later status checks may establish
`delivered`, `bounced`, or `complained`; acceptance is not proof of inbox placement.
Review the queue and provider records for failures. A manual resend creates a
new message and can duplicate a message whose earlier delivery was uncertain.
The order stays saved independently of delivery success. There are no automatic
customer reminders, unpaid-order expiries, refunds, or failure-alert emails.

Keep the configured `*/5 * * * *` schedule enabled. Monitor service quotas and
retention using owner accounts; do not log customer bodies, bank details, access
tokens, or provider responses to public build logs.

## Backups and recovery

The dashboard CSV is for fulfilment, not full restoration. Use D1 exports for a
database backup. Save output outside the public repository in an owner-controlled
private location; it contains customer addresses and payment instructions.

Example, replacing the path with the owner's private backup destination:

```sh
npx wrangler@4 d1 export los-ninos-orders --remote --output='/private/owner-chosen-backup/los-ninos-orders.sql'
```

Choose a schedule and retention policy with the owner, and take a backup before
schema or data changes. Rehearse restoration into a **new, isolated** D1 database,
not over production:

```sh
npx wrangler@4 d1 create los-ninos-restore-check
npx wrangler@4 d1 execute los-ninos-restore-check --remote --file='/private/owner-chosen-backup/los-ninos-orders.sql'
```

Keep that restored database disconnected from live email sending so restored
outbox rows cannot resend old messages. Check settings, order counts, stock
reservations, and representative order history before accepting the recovery
procedure. Database exports do not back up Worker secrets, Access policies, DNS,
or account-recovery methods; document those separately in private owner storage.

Reference: [D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
