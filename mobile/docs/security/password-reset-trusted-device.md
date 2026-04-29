# Password reset — Approve on trusted device (Sprint plan + API contract)

## Why
The current "forgot password" flow allows anyone who knows an email to submit a new password and wait for admin approval. This is risky and does not prove account ownership.

This strategy replaces it with **in-app approval from an already authenticated ("trusted") device** using push notifications. Knowing an email is no longer enough to change the password.

---

## Sprint 0 — Baseline & deprecation (0.5–1 day)

### Deliverables
- Mobile: `ForgotPassword` screen no longer sends `newPassword`.
- Admin: "Password resets" page is marked **deprecated** (read-only / informational).
- Docs: this file committed with API contract.

### Acceptance criteria
- The app never transmits a new password in a "request reset" call.
- Admin cannot approve/reject password resets anymore from UI.

---

## Sprint 1 — Backend primitives (1–2 days)

### Data model (example)
**password_reset_intents**
- `id` (uuid)
- `user_id` (uuid)
- `status` enum: `PENDING_APPROVAL | APPROVED | DENIED | EXPIRED | COMPLETED`
- `requested_at`, `expires_at`
- `requested_ip`, `requested_user_agent`, `requested_device_label` (optional)
- `approved_at`, `approved_by_device_id` (optional)

**password_reset_tickets**
- `id` (uuid)
- `intent_id` (uuid)
- `ticket_hash` (string) — store a hash, never plaintext
- `expires_at`
- `used_at` (nullable)

**user_devices**
- `id` (uuid)
- `user_id` (uuid)
- `expo_push_token` (string)
- `platform` (`ios|android`)
- `device_label` (optional)
- `last_seen_at`

### Endpoints (contract)
All responses must be neutral against email enumeration.

1) **Request reset (unauthenticated)**
- `POST /auth/password-reset/request`
- body: `{ "email": "user@example.com" }`
- response (always 200): `{ "ok": true }`
- behavior:
  - rate limit by IP + email
  - if user exists and has trusted devices → send push with `intent_id`
  - create intent with short expiry (10–30 min)

2) **Get intent (authenticated, for UI details)**
- `GET /auth/password-reset/intents/:id`
- auth: bearer access token
- response: `{ id, status, requestedAt, requestedIp?, deviceLabel? }`

3) **Approve / deny (authenticated)**
- `POST /auth/password-reset/intents/:id/approve`
- response: `{ "ticket": "<opaque>", "expiresAt": "<iso>" }`
- `POST /auth/password-reset/intents/:id/deny`
- response: `{ ok: true }`

4) **Confirm new password (ticket-based)**
- `POST /auth/password-reset/confirm`
- body: `{ "intentId": "...", "ticket": "...", "newPassword": "..." }`
- response: `{ ok: true }`
- behavior:
  - validate ticket (hash compare), expiry, single-use
  - set password
  - invalidate all refresh tokens / sessions (global logout)
  - mark intent completed + ticket used

5) **Register device push token (authenticated)**
- `POST /auth/devices/register`
- body: `{ expoPushToken, platform, deviceLabel? }`
- response: `{ ok: true }`

### Acceptance criteria
- Without an existing authenticated device, password reset cannot be completed via this flow.
- A user with at least one logged-in device can approve/deny and complete reset.
- Global logout occurs after reset.

---

## Sprint 2 — Mobile (1–2 days)

### Deliverables
- Register Expo push token after login (best-effort).
- Handle push tap → open approval screen for the given `intent_id`.
- `PasswordResetApprovalScreen` (approve/deny).
- `SetNewPasswordScreen` (confirm using `ticket`).
- Update `ForgotPassword` UX: explains "approve on your connected device" + fallback support.

### Acceptance criteria
- Push tap navigates reliably to approval screen.
- Approve returns ticket and allows setting a new password.
- Errors are user-friendly (expired intent, already handled, no permission).

---

## Sprint 3 — Hardening & abuse controls (1 day)

### Deliverables
- Rate limiting tuned (IP/email/device).
- Intent invalidation rules (only one active intent per user).
- Audit logs (requested/approved/denied/completed).
- Notifications & alerts to the user on request + on completion.

### Acceptance criteria
- Burst requests are throttled.
- Only latest intent can be approved.
- All events are traceable for support.

---

## Sprint 4 — Fallback recovery (optional, 1–2 days)

Pick one:
- Passkeys (recommended long-term), or
- phone OTP, or
- manual support workflow.

