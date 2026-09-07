# Contact form backend

The portfolio form posts JSON to the same-origin Cloudflare Worker endpoint at `/api/contact`. The Worker validates the request and asks Resend to deliver it to `hello@kristinaglisovic.dev`. Direct email remains fully functional.

## Required architecture

```text
Browser form
  → HTTPS POST endpoint
  → server/serverless validation
  → spam protection and rate limiting
  → SMTP or transactional-email provider
  → actual delivery
  → genuine success/error response
```

The Resend key is read only from the Cloudflare Worker secret `RESEND_API_KEY`. Provider API keys and other secrets must never be added to `src/content.json`, generated HTML or `assets/main.js`.

## Request

The browser sends `Content-Type: application/json` with these fields:

- `name` — required
- `email` — required and valid
- `company` — optional
- `projectType` — required
- `details` — required, minimum 20 characters
- `timeline` — optional
- `budget` — optional
- `locale` — `en` or `sr`
- `website` — invisible honeypot; legitimate visitors leave it empty

The Worker repeats validation server-side, rejects unexpected fields, enforces a 16 KiB body limit and escapes all user content before including it in HTML email. A populated honeypot receives a generic success response without calling Resend.

## Response

- `{ "ok": true }` with HTTP 200 means Resend accepted the inquiry and allows the frontend to show the localized success state.
- Any non-`2xx` response or network failure produces the localized error state.
- A successful HTTP response must only be returned after a genuine delivery attempt has been accepted by the email service.

## Cloudflare configuration

Configure `RESEND_API_KEY` as a Worker secret. Do not store it in a local `.env` file or source control.

No persistent rate-limit binding currently exists in the project. Before public launch, configure a Cloudflare-native rate-limiting rule for `POST /api/contact` (or add a Cloudflare Rate Limiting binding) with a conservative per-IP threshold. Do not replace this with an in-memory Worker counter because isolates do not share reliable state.

The endpoint is already centralized in `src/content.json` as `/api/contact`. Run:

```bash
npm run build
npm run check
npm run check:production
```

The production check verifies that the configured same-origin endpoint is backed by the Worker and that the Worker reads `env.RESEND_API_KEY`. A live submission can succeed only after the secret and sending domain are correctly configured in Cloudflare and Resend.
