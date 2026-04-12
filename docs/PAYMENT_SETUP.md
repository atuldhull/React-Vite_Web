# Payment Setup (Razorpay)

The project uses Razorpay for plan upgrades. This doc walks through
everything needed to turn the integration on in production.

## Architecture

```
controllers/payment/
├── config.js         # env helpers + lazy Razorpay client + mail transporter
├── orders.js         # POST /api/payment/create-order
├── verification.js   # POST /api/payment/verify  (client-returned signature)
├── webhook.js        # POST /api/payment/webhook (Razorpay server -> us)
├── upgrade.js        # shared "apply plan upgrade" — idempotent
├── billing.js        # GET  /api/payment/history + GET /api/payment/plans
└── invoiceEmail.js   # HTML invoice template + delivery (best-effort)
```

`controllers/paymentController.js` is a barrel that re-exports the above so
existing route imports don't need to change.

## Required environment variables

Add these to `.env.local` (dev) and your production env store:

| Variable | Purpose | Where to get it |
| -------- | ------- | --------------- |
| `RAZORPAY_KEY_ID` | Public key id used by the frontend checkout modal **and** by the backend to create orders. | Razorpay Dashboard -> Settings -> API Keys |
| `RAZORPAY_KEY_SECRET` | Server-only. Used to sign orders and verify the HMAC on client-returned payment signatures. | Same place as Key Id. **Never expose to the browser.** |
| `RAZORPAY_WEBHOOK_SECRET` | HMAC signing key for the server-to-server webhook. **Different** from `RAZORPAY_KEY_SECRET`. | Razorpay Dashboard -> Settings -> Webhooks -> Create/Edit webhook -> Secret |
| `CONTACT_EMAIL` | Gmail account used to send invoice emails. | Project ops — reused from the contact form |
| `CONTACT_APP_PASSWORD` | Gmail app password for `CONTACT_EMAIL`. | Gmail -> Security -> 2SV -> App passwords |
| `PUBLIC_URL` *(optional)* | Used in invoice email links. Falls back to relative URLs. | Your deployed domain, e.g. `https://mathcollective.bmsit.in` |
| `NODE_ENV` | Must be `production` for the webhook to refuse missing secrets. | Deploy config |

### Server behavior when keys are missing

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` missing -> `POST /create-order`
  returns `503` with message "Payments are not yet configured". Server boots
  fine; users just can't upgrade. Good for staging.
- `RAZORPAY_WEBHOOK_SECRET` missing **and** `NODE_ENV=production` -> webhook
  returns `503`. In development it prints a warning and skips signature
  verification (so you can test with ngrok / Razorpay test mode).

## Webhook configuration

1. Razorpay Dashboard -> Settings -> Webhooks -> Add webhook.
2. **URL**: `https://<your-domain>/api/payment/webhook`
3. **Secret**: generate a strong random string. Put the SAME value in
   `RAZORPAY_WEBHOOK_SECRET`. Keep the value out of source control.
4. **Events to subscribe**:
   - `payment.captured` — marks the payment as paid and upgrades the plan.
   - `payment.failed`   — marks the payment row as `failed`.
5. Razorpay retries on non-2xx. The handler is idempotent: replays on
   already-paid orders return `{ received: true }` without re-applying.

## Subscription plans table

`createOrder` looks up the plan by `name`. Plans live in Supabase in
`subscription_plans`:

```
id              uuid primary key
name            text unique         -- lookup key, e.g. "pro"
display_name    text                -- shown in invoices, e.g. "Pro"
price_monthly   numeric             -- INR, NOT paise. Server multiplies x100.
max_users       int
max_challenges  int
max_events      int
features        jsonb               -- feature-flag overrides for the plan
```

A price of `0` is treated as a free plan — the server refuses to create an
order for it and asks the caller to contact the super-admin instead.

## Payment flow end-to-end

1. **Create order**  
   Frontend (org admin): `POST /api/payment/create-order { plan_name }`  
   Response: `{ order_id, amount, currency, key_id, plan_name, plan_display }`  
   The server writes a `payment_history` row with `status: "created"`.

2. **Checkout**  
   Frontend opens Razorpay's checkout modal using `key_id` + `order_id`.
   User completes payment. Razorpay returns  
   `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` to the
   browser.

3. **Verify (client-returned)**  
   Frontend: `POST /api/payment/verify` with those three fields.  
   Server HMAC-verifies the signature with `RAZORPAY_KEY_SECRET` (constant-time
   compare), then calls the shared `applyPlanUpgrade` helper which:
   - rereads the `payment_history` row to detect a webhook race
   - if already paid, returns the current state (idempotent)
   - otherwise sets `organisations.plan_name/plan_id/plan_expires_at/status`
     and updates the `payment_history` row
   - triggers the invoice email (best-effort, failure is logged not thrown)

4. **Webhook (server-to-server)**  
   Razorpay also fires `payment.captured`. Server verifies the
   `X-Razorpay-Signature` HMAC against the **raw request body** (not a
   re-serialized JSON — that would break the HMAC). Uses the same
   `applyPlanUpgrade` helper, same idempotency rule.

Running both paths with the same idempotent helper means whichever one arrives
first wins, and the other becomes a no-op.

## Testing locally

The supertest suite under `tests/integration/payment.test.js` exercises:

- Order creation validation (missing plan, unknown plan, free-plan rejection,
  happy path with a mocked Razorpay client)
- Signature verification (happy + invalid)
- verify idempotency on already-paid orders
- Webhook signature rejection + happy path + idempotency + failed event

Run: `npx vitest run tests/integration/payment.test.js`

## Frontend wiring

Already in place at `frontend/src/features/student/pages/BillingPage.jsx` —
it calls the API, opens the Razorpay checkout, and posts to `/verify`. Once
you drop real keys in `.env.local` and restart the server, the full flow
works end-to-end against Razorpay's test mode.
