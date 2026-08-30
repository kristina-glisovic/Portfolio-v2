# Contact form backend contract

The portfolio form is intentionally in frontend-preview mode until a real endpoint is configured. Direct email remains fully functional.

For any public pre-launch or staging build without a configured endpoint, hide or disable the form rather than exposing a form that cannot submit; keep the direct email path available.

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

SMTP credentials, provider API keys and other secrets must remain on the server. They must never be added to `src/content.json`, generated HTML or `assets/main.js`.

## Request

The browser sends `Content-Type: application/json` with these fields:

- `name` — required
- `email` — required and valid
- `company` — optional
- `projectType` — required
- `details` — required, minimum 20 characters
- `timeline` — optional
- `budget` — optional

The endpoint must repeat validation server-side, reject unexpected fields, enforce payload limits, sanitize content for email output and apply spam/rate-limit protection.

## Response

- Any `2xx` response means the provider accepted the inquiry and allows the frontend to show the localized success state.
- Any non-`2xx` response or network failure produces the localized error state.
- A successful HTTP response must only be returned after a genuine delivery attempt has been accepted by the email service.

## Enabling the form

After a real endpoint exists, update `shared.contactForm` in `src/content.json`:

```json
{
  "endpointStatus": "configured",
  "endpoint": "https://your-production-endpoint.example/contact"
}
```

Use the real HTTPS endpoint, not the example above. Then run:

```bash
npm run build
npm run check
npm run check:production
```

The production check rejects an unconfigured, malformed, non-HTTPS or `example.com` endpoint. Until configuration, submitting the preview form never sends a request and never reports fake success.
