# Cloudflare design launch — 30 October 2026

This branch combines the approved storefront at GitHub commit 14cef932 with the existing commerce backend. Build with `npm run build:shop`; deploy the existing `los-ninos-shop` Worker with `wrangler deploy --keep-vars`. GitHub Pages remains a separate non-transactional preview.

Production packaging retains only the approved campaign opening, existing compressed hat rotation, photographs and commerce screens. Root noindex, preview labels and diagnostic script are removed. Optional opening experiments and oversized unused films are excluded. Checkout/order return links restore the shop view.

The Worker bundle was byte-for-byte identical to the live deployment before launch. Existing live variables and D1 binding matched; secrets are retained remotely. No database migration or production order was performed.

Validation: 122 commerce tests passed against actual zoom storefront sources. Local desktop Chromium completed three hats at A$110 including A$20 shipping; iPhone WebKit completed four hats at A$145 including A$25 shipping. Both orders appeared in local admin, with zero page errors, HTTP failures or external requests. These are local preview tests and do not prove fresh production email delivery or owner inbox receipt.

Previous live version for rollback: `b19fdd45-2368-4e45-8294-7c63571744b6`. Local deployment metadata is in ignored `.local/`; never commit credentials or customer data.

Deployed successfully on 30 October 2026: Worker version `15fdc777-f254-4a4a-9472-c1227dce97f6`. Live storefront and commerce scripts matched the build; catalog is live and accepting orders. Browser Add to bag opened `/checkout?quantity=1` with the correct A$30 product. `/admin` and `/admin.html` redirect to owner login; unsigned admin API requests are rejected. No live order or owner-login email was submitted.
