# Los Niños: approved film design to production

Prepared 25 October 2026. Scope: integrate the approved combined concept into the existing Cloudflare shop. This is a launch plan, not a claim that integration or launch testing has already passed.

Reviewed 25 October 2026 against the maintained bag, checkout and intro code. The review tightens navigation, ambiguous order responses, test isolation and release gates. Implementation has not begun under this plan.

Subsequent progress: a local working candidate is now built. See [film-demo.md](film-demo.md) for implemented scope, observed test results and remaining release checks; the original review above records the planning baseline.

## Approved experience

- Preserve the existing four-second stitched lettering opening and large, centred hat.
- After the stitch completes, pause briefly, then automatically reveal the full-screen muted film and move the same hat into the floating product card. No scrolling is required and the animation must never change the visitor's scroll position.
- Desktop: product card at the lower right. Phone: compact card at the bottom, respecting safe areas and the browser toolbar.
- Keep the background free of Watch film and Pause buttons. Respect reduced motion with a static image and immediately usable purchasing controls.
- Normal scrolling then reveals the photos. The card stays usable while browsing them.
- Select several hats in the card; edit the bag with +/− and Remove; show live item subtotals. Use the existing white rounded button style.
- Preserve the existing 360 product section, checkout, receipt and owner routes during integration. Do not add another animation or navigation layer to the opening.

## Exact interaction rules

| Visitor action or condition | Intended behaviour |
| --- | --- |
| Fresh visit or explicit refresh of the storefront | Replay the approved four-second stitching, followed by the approved automatic hat-to-card handover. No extra delay or new introductory step. Refresh retains the saved bag. |
| Tap, swipe or press a key during the normal intro | Do not skip the intro, accidentally add hats, or queue a click that fires when the card appears. Reduced motion, startup failure and leaving the page remain valid exits. |
| Return from checkout with Back, including a page reconstructed without bfcache | Restore the usable shop, bag quantity and appropriate previous position without replaying the opening. Do not reuse an old checkout URL quantity over a newer bag edit. |
| Open the bag | Open one drawer; pause the background film, make background controls inert and move focus inside. Closing restores focus and the previous scroll position. |
| Add a selected batch | Add once, reset the selection to one if room remains, then open the real bag. The next deliberate addition is a new action; an in-flight duplicate tap is ignored. |
| Stock is unavailable or catalogue loading fails | Preserve the bag. Show a short unavailable/retry state. Never label unavailable stock as a full bag, or use a guessed total to enable checkout. |
| Background video fails or autoplay is blocked | Keep the poster and working shop controls. Do not wait for the video before making the shop usable. |
| Browse photos or the existing 360 area | The floating card stays usable without covering necessary captions, controls or the final photo. Reserve space at the end of the page and account for phone safe areas. |

Use the current demo as the visual reference for timing and placement. Keep the existing 360 experience in its current content position until the integrated page can be reviewed; this release does not redesign its assets or invent an additional viewer. The white animated price must agree with the catalogue too; a decorative hard-coded $30 must not contradict the payable price.

## Evidence checked for this plan

The local demo and maintained storefront are different implementations:

| Area | Combined demo today | Maintained shop today | Integration requirement |
| --- | --- | --- | --- |
| Bag | Custom `combined-motion.js`, demo-only session key | `journey-bag.js`, existing production session key and modal/history handling | One production bag controller and one saved quantity |
| Prices and limit | Hard-coded 30 dollars and 5 hats | `/api/catalog` supplies price, stock and maximum | The new card and bag use the same catalogue |
| Add action | Select a quantity and add several | Existing click handler adds exactly one | Extend the real add action to accept the selected quantity |
| Checkout | No checkout action; sample bag only | Real checkout link, loading/retry/stock handling | Add a real Checkout action to the approved bag layout |
| Navigation | Basic native dialog | Focus restoration, scroll lock, browser Back/Forward and bfcache handling | Preserve and adapt the existing behaviour |
| Checkout quantity | Not connected | Checkout quantity is seeded from the URL; edits do not update the saved storefront bag | Synchronise quantity when edited and when returning |
| Successful order | Not connected | Pending request key is cleared, but the saved storefront bag is not cleared | Clear only the purchased bag after confirmed order creation |
| Packaging | Diagnostics directory, excluded from the production build | Build starts at `demo/directions/pages/index.html` | Move approved implementation into maintained source and register its assets |

Read-only live catalogue check in the browser returned HTTP content successfully: live mode, accepting orders, revision 7, OG Snapback at 3000 cents, maximum 5, available stock 100 at that moment. Shipping is 2000 cents for quantities 1–3 and 2500 cents from quantity 4. Availability can change. A direct Python request was denied with HTTP 403; that request does not prove the storefront is down. Browser access succeeded. Check real browser access during the release, without weakening security settings to make a script pass.

`docs/deployment-status.md` still describes a ten-hat maximum. Some static-preview tests deliberately use a ten-hat fixture. Neither should be treated as the live limit. Production checks must read the catalogue, and the documentation needs updating.

Additional review finding: checkout reuses its request key for the same payload, but changing order details generates another key. After a connection failure with an unknown server outcome, simply letting the customer edit and resubmit could create another order. Reproduce this case in isolation, then give an unresolved submission an explicit recovery path before permitting another order.

No live orders, emails, stock changes or deployments were made while preparing this plan.

## Implementation sequence and completion checks

### 1. Establish a recoverable baseline

- Record the current Git revision, Cloudflare Worker version, asset build, public catalogue revision and existing route behaviour.
- Keep the approved local demo available as a visual reference.
- Run the existing commerce and relevant browser regressions before edits. Record failures separately from new regressions; old test counts are not evidence for this release.
- Prepare a candidate build with a separate local/preview database. No test orders against live inventory. Use a staging Worker/database for hosted rehearsals if needed; do not switch the live shop into test mode.

**Done when:** the present production version is identifiable and recoverable, baseline results are recorded, and the candidate uses an isolated test database.

### 2. Integrate the visual design without duplicating commerce

- Port the accepted hero/film/card/photos layout into the maintained storefront source. Reuse the actual intro, hat assets and relevant 360 code.
- Extract the combined demo's animation and layout, but discard its demo bag handlers, hard-coded commerce values and separate storage key.
- Retain one initialization path. Remove conflicting old hero motion, duplicate add handlers and duplicate modals.
- Use the new card's measured hat target for the automatic handover. A fresh opening starts at the top; the handover itself never scrolls the page. Restore checkout-return journeys separately. After the opening the first normal scroll reaches the photos.
- Preserve the existing slow-load and reduced-motion fallback. A failed image, failed video, hidden tab, screen rotation or interrupted script must not leave the page locked or the bag unusable.
- Explicitly test the existing ten-second startup fallback, including a failed animation asset. Verify normal motion cannot be skipped by tapping, while the fallback releases scroll/focus locks. Check reduced motion both on arrival and when enabled during the intro.
- Add only the muted background clip and poster needed by this design to the production asset list. Exclude the full-length film player, comparison pages and diagnostic files.
- Keep the product, photography, 360 and checkout reachable after fallback or browser Back, without re-locking an existing checkout journey.

**Done when:** the commerce-enabled build looks like the approved demo on desktop and phone, the automatic animation lands correctly, and only one real bag exists.

### 3. Connect quantities, prices, availability and bag behaviour

- Extend the established bag controller with operations for adding a selected quantity, setting quantity and removing the item. The floating card, header badge and drawer subscribe to that same state.
- Preserve the existing production bag key so returning customers retain their bag. Never import the separate demo bag into a real order.
- Keep owner test-checkout state separate from the customer bag. Changing or completing a dashboard test order must not overwrite or clear a real bag in that tab.
- Fetch the catalogue through the established loading/timeout/retry path. Derive all displayed item prices and totals from its integer-cent price. Do not show a checkout-ready state with unverified price or availability.
- Calculate the permitted addition from the catalogue maximum, available stock and quantity already in the bag. The server remains the final authority because stock can change between visits and submission.
- Distinguish empty, ready, limit reached, stock reduced, sold out, loading and retry states. Disallow increasing an invalid saved bag; let the visitor reduce/remove items and review any adjustment. Never silently reduce an order at the final submit step.
- Keep selected-to-add quantity separate from quantity already in the bag, with clear button copy such as `Add 3 hats · $90`. Clamp an unsubmitted selection to the remaining allowance; never silently charge for a changed order quantity.
- At the allowed bag quantity, show View bag. Keep the visible five-hat-limit notice out of the ordinary purchase flow, as requested. Provide actionable feedback if stock or configuration changes invalidate a saved bag.
- Prevent a rapid double tap from adding the same selected batch twice while the drawer is opening.
- Bag actions: +/−, Remove, Close, Keep exploring and a clear primary Checkout button. An empty bag shows a return-to-product action and no checkout action.
- Preserve subtotal-only pricing in the bag. Show shipping after delivery details and before final order submission.
- Preserve focus trapping/restoration, keyboard operation, safe scroll locking, background-video pausing while the bag is open, and browser Back closing the bag before leaving the shop.
- If session storage is unavailable, keep the current visit usable. Session persistence is per tab; do not imply cross-device or permanent saved carts.

**Done when:** card, bag badge, drawer and checkout agree for every supported quantity; stock/loading/error states have a usable path forward; every visible control works.

### 4. Finish the checkout handover and order lifecycle

- Continue to the existing same-origin checkout with the exact bag quantity. Revalidate the catalogue and availability there.
- Synchronise checkout quantity edits back to the saved bag. Returning with browser Back must show the edited quantity and current subtotal, without replaying the full opening or reopening a stale drawer unexpectedly.
- Define state precedence explicitly: the bag quantity seeds checkout once; later validated checkout edits update that bag. A stale URL or restored page must not overwrite a newer edit. Track the submitted bag revision so clearing a completed purchase cannot erase a subsequently changed bag, even if its quantity happens to be the same.
- Invalidate the reviewed total whenever quantity or delivery details change; require another review before placing the order.
- Keep the server's existing validation, stock reservation, catalogue revision checks and idempotent request handling. Client-side limits are not order validation.
- Clear the matching purchased bag after the API confirms the saved order and returns a usable private receipt reference. Do not wait for successful receipt-page rendering: if that page fails to load, the order still exists. Preserve access to that receipt and offer recovery without placing another order. Rejected submissions keep the bag; unknown outcomes keep the original request key until resolved.
- For an unknown submission outcome, keep the submitted details and key stable while recovering the original result. Do not silently generate another key after an address/quantity edit. Test refresh, navigation back, catalogue changes and recovery of the original receipt during this state. Preserve the existing private-token handling and avoid logging customer details or receipt tokens.
- Verify the receipt, owner order record and customer email show identical quantity, amount and payment reference. Preserve leading zeroes in references and bank-detail copy controls.
- Preserve manual bank transfer: an order begins awaiting payment. The owner checks the bank before marking it paid. This release introduces no card processor, money movement or automated bank reconciliation.
- Keep tracking out of the customer email as requested; the owner sends tracking separately by text. Review receipt/email wording together so they describe the same workflow.

Expected calculations, based on the checked catalogue:

| Hats | Item subtotal | Shipping after address review | Final total |
| ---: | ---: | ---: | ---: |
| 1 | A$30 | A$20 | A$50 |
| 2 | A$60 | A$20 | A$80 |
| 3 | A$90 | A$20 | A$110 |
| 4 | A$120 | A$25 | A$145 |
| 5 | A$150 | A$25 | A$175 |

**Done when:** one submitted order produces one reservation, one customer order and the correct queued messages, with consistent quantities and totals across all screens.

### 5. Verify failure paths and performance

| Check | Required result |
| --- | --- |
| Select 3, add; add another 2; edit to 4; remove | Badge, controls and subtotals agree at every step; full and empty states work |
| Rapid taps / double-click Checkout or Place order | No accidental extra batch, duplicate order, duplicate reservation or duplicate initial email |
| Quantity 0, negative, decimal, over-limit, malformed URL | Sensible client recovery; invalid orders rejected by server |
| Stock 0, stock below saved bag, two buyers competing for final stock | Clear unavailable state; no overselling |
| Catalogue timeout, failed response, Wi-Fi to mobile switch | Recoverable retry, retained bag and no permanently disabled checkout |
| Failure after order saved but before response arrives | Same request key recovers the same order; no second order |
| Unknown submission outcome followed by editing quantity/address | Recover the original outcome before allowing another order; no silent new request key |
| Receipt load fails after a confirmed order | Reopen the existing receipt; no duplicate order and no resurrected purchased bag |
| Change quantity after reviewing shipping | Shipping review resets and the correct tier is shown again |
| Refresh, Back/Forward, bfcache, app switching | Correct bag state, no stuck overlay, no duplicate intro, no old queued click firing |
| Rotation/resizing while hat moves | Hat reaches the card accurately; controls stay in view |
| Reduced motion, autoplay blocked, video unavailable | Static usable shop and working bag without a required video |
| Cold cache, throttled connection, storage blocked | Intro fallback works; navigation and purchasing remain usable |
| Phone keyboard, autofill, address validation | Fields and errors remain visible; no clipped primary action |
| Successful order then return to shop | Purchased bag cleared; no accidental repeat order |
| Dashboard test checkout in a tab with a customer bag | Test quantities, completion and cleanup never change the customer bag |
| Bad/expired private receipt link, unauthorised admin access | No customer data exposed; clear recovery/sign-in path |

Run the commerce suite, extend the existing bag/network/storefront tests and add focused browser coverage for the automatic handover, add-many, checkout synchronisation and successful-order clearing. Use a commerce-enabled built candidate; static fixtures alone cannot verify the deployed integration. Do not weaken existing tests just to make a changed layout pass.

Visually inspect 320/375/390px phones, landscape, tablet and desktop. Exercise WebKit/Safari and Chromium/Android profiles, then check a physical iPhone and Pixel on Wi-Fi and mobile data. Device emulation alone is not proof of physical-device performance.

Performance priorities:

- Load/decode the hero/embroidery before its animation. Do not let the film or the 360 sequence compete with the critical opening downloads.
- Fetch the catalogue early enough that the bag becomes useful immediately after the opening. Never fabricate a ready state while the API is unavailable.
- Start the muted background clip when needed; show its poster if playback is blocked. Pause it offscreen, when the document is hidden and while the bag is open. Respect reduced motion.
- Avoid continuously running animation frames after the handover. Measure geometry on resize and use transforms/opacity for the moving hat.
- Check viewport changes when scroll locking ends, mobile browser toolbar changes, safe-area spacing and reduced-motion changes during the opening.
- Verify video content type, byte-range behaviour, caching, asset versioning, missing-file responses and security policy on the hosted candidate.
- Inspect frame drops and layout shifts with cold-cache and constrained-network runs. Record measurements; do not promise zero lag on every device.
- Compare the baseline and candidate on the same viewport/network settings. Record first usable purchase controls, intro completion/fallback, transferred media and layout shifts. A media-loading failure must never block ordering; a stock-check failure must explain the retry path. Repeated missed taps, visible handover jumps, clipped controls or a sustained animation stall require correction before release.

**Done when:** the new journeys and relevant regressions pass, screenshots are reviewed, and no unresolved purchase-blocking, incorrect-total, duplicated-order, inventory or access-control issue remains.

### 6. Hosted rehearsal, release and rollback

- Rehearse the whole journey using test-only orders and test inventory. Use the already approved Jacob inbox for customer and owner test-email copies; do not send rehearsal notifications to Joshua or real customers.
- Verify the actual receipt and existing four messages: customer bank instructions, owner new-order notification, payment confirmation after the owner's manual action, and dispatch confirmation after the owner's manual action. Also check retries/failure visibility and test cleanup. This is a regression check, not a new email workflow. Confirm each order reference and total; never make a bank transfer for the rehearsal.
- Delete only the disposable test orders through the supported cleanup path and verify test inventory is restored. Do not delete real customer orders or reset their reference counter.
- Joshua's first owner sign-in/inbox confirmation was deferred previously. Keep it listed as unverified until he checks it; don't claim the handover is complete from configuration alone.
- Update stale launch/owner documentation, including the current catalogue limit and any changes to bag behaviour.
- Deploy the tested production build to the existing Worker and domain with the existing D1 database. Preserve owner authentication, secrets, live order history, inventory and reference numbering. No DNS migration is needed for this layout release.
- Immediately verify root and www, HTTPS, catalogue, assets, checkout handover, receipt access controls and admin sign-in. Check the affected iPhone/Pixel journeys on real networks. Don't create a real order merely to smoke-test the storefront.
- Keep the previous Worker/assets version ready. Roll back if the new UI blocks ordering, loses quantities, exposes data, breaks totals or fails on the target phones. A frontend rollback must not roll back legitimate orders created since deployment.

**Release gate:** the integrated candidate is visibly reviewable, commerce regressions and realistic failure cases pass, hosted test emails are checked, the target physical iPhone/Pixel journeys are checked, and the exact rollback version is recorded. A missing device check means the candidate is awaiting that check, not fully launch-tested. Joshua's deferred first login is a separate owner-handover item: do not silently mark it complete or claim the business handover is finished.

Keep a short evidence record for each stage: build/revision, scenario, expected outcome, observed result, screenshot or test output, and any unresolved issue. Finish and verify the real bag before adding further visual polish. Do not expand this release into new payment methods, dashboard settings, stock policies or unrelated email changes.

## Files likely to change during implementation

- `demo/directions/pages/index.html`, `journey.css`, `journey.js`, `journey-intro.js`: maintained layout, automatic transition and lifecycle integration.
- `demo/directions/pages/journey-bag.js`, `journey-bag.css`: one real bag controller, add-many and approved drawer appearance.
- `commerce/public/checkout.js` and potentially a small shared bag-state module: quantity synchronisation and clearing after successful order creation.
- `assets/` and `scripts/build-site.py`: selected background clip/poster and precise production packaging.
- `tests/storefront.spec.js`, `tests/bag-network.spec.js`, checkout browser coverage and relevant commerce tests: changed journeys and failure cases.
- `docs/deployment-status.md` and owner documentation: current verified release and remaining handover checks.

Avoid copying `diagnostics/video-layouts/combined.html` wholesale into production. It is the approved visual reference, not the production commerce implementation.
