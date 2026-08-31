# Kristina Glišović — Portfolio

A dependency-free static multilingual portfolio with two currently enabled locales:

- `/` — English
- `/sr/` — Serbian Latin

German is prepared in `localeConfig` as `/de/`, but remains `enabled: false` and `contentStatus: "draft"`. Normal builds do not generate or link `/de/` and do not emit German SEO signals.

## Source of truth

Edit [src/template.html](src/template.html) for shared markup and [src/content.json](src/content.json) for content and site configuration.

`index.html` and `sr/index.html` are generated production files and are intentionally committed to Git. Do not edit them directly. Only enabled, approved locales produce public HTML.

## Commands

```bash
npm run build             # validate sources and generate enabled locale pages
npm run check             # verify committed output matches the sources
npm run serve             # serve the repository at http://127.0.0.1:4173
npm run check:production  # validate launch-only domain, SEO and crawl requirements
```

Node.js 20 or newer is recommended. The project has no third-party npm dependencies.

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

1. Add the complete reviewed German content object at `locales.de`, matching the approved locale schema.
2. Set the German `contentStatus` to `approved` in `localeConfig`.
3. Set German `enabled` to `true`.
4. Run `npm run build` and `npm run check`.
5. Run `npm run check:production` once the production origin, Contact endpoint and other launch requirements are configured.
6. Verify `/de/`, the language dropdown, canonical/hreflang, Open Graph locale, JSON-LD language and sitemap output before deployment.

The build fails instead of falling back to English when an enabled locale is incomplete. Do not use draft or machine-translated German as production content.

## Contact

Direct email remains available through `mailto:hello@kristinaglisovic.dev`. The project-inquiry form is implemented in frontend-preview mode and cannot report success until a real HTTPS endpoint accepts the request. See `CONTACT_FORM_BACKEND.md` for the backend contract and configuration steps.

See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for the final deployment checklist and host configuration requirements.
