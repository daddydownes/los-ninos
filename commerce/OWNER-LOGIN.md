# Owner access

The shop supports either Cloudflare Access (the default) or owner email codes. Customer checkout never requires this login.

For email codes, set `OWNER_AUTH_MODE=email`, configure the verified `EMAIL_FROM` and `RESEND_API_KEY`, and store `OWNER_EMAILS` (comma-separated approved addresses) plus an independent random `OWNER_AUTH_SECRET` of at least 32 characters as Worker secrets. Do not commit either secret. Apply `migrations/0002-owner-email-login.sql` before deploying. The full schema includes these tables for new installations.

Owners visit `/admin` on `PUBLIC_STORE_URL`; they are redirected to `/owner-login` when signed out. Only that HTTPS origin accepts a login. Codes last 10 minutes, allow five guesses, and work once in the browser that requested them. Sessions last at most eight hours with a 30-minute idle timeout. Sign out revokes the stored session. Removing an address from `OWNER_EMAILS` revokes its access immediately; rotating `OWNER_AUTH_SECRET` revokes all codes and sessions. Preserve `ORDER_TOKEN_SECRET` when changing owner access, as customer receipt links depend on it.

Request limits protect the email allowance: three codes per owner per 15-minute window, ten per owner per UTC day, and twenty total per UTC day. IP limits also apply. The same generic request response is returned for unknown addresses and owner-level limits. If a code does not arrive, check spam, confirm the allowlist and sender configuration, then inspect Resend delivery events. Wait for the relevant window to reset rather than repeatedly requesting codes. Provider rejections log only the status code, never the email address, code or token. A request timeout can still have delivered the email; try the received code in the same browser before requesting another. The five-minute scheduled job clears expired sessions and challenges.

Email-code login does not activate Cloudflare Zero Trust billing. Existing Cloudflare Access installations can keep their original mode, team domain and audience settings.

Before live launch, verify a real delivered code can open the hosted dashboard, verify sign-out revokes access, and confirm normal bank-transfer checkout is enabled only when every setup check passes. Unit tests use fictional bank details and mock email delivery. Never mark a real order paid based solely on a customer screenshot; confirm the transfer in the receiving bank account.
