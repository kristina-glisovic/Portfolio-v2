# Kristina Glišović — Portfolio

A lightweight static multilingual portfolio with two currently enabled locales:

- `/` — English
- `/sr/` — Serbian Latin

German is prepared in `localeConfig` as `/de/`, but remains `enabled: false` and `contentStatus: "draft"`. Normal builds do not generate or link `/de/` and do not emit German SEO signals.

## Source of truth

Edit [src/template.html](src/template.html) for shared markup, [src/content.json](src/content.json) for content and site configuration, [src/style.css](src/style.css) for site styles, [src/devices.css](src/devices.css) for the two supported device mockups, and [src/main.js](src/main.js) for browser behavior.

`index.html`, `sr/index.html`, `assets/style.css`, `assets/devices.min.css`, and `assets/main.js` are generated production files and are intentionally committed to Git. Do not edit them directly. The build minifies the readable CSS/JavaScript sources while preserving the existing public asset paths. Only enabled, approved locales produce public HTML.

## Commands

```bash
npm run build             # validate sources and generate enabled locale pages
npm run check             # verify committed output matches the sources
npm run serve             # serve the repository at http://127.0.0.1:4173
npm run check:production  # validate launch-only domain, SEO and crawl requirements
```

Node.js 20 or newer is recommended. Run `npm ci` after cloning to install the pinned build-time minifier.

## Before launch

1. Set the real production origin in `src/content.json`.
2. Change `originStatus` to `configured`.
3. Run `npm run build`.
4. Run `npm run check`.
5. Run `npm run check:production`.
6. Verify the generated canonical, hreflang, JSON-LD, robots and sitemap output.
7. Deploy the repository root as a static site.
8. Smoke-test every enabled locale route on the live domain.

Until a real origin is configured, normal builds remain in safe pre-launch mode and intentionally omit canonical URLs, head-level hreflang, URL-based social metadata, JSON-LD and `sitemap.xml`.

## Enabling German later

Cloudflare initial locale routing reads the same `localeConfig` at Worker bundle time.
Rebuild and deploy after enabling a locale to activate its country mapping.

1. Add the complete reviewed German content object at `locales.de`, matching the approved locale schema.
2. Set the German `contentStatus` to `approved` in `localeConfig`.
3. Set German `enabled` to `true`.
4. Run `npm run build` and `npm run check`.
5. Run `npm run check:production` once the production origin, Contact endpoint and other launch requirements are configured.
6. Verify `/de/`, the language dropdown, canonical/hreflang, Open Graph locale, JSON-LD language and sitemap output before deployment.

## Initial locale preference on Cloudflare

The Worker runs before static assets. Only GET/HEAD requests to `/` receive automatic
locale selection: a valid saved manual preference first, then RS → SR or DE → DE,
then English. Disabled/draft locales are never selected; Germany currently receives English.
Explicit localized URLs and asset paths are passed through unchanged.

Language menu links use the destination route with `?locale=en` (or `sr`, eventually `de`).
The Worker validates that choice against approved/enabled locales, sets `portfolio_locale`,
and returns a 302 to the clean destination. Other query parameters are retained. Browsers
inherit the original fragment when the redirect Location has no fragment; the server never
receives URL fragments. The cookie is first-party, lasts 180 days, and uses Secure, HttpOnly,
SameSite=Lax and Path=/. It is only set by explicit selection, never by geolocation.
The frontend does not read/write cookies or persistent storage. No IP or country is stored.

Redirects and preference-dependent root responses use `Cache-Control: no-store`.
Known crawler user agents and Cloudflare verified bots bypass automatic selection,
including saved preferences. Bot detection is best-effort, not an access restriction.
No external geo service or browser location permission is used. Missing/invalid country
information falls back to English unless a valid saved manual preference exists.

`npm run serve` remains plain static hosting: locale links work, query parameters are
ignored, and no geo redirect or preference persistence occurs. The Worker also bypasses
automatic routing on localhost/loopback; Cloudflare uses trusted `request.cf.country`
with `CF-IPCountry` as fallback. Run `node --test scripts/locale-routing.test.mjs` to
simulate country, cookie, crawler and future German scenarios without deployment.

The build fails instead of falling back to English when an enabled locale is incomplete. Do not use draft or machine-translated German as production content.

## Contact

Direct email remains available through `mailto:hello@kristinaglisovic.dev`. The project-inquiry form posts to the same-origin Cloudflare Worker endpoint `/api/contact`; the Worker validates the request and sends it through Resend using the `RESEND_API_KEY` Worker secret. The frontend reports success only after the provider accepts the request. See `CONTACT_FORM_BACKEND.md` for the security, rate-limit and live-test requirements.

See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for the final deployment checklist and host configuration requirements.
