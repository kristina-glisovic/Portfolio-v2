# Kristina Glišović — Portfolio

A dependency-free static bilingual portfolio:

- `/` — English
- `/sr/` — Serbian Latin

## Source of truth

Edit [src/template.html](src/template.html) for shared markup and [src/content.json](src/content.json) for content and site configuration.

`index.html` and `sr/index.html` are generated production files and are intentionally committed to Git. Do not edit them directly.

## Commands

```bash
npm run build             # validate sources and generate both locale pages
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
8. Smoke-test both locale routes on the live domain.

Until a real origin is configured, normal builds remain in safe pre-launch mode and intentionally omit canonical URLs, head-level hreflang, URL-based social metadata, JSON-LD and `sitemap.xml`.

## Contact

Direct email remains available through `mailto:hello@kristinaglisovic.dev`. The project-inquiry form is implemented in frontend-preview mode and cannot report success until a real HTTPS endpoint accepts the request. See `CONTACT_FORM_BACKEND.md` for the backend contract and configuration steps.

See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for the final deployment checklist and host configuration requirements.
