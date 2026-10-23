# Running the Los Niños shop

The shop takes orders for the navy snapback with Australian delivery and payment
by bank transfer. It emails your payment instructions after saving the order.
You check the receiving bank account yourself, then confirm payment and dispatch
through your private dashboard.

This handover does not mean the shop is live. The domain, sending email, owner
accounts, stock, and bank details still need to be connected.
The hat price is A$30 each, plus A$20 flat Australian shipping per order.
Three hats cost A$90 plus A$20 shipping: A$110 total.
The [setup guide](commerce-setup.md) covers those steps.

## Sign in

Once hosting is ready, open `/admin.html` on your shop's domain. Cloudflare Access
asks for your approved owner email address and sends a one-time sign-in code to
that inbox. Only the exact owner addresses configured for this shop can enter.
Changing the notification address in Store settings does not grant dashboard
access to another person.

Bookmark the dashboard on your own device. If access expires, reload the page
and sign in again. Keep your owner email account and its recovery methods secure.
The local preview intentionally has no sign-in and must stay on your computer.

## When an order comes in

1. Open **Orders**. Search by order number, customer name, or email, or choose a
   status filter. Select the order to see its items, total, contact details, and
   delivery address.
2. An **Awaiting payment** order is saved, and its hats are reserved. The customer
   is sent the account name, BSB, account number, exact total, and a unique `LN-…`
   reference. You receive a separate new-order notification.
3. Check the actual receiving bank account. Match the amount and reference with
   the order. A customer's screenshot or statement that they paid is not a bank
   confirmation. Resolve short payments or unclear references before proceeding.
4. Choose **Confirm payment**, confirm that the full payment has arrived, then
   **Mark paid & send confirmation**. The order becomes **Paid — ready to pack**
   and its payment-confirmation email is queued.
5. Pack and dispatch within **1–3 business days after payment is confirmed**.
   After handing the parcel over, choose **Mark as shipped**, enter its Australia
   Post tracking number, then **Mark shipped & email tracking**. The order becomes
   **Shipped** and a dispatch email is queued.

The first email confirms receipt of the order. The second confirms receipt of
money. Marking an order shipped is your record of dispatch; the shop does not
purchase postage or book a pickup.

Status changes move forward. The dashboard does not undo paid or shipped states,
edit an existing order's address, or issue refunds. For an incorrect address,
mistaken status, paid cancellation, or refund, contact the customer directly and
ask the shop maintainer to keep the stored record consistent with the resolution.
Do not create a second order merely to fix an existing one.

## Unpaid orders and stock

Unpaid orders do not expire automatically. There are no automatic payment
reminders or automatic cancellations. Review them regularly so reservations do
not tie up hats indefinitely.

To cancel an unpaid order, check the bank account first for a late transfer.
Choose **Cancel order**, add the reason, and confirm. This releases its reserved
hats for sale. It does not move money or send a cancellation email. Contact the
customer directly when needed; resolve any transfer received after cancellation
before promising delivery.

**Total stock on hand** is the physical count, including hats reserved for unpaid
and paid orders. New orders reserve stock; shipping removes those hats from the
physical count; unpaid cancellation releases the reservation. The dashboard will
not let you set stock lower than existing reservations. Do not subtract a shipped
hat a second time when editing stock.

## Store settings

| Setting | What to enter |
| --- | --- |
| Hat price (AUD) | A$30 per hat, as requested by the owner. |
| Total stock on hand | Your physical hat count, including existing reservations. |
| Maximum hats per order | Currently **10**. The same shipping charge applies to the whole order. |
| Flat shipping per order (AUD) | A$20 per order, regardless of hat quantity. |
| Postage confirmation | Tick only after checking the packed size, weight, and coverage of the chosen charge. |
| Bank details | The verified receiving account name, six-digit BSB, and account number. Check each digit before launch. |
| Owner notification email | The inbox that receives new-order notifications. |
| Customer reply email | A monitored inbox where customers can ask for help. |

The A$20 shipping charge is the customer's flat order charge, not a verified
carrier quote. Packed postage has not yet been tested; check the parcel size,
weight and coverage before live launch. This version does not offer international
shipping or calculate postcode-specific rates. Price and shipping are shown on
the product, in the bag and at checkout before address entry.

Save your changes. New orders use the new price, postage, and bank instructions;
existing orders keep the details they were placed with. If you change bank
accounts, resolve outstanding orders that still contain the old instructions.
Store settings alone do not switch on live ordering.

The domain and sender email are separate setup tasks. Confirm who owns the
domain, its renewal, the Cloudflare account, the Resend account, and the sender
address before launch. Live bank details are entered privately through the
protected owner dashboard.

## Check customer emails

Every order has an email-status list and **Preview customer email**. Previewing
opens the message without sending it. In local preview, every message is a
sample and no email network request is made.

| Status | Meaning and action |
| --- | --- |
| `queued` or `sending` | Waiting or in progress. The hosted shop retries temporary failures using its five-minute schedule. |
| `sent` | The email provider accepted it. This does not establish inbox delivery. |
| `delivered` | The provider reports delivery to the receiving mail system; it may still be filtered into spam. |
| `failed`, `bounced`, or `complained` | Check the address and the provider's record. Ask the maintainer to resolve the cause before another send. |
| `needs_review` | An attempted send remained uncertain for over 23 hours. Automatic retries stopped to avoid a duplicate. Check Resend before resending. |
| `preview` | A sample message; nothing was sent. |
| `cancelled` | An obsolete queued payment instruction was stopped after the order moved on. |

The order remains saved if email fails. Review the dashboard even when no owner
notification arrives; this version does not promise a separate email alert for
every delivery problem.

**Resend** creates another email for the order's current status. Use it after
checking the original delivery result or when the customer asks. A previous
message may already have arrived, so a manual resend can create a duplicate.
Avoid repeatedly pressing the button. For an order awaiting payment, its bank
instructions also appear on the customer's confirmation page.

## Clear test orders

When the email service and approved test inbox are configured, **Test purchase**
at the top of the dashboard opens the actual checkout in private test mode.
The dashboard shows which inbox receives the test messages. Both the customer
and owner notification go only to that inbox, and the messages are labelled as
tests. No payment or parcel is required. The test reserves preview stock, not
live stock. Public preview checkout remains email-free.

Open the saved email test order to simulate confirming payment and shipping.
Those actions send the corresponding messages to the same test inbox. Check the
actual inbox and its spam folder; a queued or accepted message is not proof that
it arrived.

After checking a preview order, open it and find **Test cleanup** below its
history. Choose **Delete test order**, tick the confirmation, then choose
**Delete this test order**. This permanently removes that test order and its
saved history and email records. Any reserved test hats are released; hats used
by a simulated shipment return to test stock. Real orders and live stock are
unchanged. Emails already delivered cannot be removed from inboxes.

This action is available only for preview orders. Live customer orders cannot
be deleted through this control. If a test email is still sending or the order
has changed, refresh the order and wait for sending to finish before deleting.

If the connection drops while deleting, refresh the list to check whether the
order was removed before trying again. The dashboard never repeats a deletion
request automatically.

## Exports and backups

**Export orders** downloads a CSV containing customer contact and delivery
details. Save it privately and share it only with people who need it to fulfil
orders. It is not a complete system backup: it omits database settings, the full
email queue, and other recovery information.

Ask the maintainer to schedule private D1 exports, keep copies outside the public
repository, and rehearse a restore into a separate database. The technical steps
are in the [setup guide](commerce-setup.md#backups-and-recovery).

## Before handing this over as a live shop

- Confirm owner access and recovery for the domain, hosting, database, email,
  and GitHub accounts.
- Confirm the price, stock count, bank details, support inbox, and packed postage;
  keep the order limit at one until larger parcels are checked.
- Review the customer emails and the 1–3-business-day dispatch promise.
- Complete an owner-authorized hosted test and check actual messages in Gmail,
  Apple Mail, and Outlook. Browser previews do not establish inbox rendering.
- Agree who checks unpaid orders, handles delivery problems, and maintains
  backups. Decide the project-code license explicitly; none is invented here.
- Ask the maintainer to finish the protected-hosting and launch checks before
  enabling real orders.
