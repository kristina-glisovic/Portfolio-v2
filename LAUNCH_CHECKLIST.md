# Portfolio Launch Checklist

## Before deployment

- [ ] Confirm the final HTTPS domain and canonical hostname (`www` or non-`www`).
- [ ] Set `shared.site.origin` in `src/content.json` to that exact origin.
- [ ] Set `shared.site.originStatus` to `configured`.
- [ ] Configure `shared.contactForm` with the real HTTPS endpoint described in `CONTACT_FORM_BACKEND.md`.
- [ ] Run `npm run build`.
- [ ] Run `npm run check`.
- [ ] Run `npm run check:production`.
- [ ] Review the favicon and 1200×630 Open Graph image.
- [ ] Test `mailto:hello@kristinaglisovic.dev` in a real mail client.

## Host configuration

- [ ] Force HTTP to HTTPS.
- [ ] Redirect every alternate hostname to the chosen canonical hostname.
- [ ] Redirect `/sr` to `/sr/`.
- [ ] Avoid duplicate `/index.html` and `/sr/index.html` URLs where the host supports redirects.
- [ ] Configure the custom `404.html` response while preserving HTTP status 404.
- [ ] Add reviewed production security headers at the HTTP layer.
- [ ] Use revalidation-oriented caching for HTML and crawl files.
- [ ] Do not mark mutable `style.css` or `main.js` filenames as immutable.

### Security header notes

Configure security headers through the selected production host. No security headers are enforced by this repository while hosting remains unknown.

The following are recommended launch-time starting points, not a ready-to-deploy universal policy:

- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- Use either `X-Frame-Options: DENY` or a validated CSP `frame-ancestors 'none'` policy.
- Add HSTS only after HTTPS and the final hostname configuration are confirmed.

Any Content Security Policy must be tested against the final configured production build before enforcement. In particular, JSON-LD CSP hashes must be generated from the final generated HTML, and the current Codersy favicon remains an external image dependency unless it is replaced later. Enforcing an unvalidated example policy could block required site resources.

## Live smoke test

- [ ] Open `/` and `/sr/` directly.
- [ ] Switch languages in desktop and mobile navigation.
- [ ] Test every navigation hash and footer link.
- [ ] Open and close the mobile menu with pointer, keyboard and Escape.
- [ ] Test the Contact email link.
- [ ] Configure and test the real Contact form HTTPS endpoint.
- [ ] Open MyStar and both ITS verification links.
- [ ] Confirm favicon and Open Graph previews load.
- [ ] Inspect canonical and reciprocal hreflang on both locales.
- [ ] Confirm `robots.txt` and `sitemap.xml` use the final origin.
- [ ] Confirm an unknown URL returns `404.html` with HTTP status 404.
- [ ] Check desktop, tablet, 390px and 320px layouts without horizontal overflow.

## Search engine launch

- [ ] Add the production property to Google Search Console.
- [ ] Submit `sitemap.xml` after the live-site checks pass.
- [ ] Inspect both locale URLs and verify canonical/hreflang interpretation.
- [ ] Optionally repeat the checks in Bing Webmaster Tools.

## Optional later enhancements

- Add privacy-friendly analytics if desired, then reassess privacy/consent requirements.
- Add approved LinkedIn or GitHub profiles.
- Publish dedicated case-study pages.

These enhancements are not launch blockers once the configured Contact endpoint and direct email path have both passed live testing.
