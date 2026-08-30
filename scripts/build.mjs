import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(rootDir, 'src/template.html');
const contentPath = resolve(rootDir, 'src/content.json');
const checkOnly = process.argv.includes('--check');
const localeOrder = ['en', 'sr'];
const outputConfig = {
  en: { path: resolve(rootDir, 'index.html'), assetPrefix: 'assets/', rootPrefix: '', route: '/' },
  sr: { path: resolve(rootDir, 'sr/index.html'), assetPrefix: '../assets/', rootPrefix: '../', route: '/sr/' }
};
const robotsPath = resolve(rootDir, 'robots.txt');
const sitemapPath = resolve(rootDir, 'sitemap.xml');

const fail = message => {
  throw new Error(message);
};

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeXml = value => escapeHtml(value);

function normalizeSiteOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    fail('shared.site.origin must be a valid absolute URL');
  }
  if (url.protocol !== 'https:') fail('shared.site.origin must use HTTPS');
  if (url.pathname !== '/' || url.search || url.hash) fail('shared.site.origin must not include a path, query, or hash');
  if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com')) {
    fail('Configured shared.site.origin must not use example.com');
  }
  return url.origin;
}

function getContactFormEndpoint(content) {
  const config = content.shared?.contactForm;
  if (!config || !['unconfigured', 'configured'].includes(config.endpointStatus)) {
    fail('shared.contactForm.endpointStatus must be "unconfigured" or "configured"');
  }
  if (config.endpointStatus === 'unconfigured') return '';
  if (typeof config.endpoint !== 'string' || !config.endpoint.trim()) {
    fail('shared.contactForm.endpoint is required when the contact form is configured');
  }
  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    fail('shared.contactForm.endpoint must be a valid absolute URL');
  }
  if (endpoint.protocol !== 'https:') fail('shared.contactForm.endpoint must use HTTPS');
  if (endpoint.hostname === 'example.com' || endpoint.hostname.endsWith('.example.com')) {
    fail('shared.contactForm.endpoint must not use example.com');
  }
  return endpoint.href;
}

function buildSeoContext(locale, content) {
  const configured = content.shared.site.originStatus === 'configured';
  if (!configured) return { configured };
  const origin = normalizeSiteOrigin(content.shared.site.origin);
  const canonical = `${origin}${outputConfig[locale].route}`;
  const englishUrl = `${origin}${outputConfig.en.route}`;
  const serbianUrl = `${origin}${outputConfig.sr.route}`;
  const ogImageUrl = `${origin}/${content.shared.site.ogImagePath.replace(/^\/+/, '')}`;
  const personId = `${englishUrl}#person`;
  const localeMeta = content.locales[locale].meta;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: content.shared.name,
        url: englishUrl,
        jobTitle: localeMeta.schemaJobTitle,
        homeLocation: {
          '@type': 'Country',
          name: content.shared.site.country
        },
        knowsAbout: content.shared.site.knowsAbout,
        alumniOf: content.shared.site.alumniOf.map(name => ({
          '@type': 'CollegeOrUniversity',
          name
        }))
      },
      {
        '@type': 'WebSite',
        '@id': `${canonical}#website`,
        url: canonical,
        name: localeMeta.schemaWebsiteName,
        inLanguage: localeMeta.schemaLanguage,
        author: { '@id': personId },
        publisher: { '@id': personId }
      }
    ]
  };
  return { configured, canonical, englishUrl, serbianUrl, ogImageUrl, jsonLd };
}

function getPath(context, path) {
  const value = path.split('.').reduce((current, part) => current?.[part], context);
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Missing required string: ${path}`);
  }
  return value;
}

function getValue(context, path) {
  const value = path.split('.').reduce((current, part) => current?.[part], context);
  if (value === undefined || value === null) fail(`Missing required value: ${path}`);
  return value;
}

function assertNonEmptyStrings(value, path) {
  if (typeof value === 'string') {
    if (!value.trim()) fail(`Empty string at ${path}`);
    if (/[<>]/.test(value)) fail(`Unrestricted HTML is not allowed in content: ${path}`);
    return;
  }
  if (typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    if (!value.length) {
      if (path.endsWith('.testimonials.entries')) return;
      fail(`Empty array at ${path}`);
    }
    value.forEach((item, index) => assertNonEmptyStrings(item, `${path}.${index}`));
    return;
  }
  if (!value || typeof value !== 'object') fail(`Invalid content value at ${path}`);
  const entries = Object.entries(value);
  if (!entries.length) fail(`Empty object at ${path}`);
  entries.forEach(([key, item]) => assertNonEmptyStrings(item, `${path}.${key}`));
}

function assertParity(left, right, path = 'locales') {
  if (typeof left !== typeof right) fail(`Locale type mismatch at ${path}`);
  if (Array.isArray(left) !== Array.isArray(right)) fail(`Locale collection mismatch at ${path}`);
  if (Array.isArray(left)) {
    if (left.length !== right.length) fail(`Locale array length mismatch at ${path}`);
    left.forEach((item, index) => {
      if (item && typeof item === 'object' && 'id' in item && item.id !== right[index]?.id) {
        fail(`Locale stable ID mismatch at ${path}.${index}`);
      }
      assertParity(item, right[index], `${path}.${index}`);
    });
    return;
  }
  if (left && typeof left === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) fail(`Locale key mismatch at ${path}`);
    leftKeys.forEach(key => assertParity(left[key], right[key], `${path}.${key}`));
  }
}

function setAttribute(tag, name, value) {
  const escaped = escapeHtml(value);
  const attribute = new RegExp(`\\s${name}="[^"]*"`);
  if (attribute.test(tag)) return tag.replace(attribute, ` ${name}="${escaped}"`);
  return tag.replace(/\s*\/?\>$/, ending => ` ${name}="${escaped}"${ending}`);
}

function applyAttributeDirective(html, directive, attribute, context) {
  const marker = `data-content-${directive}`;
  const tagPattern = new RegExp(`<([a-z][\\w-]*)([^>]*\\s${marker}="([^"]+)"[^>]*)>`, 'gi');
  return html.replace(tagPattern, fullTag => {
    const key = fullTag.match(new RegExp(`${marker}="([^"]+)"`, 'i'))?.[1];
    let updated = fullTag.replace(new RegExp(`\\s${marker}="[^"]+"`, 'i'), '');
    updated = setAttribute(updated, attribute, getPath(context, key));
    return updated;
  });
}

function renderLocaleLinks(html, locale, context) {
  return html.replace(/<a class="lang-btn" data-locale-link="(en|sr)">(EN|SR)<\/a>/g, (_, target, label) => {
    const isCurrent = target === locale;
    const href = locale === 'en'
      ? (target === 'en' ? './' : 'sr/')
      : (target === 'en' ? '../' : './');
    const language = target === 'en' ? 'en' : 'sr-Latn';
    const accessible = target === 'en' ? context.ui.languageEnglish : context.ui.languageSerbian;
    return `<a class="lang-btn${isCurrent ? ' active' : ''}" href="${href}" lang="${language}" hreflang="${language}" aria-label="${escapeHtml(accessible)}"${isCurrent ? ' aria-current="page"' : ''}>${label}</a>`;
  });
}

function renderTestimonials(localeContent) {
  const testimonials = localeContent.testimonials;
  const entries = testimonials?.entries;

  if (!Array.isArray(entries)) fail('testimonials.entries must be an array');
  if (!entries.length) return '';
  if (entries.length > 6) fail('testimonials.entries supports a maximum of six homepage testimonials');

  const ids = new Set();
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') fail(`Invalid testimonial at testimonials.entries.${index}`);
    if (!/^[a-z0-9-]+$/.test(entry.id || '')) fail(`Invalid testimonial ID at testimonials.entries.${index}`);
    if (ids.has(entry.id)) fail(`Duplicate testimonial ID: ${entry.id}`);
    ids.add(entry.id);
    ['quote', 'name'].forEach(field => {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) {
        fail(`Missing testimonial ${field} at testimonials.entries.${index}`);
      }
    });
    ['role', 'company', 'service'].forEach(field => {
      if (entry[field] !== undefined && (typeof entry[field] !== 'string' || !entry[field].trim())) {
        fail(`Invalid optional testimonial ${field} at testimonials.entries.${index}`);
      }
    });
    if (entry.isDemo !== undefined && typeof entry.isDemo !== 'boolean') {
      fail(`Invalid testimonial isDemo marker at testimonials.entries.${index}`);
    }
  });

  const slides = entries.map((entry, index) => {
    const personDetails = [entry.role, entry.company].filter(Boolean).map(escapeHtml).join(' · ');
    const detailMarkup = personDetails ? `\n                <p class="client-feedback-person-role">${personDetails}</p>` : '';
    const serviceMarkup = entry.service ? `\n              <p class="client-feedback-service">${escapeHtml(entry.service)}</p>` : '';
    return `          <article class="client-feedback-slide" data-testimonial-slide data-testimonial-id="${escapeHtml(entry.id)}"${index ? ' hidden' : ''}>
            <blockquote class="client-feedback-quote">
              <p>${escapeHtml(entry.quote)}</p>
            </blockquote>
            <footer class="client-feedback-person">
              <div>
                <p class="client-feedback-person-name">${escapeHtml(entry.name)}</p>${detailMarkup}
              </div>${serviceMarkup}
            </footer>
          </article>`;
  }).join('\n');
  const total = String(entries.length).padStart(2, '0');
  const controlsHidden = entries.length < 2 ? ' hidden' : '';

  return `<div class="divider" aria-hidden="true"></div>

  <!-- ═══ CLIENT FEEDBACK ══════════════════════════════════════════════ -->
  <section class="client-feedback section" id="testimonials" aria-labelledby="testimonials-title" data-premium-section>
    <div class="container">
      <header class="client-feedback-header">
        <div class="section-label reveal">${escapeHtml(testimonials.label)}</div>
        <h2 class="section-title reveal reveal-delay-1" id="testimonials-title">${escapeHtml(testimonials.title)}</h2>
      </header>

      <div class="client-feedback-slider reveal reveal-delay-2" data-testimonial-slider data-status-template="${escapeHtml(testimonials.statusTemplate)}">
        <div class="client-feedback-viewport">
${slides}
        </div>
        <div class="client-feedback-controls"${controlsHidden}>
          <div class="client-feedback-buttons">
            <button class="client-feedback-button" type="button" data-testimonial-previous aria-label="${escapeHtml(testimonials.previousLabel)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <button class="client-feedback-button" type="button" data-testimonial-next aria-label="${escapeHtml(testimonials.nextLabel)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
          <span class="client-feedback-counter" data-testimonial-counter aria-hidden="true">01 / ${total}</span>
          <p class="client-feedback-sr-only" data-testimonial-status aria-live="polite"></p>
        </div>
      </div>
    </div>
  </section>
`;
}

function render(template, locale, content) {
  const localeContent = content.locales[locale];
  const seo = buildSeoContext(locale, content);
  const context = { ...localeContent, shared: content.shared, seo };
  let html = template;

  html = html.replace(/\{\{#if seo\.configured\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, body) => seo.configured ? body : '');
  html = html.replace('{{testimonialsSection}}', renderTestimonials(localeContent));
  html = html.replaceAll('{{contactFormEndpoint}}', escapeHtml(getContactFormEndpoint(content)));
  html = html.replace(/<([a-z][\w-]*)([^>]*?)\sdata-content="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_, tag, before, key, after) => `<${tag}${before}${after}>${escapeHtml(getPath(context, key))}</${tag}>`);
  html = applyAttributeDirective(html, 'aria-label', 'aria-label', context);
  html = applyAttributeDirective(html, 'alt', 'alt', context);
  html = applyAttributeDirective(html, 'content', 'content', context);
  html = renderLocaleLinks(html, locale, context);
  html = html.replace(/\{\{json:([^}]+)\}\}/g, (_, key) => JSON.stringify(getValue(context, key)).replaceAll('<', '\\u003c'));
  html = html.replace(/\{\{(text|attr):([^}]+)\}\}/g, (_, __, key) => escapeHtml(getPath(context, key)));
  html = html.replaceAll('{{assetPrefix}}', outputConfig[locale].assetPrefix);
  html = html.replaceAll('{{rootPrefix}}', outputConfig[locale].rootPrefix);
  html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Generated file. Do not edit directly. Edit src/template.html or src/content.json and run npm run build. -->');
  html = html.replace(/[ \t]+$/gm, '');
  return html;
}

function validateGeneratedHtml(html, locale, content) {
  if (/\{\{[^}]+\}\}/.test(html)) fail(`${locale}: unresolved template token`);
  if (/\bdata-(?:i18n|content)(?:-[\w-]+)?=/.test(html)) fail(`${locale}: unresolved content directive`);
  if (/translations\.json/.test(html)) fail(`${locale}: generated HTML references translations.json`);
  if (!new RegExp(`<html lang="${locale === 'en' ? 'en' : 'sr-Latn'}"`).test(html)) fail(`${locale}: incorrect html lang`);
  if (!/<title>\s*[^<]+\s*<\/title>/.test(html)) fail(`${locale}: missing title`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`${locale}: missing meta description`);

  const seo = buildSeoContext(locale, content);
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
  if (!/<meta name="robots" content="index,follow,max-image-preview:large"/.test(html)) fail(`${locale}: missing robots meta`);

  const metaContent = (kind, name) => html.match(new RegExp(`<meta ${kind}="${name.replaceAll(':', '\\:')}" content="([^"]+)"`))?.[1];
  if (!metaContent('property', 'og:title') || !metaContent('property', 'og:description')
    || !metaContent('property', 'og:site_name') || !metaContent('property', 'og:locale')) {
    fail(`${locale}: incomplete origin-independent Open Graph metadata`);
  }
  if (metaContent('name', 'twitter:card') !== 'summary_large_image'
    || !metaContent('name', 'twitter:title') || !metaContent('name', 'twitter:description')) {
    fail(`${locale}: incomplete origin-independent Twitter card metadata`);
  }

  const canonicalMatches = [...head.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
  const alternateMatches = [...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
  const jsonLdMatch = head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (seo.configured) {
    if (canonicalMatches.length !== 1) fail(`${locale}: expected exactly one canonical link`);
    if (canonicalMatches[0][1] !== seo.canonical) fail(`${locale}: self-canonical does not match the locale route`);
    const alternates = Object.fromEntries(alternateMatches.map(match => [match[1], match[2]]));
    if (alternates.en !== seo.englishUrl || alternates['sr-Latn'] !== seo.serbianUrl || alternates['x-default'] !== seo.englishUrl) {
      fail(`${locale}: hreflang targets are incomplete or inconsistent`);
    }
    if (metaContent('property', 'og:url') !== seo.canonical) fail(`${locale}: og:url must equal canonical`);
    if (metaContent('property', 'og:image') !== seo.ogImageUrl || !metaContent('property', 'og:image:alt')) {
      fail(`${locale}: missing or incorrect configured-mode og:image metadata`);
    }
    if (metaContent('name', 'twitter:image') !== seo.ogImageUrl || !metaContent('name', 'twitter:image:alt')) {
      fail(`${locale}: missing or incorrect configured-mode Twitter image metadata`);
    }
    if (!jsonLdMatch) fail(`${locale}: missing configured-mode JSON-LD graph`);
    let jsonLd;
    try {
      jsonLd = JSON.parse(jsonLdMatch[1]);
    } catch {
      fail(`${locale}: JSON-LD does not parse`);
    }
    const graph = jsonLd?.['@graph'];
    const person = graph?.find(item => item['@type'] === 'Person');
    const website = graph?.find(item => item['@type'] === 'WebSite');
    if (!person || !website) fail(`${locale}: JSON-LD must contain Person and WebSite entities`);
    if (person.url !== seo.englishUrl || website.url !== seo.canonical || website.inLanguage !== content.locales[locale].meta.schemaLanguage) {
      fail(`${locale}: JSON-LD URLs or language do not match the canonical strategy`);
    }
  } else {
    if (canonicalMatches.length || alternateMatches.length) fail(`${locale}: placeholder mode must omit canonical and head hreflang links`);
    if (metaContent('property', 'og:url') || metaContent('property', 'og:image') || metaContent('name', 'twitter:image')) {
      fail(`${locale}: placeholder mode must omit origin-dependent social URLs`);
    }
    if (jsonLdMatch) fail(`${locale}: placeholder mode must omit URL-dependent JSON-LD`);
    if (/https:\/\/example\.com/i.test(html)) fail(`${locale}: placeholder mode generated an example.com SEO signal`);
  }
  if (!/<link rel="icon" href="[^"]+favicon\.svg" type="image\/svg\+xml"/.test(html)
    || !/<link rel="icon" href="[^"]+favicon-32\.png" type="image\/png" sizes="32x32"/.test(html)
    || !/<link rel="icon" href="[^"]*favicon\.ico" type="image\/x-icon" sizes="32x32"/.test(html)
    || !/<link rel="apple-touch-icon" href="[^"]+apple-touch-icon\.png" sizes="180x180"/.test(html)) {
    fail(`${locale}: favicon links are incomplete`);
  }

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) fail(`${locale}: duplicate IDs: ${[...new Set(duplicates)].join(', ')}`);
  const idSet = new Set(ids);

  for (const match of html.matchAll(/\baria-labelledby="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) {
      if (!idSet.has(id)) fail(`${locale}: unresolved aria-labelledby target: ${id}`);
    }
  }
  for (const match of html.matchAll(/\bhref="#([^"]+)"/g)) {
    if (!idSet.has(match[1])) fail(`${locale}: unresolved internal hash: #${match[1]}`);
  }

  const headingMatches = [...html.matchAll(/<h([1-5])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  for (const [, level, body] of headingMatches) {
    if (!body.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, 'x').trim()) fail(`${locale}: empty h${level}`);
  }
  if ((html.match(/<main\b/g) || []).length !== 1) fail(`${locale}: expected exactly one main`);
  if ((html.match(/<h1\b/g) || []).length !== 1) fail(`${locale}: expected exactly one h1`);
}

async function validateAssets(html, outputPath, locale, content) {
  const references = [];
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) references.push(match[1]);
  for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) {
    references.push(...match[1].split(',').map(item => item.trim().split(/\s+/)[0]));
  }
  for (const reference of references) {
    if (!reference.includes('assets/')) continue;
    const clean = reference.split('?')[0].split('#')[0];
    let assetPath;
    if (/^https?:\/\//.test(clean)) {
      const url = new URL(clean);
      if (url.origin !== normalizeSiteOrigin(content.shared.site.origin)) continue;
      assetPath = resolve(rootDir, `.${url.pathname}`);
    } else {
      assetPath = resolve(dirname(outputPath), clean);
    }
    try {
      await access(assetPath);
    } catch {
      fail(`${locale}: missing asset ${reference}`);
    }
  }
}

async function validateRequiredSeoAssets(content) {
  const required = [
    resolve(rootDir, content.shared.site.ogImagePath),
    resolve(rootDir, 'assets/favicon.svg'),
    resolve(rootDir, 'assets/favicon-32.png'),
    resolve(rootDir, 'assets/apple-touch-icon.png'),
    resolve(rootDir, 'favicon.ico')
  ];
  for (const assetPath of required) {
    try {
      await access(assetPath);
    } catch {
      fail(`Missing required SEO asset: ${assetPath}`);
    }
  }
}

function structuralSignature(html) {
  return [...html.matchAll(/<(\/)?([a-z][\w-]*)\b[^>]*>/gi)]
    .map(match => `${match[1] ? '/' : ''}${match[2].toLowerCase()}`)
    .join('|');
}

function renderRobots(content) {
  if (content.shared.site.originStatus !== 'configured') {
    return '# Generated file. Edit src/content.json and run npm run build.\nUser-agent: *\nAllow: /\n';
  }
  const origin = normalizeSiteOrigin(content.shared.site.origin);
  return `# Generated file. Edit src/content.json and run npm run build.\nUser-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

function renderSitemap(content) {
  if (content.shared.site.originStatus !== 'configured') return null;
  const origin = normalizeSiteOrigin(content.shared.site.origin);
  const englishUrl = `${origin}${outputConfig.en.route}`;
  const serbianUrl = `${origin}${outputConfig.sr.route}`;
  const alternates = `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(englishUrl)}" />\n    <xhtml:link rel="alternate" hreflang="sr-Latn" href="${escapeXml(serbianUrl)}" />\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(englishUrl)}" />`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated file. Edit src/content.json and run npm run build. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n  <url>\n    <loc>${escapeXml(englishUrl)}</loc>\n${alternates}\n  </url>\n  <url>\n    <loc>${escapeXml(serbianUrl)}</loc>\n${alternates}\n  </url>\n</urlset>\n`;
}

function validateCrawlFiles(robots, sitemap, content) {
  if (!robots.includes('User-agent: *') || !robots.includes('Allow: /')) fail('robots.txt must allow public crawling');
  if (content.shared.site.originStatus !== 'configured') {
    if (/^Sitemap:/mi.test(robots) || /https:\/\/example\.com/i.test(robots)) {
      fail('Placeholder robots.txt must not publish a sitemap or example.com URL');
    }
    if (sitemap !== null) fail('Placeholder mode must not generate sitemap.xml content');
    return;
  }
  const origin = normalizeSiteOrigin(content.shared.site.origin);
  const englishUrl = `${origin}${outputConfig.en.route}`;
  const serbianUrl = `${origin}${outputConfig.sr.route}`;
  if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) fail('robots.txt sitemap URL does not match site origin');
  const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  if (JSON.stringify(sitemapLocations) !== JSON.stringify([englishUrl, serbianUrl])) fail('sitemap.xml must contain exactly the EN and SR canonical URLs');
  const expectedAlternates = { en: englishUrl, 'sr-Latn': serbianUrl, 'x-default': englishUrl };
  for (const [hreflang, url] of Object.entries(expectedAlternates)) {
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (sitemap.match(new RegExp(`hreflang="${hreflang}" href="${escapedUrl}"`, 'g')) || []).length;
    if (count !== 2) fail(`sitemap.xml reciprocal ${hreflang} hreflang is incomplete`);
  }
}

const [template, contentRaw, mainJs] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(contentPath, 'utf8'),
  readFile(resolve(rootDir, 'assets/main.js'), 'utf8')
]);
const content = JSON.parse(contentRaw);
if (!content.shared || !content.locales?.en || !content.locales?.sr) fail('Required shared/en/sr content objects are missing');
if (content.locales.en.lang !== 'en' || content.locales.sr.lang !== 'sr-Latn') fail('Locale language tags are invalid');
assertNonEmptyStrings(content.shared, 'shared');
assertNonEmptyStrings(content.locales.en, 'locales.en');
assertNonEmptyStrings(content.locales.sr, 'locales.sr');
assertParity(content.locales.en, content.locales.sr);
for (const [key, value] of Object.entries(content.shared.urls)) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) fail(`Invalid shared URL: ${key}`);
  } catch {
    fail(`Invalid shared URL: ${key}`);
  }
}
if (content.shared.site.originStatus === 'configured') {
  normalizeSiteOrigin(content.shared.site.origin);
} else {
  console.warn(`SEO pre-launch mode active: configure shared.site.origin before launch (current value: ${content.shared.site.origin}).`);
}

const generated = Object.fromEntries(localeOrder.map(locale => [locale, render(template, locale, content)]));
const robots = renderRobots(content);
const sitemap = renderSitemap(content);
await validateRequiredSeoAssets(content);
for (const locale of localeOrder) {
  validateGeneratedHtml(generated[locale], locale, content);
  await validateAssets(generated[locale], outputConfig[locale].path, locale, content);
}
validateCrawlFiles(robots, sitemap, content);
if (structuralSignature(generated.en) !== structuralSignature(generated.sr)) fail('Generated EN/SR DOM structures differ');
if (/translations\.json|localStorage\.getItem\(['"]language|localStorage\.setItem\(['"]language/.test(mainJs)) {
  fail('Production JavaScript still contains runtime localization code');
}

if (checkOnly) {
  for (const locale of localeOrder) {
    const committed = await readFile(outputConfig[locale].path, 'utf8').catch(() => '');
    if (committed !== generated[locale]) fail(`${locale}: committed generated HTML is stale; run npm run build`);
  }
  const committedRobots = await readFile(robotsPath, 'utf8').catch(() => '');
  if (committedRobots !== robots) fail('robots.txt is stale; run npm run build');
  const committedSitemap = await readFile(sitemapPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (content.shared.site.originStatus === 'configured') {
    if (committedSitemap !== sitemap) fail('sitemap.xml is stale; run npm run build');
  } else if (committedSitemap !== null) {
    fail('Placeholder mode must not retain sitemap.xml; run npm run build');
  }
  console.log('Static bilingual output is valid and up to date.');
} else {
  await mkdir(dirname(outputConfig.sr.path), { recursive: true });
  const writes = [
    ...localeOrder.map(locale => writeFile(outputConfig[locale].path, generated[locale])),
    writeFile(robotsPath, robots)
  ];
  if (content.shared.site.originStatus === 'configured') {
    writes.push(writeFile(sitemapPath, sitemap));
  } else {
    writes.push(unlink(sitemapPath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    }));
  }
  await Promise.all(writes);
  console.log(content.shared.site.originStatus === 'configured'
    ? 'Generated index.html, sr/index.html, robots.txt and sitemap.xml.'
    : 'Generated pre-launch index.html, sr/index.html and robots.txt; sitemap.xml omitted.');
}
