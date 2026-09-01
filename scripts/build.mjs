import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(rootDir, 'src/template.html');
const contentPath = resolve(rootDir, 'src/content.json');
const checkOnly = process.argv.includes('--check');
let localeDefinitions = [];
let enabledLocaleDefinitions = [];
let localeOrder = [];
let outputConfig = {};
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

function validateAndConfigureLocales(content) {
  const config = content.localeConfig;
  if (!config || !Array.isArray(config.locales) || !config.locales.length) {
    fail('localeConfig.locales must be a non-empty array');
  }
  if (typeof config.defaultLocale !== 'string' || !config.defaultLocale) {
    fail('localeConfig.defaultLocale is required');
  }

  const requiredFields = ['id', 'htmlLang', 'hreflang', 'ogLocale', 'route', 'output', 'code', 'label', 'contentStatus'];
  const ids = new Set();
  const routes = new Set();
  const outputs = new Set();
  const hreflangs = new Set();
  localeDefinitions = config.locales.map((definition, index) => {
    if (!definition || typeof definition !== 'object') fail(`Invalid locale definition at localeConfig.locales.${index}`);
    for (const field of requiredFields) {
      if (typeof definition[field] !== 'string' || !definition[field].trim()) {
        fail(`Missing locale configuration string: localeConfig.locales.${index}.${field}`);
      }
    }
    if (!/^[a-z]{2}(?:-[a-z0-9]+)*$/i.test(definition.id)) fail(`Invalid locale ID: ${definition.id}`);
    if (typeof definition.enabled !== 'boolean') fail(`Locale ${definition.id} enabled must be boolean`);
    if (!['approved', 'draft'].includes(definition.contentStatus)) {
      fail(`Locale ${definition.id} contentStatus must be "approved" or "draft"`);
    }
    if (definition.route !== '/' && !/^\/[a-z0-9-]+\/$/i.test(definition.route)) {
      fail(`Locale ${definition.id} route must be / or a single deterministic directory route`);
    }
    const expectedOutput = definition.route === '/' ? 'index.html' : `${definition.route.slice(1)}index.html`;
    if (definition.output !== expectedOutput) {
      fail(`Locale ${definition.id} output must be ${expectedOutput} for route ${definition.route}`);
    }
    if (ids.has(definition.id)) fail(`Duplicate locale ID: ${definition.id}`);
    if (routes.has(definition.route)) fail(`Duplicate locale route: ${definition.route}`);
    if (outputs.has(definition.output)) fail(`Duplicate locale output: ${definition.output}`);
    if (hreflangs.has(definition.hreflang)) fail(`Duplicate locale hreflang: ${definition.hreflang}`);
    ids.add(definition.id);
    routes.add(definition.route);
    outputs.add(definition.output);
    hreflangs.add(definition.hreflang);
    return { ...definition };
  });

  const defaultDefinition = localeDefinitions.find(definition => definition.id === config.defaultLocale);
  if (!defaultDefinition?.enabled) fail('localeConfig.defaultLocale must reference an enabled locale');
  if (config.defaultLocale !== 'en') fail('English must remain the x-default locale');

  enabledLocaleDefinitions = localeDefinitions.filter(definition => definition.enabled);
  if (!enabledLocaleDefinitions.length) fail('At least one locale must be enabled');
  for (const definition of enabledLocaleDefinitions) {
    if (definition.contentStatus !== 'approved') {
      fail(`Enabled locale ${definition.id} must have contentStatus "approved"`);
    }
    if (!content.locales?.[definition.id]) {
      fail(`Enabled locale ${definition.id} is missing its complete content object`);
    }
    if (content.locales[definition.id].lang !== definition.htmlLang) {
      fail(`Enabled locale ${definition.id} content lang does not match localeConfig`);
    }
    if (content.locales[definition.id].meta?.ogLocale !== definition.ogLocale) {
      fail(`Enabled locale ${definition.id} OG locale does not match localeConfig`);
    }
  }
  for (const locale of Object.keys(content.locales || {})) {
    if (!ids.has(locale)) fail(`Locale content ${locale} has no localeConfig definition`);
  }

  localeOrder = enabledLocaleDefinitions.map(definition => definition.id);
  outputConfig = Object.fromEntries(localeDefinitions.map(definition => {
    const depth = definition.output.split('/').length - 1;
    const rootPrefix = '../'.repeat(depth);
    return [definition.id, {
      path: resolve(rootDir, definition.output),
      assetPrefix: `${rootPrefix}assets/`,
      rootPrefix,
      route: definition.route,
      output: definition.output
    }];
  }));
}

const getLocaleDefinition = locale => {
  const definition = localeDefinitions.find(item => item.id === locale);
  if (!definition) fail(`Unknown locale: ${locale}`);
  return definition;
};

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
  const localeUrls = Object.fromEntries(enabledLocaleDefinitions.map(definition => [
    definition.id,
    `${origin}${definition.route}`
  ]));
  const defaultUrl = localeUrls[content.localeConfig.defaultLocale];
  const ogImageUrl = `${origin}/${content.shared.site.ogImagePath.replace(/^\/+/, '')}`;
  const personId = `${defaultUrl}#person`;
  const localeMeta = content.locales[locale].meta;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: content.shared.name,
        url: defaultUrl,
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
  return { configured, canonical, defaultUrl, localeUrls, ogImageUrl, jsonLd };
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

function localeHref(currentLocale, targetLocale) {
  if (currentLocale === targetLocale) return './';
  const current = outputConfig[currentLocale];
  const target = outputConfig[targetLocale];
  if (target.route === '/') return current.route === '/' ? './' : '../';
  if (current.route === '/') return target.route.slice(1);
  return `../${target.route.slice(1)}`;
}

function renderLocaleMenu(locale, context, variant) {
  const current = getLocaleDefinition(locale);
  const menuId = `language-menu-${variant}`;
  const triggerLabel = `${context.ui.languageMenuLabel}. ${context.ui.languageCurrent}: ${current.label}`;
  const options = localeDefinitions.map(definition => {
    const isCurrent = definition.id === locale;
    if (!definition.enabled) {
      return `        <span class="language-menu-option is-disabled" role="menuitem" aria-disabled="true" tabindex="-1" lang="${definition.htmlLang}" data-locale="${definition.id}">
          <span>${escapeHtml(definition.label)}</span>
          <span class="language-menu-option-status">${escapeHtml(context.ui.languageUnavailable)}</span>
        </span>`;
    }
    return `        <a class="language-menu-option${isCurrent ? ' is-current' : ''}" role="menuitem" href="${localeHref(locale, definition.id)}" lang="${definition.htmlLang}" hreflang="${definition.hreflang}"${isCurrent ? ' aria-current="page"' : ''}>
          <span>${escapeHtml(definition.label)}</span>
          <span class="language-menu-option-code" aria-hidden="true">${escapeHtml(definition.code)}</span>
        </a>`;
  }).join('\n');

  return `<div class="language-menu language-menu--${variant}" data-language-menu>
      <button class="language-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}" aria-label="${escapeHtml(triggerLabel)}">
        <span aria-hidden="true">${escapeHtml(current.code)}</span>
        <svg viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m1 1.5 5 5 5-5"/></svg>
      </button>
      <div class="language-menu-popover" id="${menuId}" role="menu" aria-label="${escapeHtml(context.ui.languageMenuLabel)}" hidden>
${options}
      </div>
    </div>`;
}

function renderSeoHeadAlternates(seo, content) {
  if (!seo.configured) return '';
  const links = enabledLocaleDefinitions.map(definition => (
    `<link rel="alternate" hreflang="${escapeHtml(definition.hreflang)}" href="${escapeHtml(seo.localeUrls[definition.id])}" />`
  ));
  links.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(seo.defaultUrl)}" />`);
  return links.join('\n  ');
}

function renderOgAlternateLocales(locale) {
  return enabledLocaleDefinitions
    .filter(definition => definition.id !== locale)
    .map(definition => `<meta property="og:locale:alternate" content="${escapeHtml(definition.ogLocale)}" />`)
    .join('\n  ');
}

function testimonialInitials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const selected = parts.length > 1 ? [parts[0], parts.at(-1)] : parts;
  return selected.map(part => Array.from(part)[0] || '').join('').toLocaleUpperCase().slice(0, 2);
}

function renderTestimonials(localeContent, locale) {
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
    if (entry.image !== undefined) {
      if (typeof entry.image !== 'string' || !/^assets\/[a-z0-9][a-z0-9._/-]*$/i.test(entry.image) || entry.image.includes('..')) {
        fail(`Invalid optional testimonial image at testimonials.entries.${index}`);
      }
    }
    if (entry.isDemo !== undefined && typeof entry.isDemo !== 'boolean') {
      fail(`Invalid testimonial isDemo marker at testimonials.entries.${index}`);
    }
  });

  const slides = entries.map((entry, index) => {
    const personDetails = [entry.role, entry.company].filter(Boolean).map(escapeHtml).join(' · ');
    const detailMarkup = personDetails ? `\n                <p class="client-feedback-person-role">${personDetails}</p>` : '';
    const serviceMarkup = entry.service ? `\n              <p class="client-feedback-service">${escapeHtml(entry.service)}</p>` : '';
    const avatarMarkup = entry.image
      ? `<img class="client-feedback-avatar" src="${escapeHtml(`${outputConfig[locale].rootPrefix}${entry.image}`)}" alt="" width="64" height="64" loading="lazy" decoding="async" aria-hidden="true" />`
      : `<span class="client-feedback-avatar client-feedback-avatar-fallback" aria-hidden="true">${escapeHtml(testimonialInitials(entry.name))}</span>`;
    return `          <article class="client-feedback-slide" data-testimonial-slide data-testimonial-id="${escapeHtml(entry.id)}"${index ? ' hidden' : ''}>
            <blockquote class="client-feedback-quote">
              <p>${escapeHtml(entry.quote)}</p>
            </blockquote>
            <footer class="client-feedback-person">
              <div class="client-feedback-person-identity">
                ${avatarMarkup}
                <div class="client-feedback-person-copy">
                  <p class="client-feedback-person-name">${escapeHtml(entry.name)}</p>${detailMarkup}
                </div>
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
  html = html.replace('{{seoHeadAlternates}}', renderSeoHeadAlternates(seo, content));
  html = html.replace('{{ogAlternateLocales}}', renderOgAlternateLocales(locale));
  html = html.replace('{{localeMenu:desktop}}', renderLocaleMenu(locale, context, 'desktop'));
  html = html.replace('{{localeMenu:mobile}}', renderLocaleMenu(locale, context, 'mobile'));
  html = html.replace('{{testimonialsSection}}', renderTestimonials(localeContent, locale));
  html = html.replaceAll('{{contactFormEndpoint}}', escapeHtml(getContactFormEndpoint(content)));
  html = html.replace(/<([a-z][\w-]*)([^>]*?)\sdata-content="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_, tag, before, key, after) => `<${tag}${before}${after}>${escapeHtml(getPath(context, key))}</${tag}>`);
  html = applyAttributeDirective(html, 'aria-label', 'aria-label', context);
  html = applyAttributeDirective(html, 'alt', 'alt', context);
  html = applyAttributeDirective(html, 'content', 'content', context);
  html = html.replace(/\{\{json:([^}]+)\}\}/g, (_, key) => JSON.stringify(getValue(context, key)).replaceAll('<', '\\u003c'));
  html = html.replace(/\{\{(text|attr):([^}]+)\}\}/g, (_, __, key) => escapeHtml(getPath(context, key)));
  html = html.replaceAll('{{assetPrefix}}', outputConfig[locale].assetPrefix);
  html = html.replaceAll('{{rootPrefix}}', outputConfig[locale].rootPrefix);
  html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Generated file. Do not edit directly. Edit src/template.html or src/content.json and run npm run build. -->');
  html = html.replace(/[ \t]+$/gm, '');
  return html;
}

function validateGeneratedHtml(html, locale, content) {
  const localeDefinition = getLocaleDefinition(locale);
  if (/\{\{[^}]+\}\}/.test(html)) fail(`${locale}: unresolved template token`);
  if (/\bdata-(?:i18n|content)(?:-[\w-]+)?=/.test(html)) fail(`${locale}: unresolved content directive`);
  if (/translations\.json/.test(html)) fail(`${locale}: generated HTML references translations.json`);
  if (!new RegExp(`<html lang="${localeDefinition.htmlLang}"`).test(html)) fail(`${locale}: incorrect html lang`);
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
  if (metaContent('property', 'og:locale') !== localeDefinition.ogLocale) {
    fail(`${locale}: Open Graph locale does not match localeConfig`);
  }
  const ogAlternateLocales = [...html.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map(match => match[1]);
  const expectedOgAlternates = enabledLocaleDefinitions
    .filter(definition => definition.id !== locale)
    .map(definition => definition.ogLocale);
  if (JSON.stringify(ogAlternateLocales) !== JSON.stringify(expectedOgAlternates)) {
    fail(`${locale}: Open Graph alternate locales do not match enabled locales`);
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
    const expectedAlternates = Object.fromEntries(enabledLocaleDefinitions.map(definition => [
      definition.hreflang,
      seo.localeUrls[definition.id]
    ]));
    expectedAlternates['x-default'] = seo.defaultUrl;
    if (JSON.stringify(alternates) !== JSON.stringify(expectedAlternates)) {
      fail(`${locale}: enabled-locale hreflang targets are incomplete or inconsistent`);
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
    if (person.url !== seo.defaultUrl || website.url !== seo.canonical || website.inLanguage !== content.locales[locale].meta.schemaLanguage) {
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
    || !/<link rel="icon" href="[^"]+favicon-16\.png" type="image\/png" sizes="16x16"/.test(html)
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
  const languageMenuOptions = [...html.matchAll(/<a class="language-menu-option[^>]*hreflang="([^"]+)"/g)].map(match => match[1]);
  const expectedMenuLanguages = enabledLocaleDefinitions.map(definition => definition.hreflang);
  if (languageMenuOptions.length !== expectedMenuLanguages.length * 2
    || JSON.stringify(languageMenuOptions.slice(0, expectedMenuLanguages.length)) !== JSON.stringify(expectedMenuLanguages)
    || JSON.stringify(languageMenuOptions.slice(expectedMenuLanguages.length)) !== JSON.stringify(expectedMenuLanguages)) {
    fail(`${locale}: desktop/mobile language menus do not contain exactly the enabled locales`);
  }
  for (const definition of localeDefinitions.filter(item => !item.enabled)) {
    if (languageMenuOptions.includes(definition.hreflang)) fail(`${locale}: disabled locale ${definition.id} is publicly linked`);
    const disabledPattern = new RegExp(`<span class="language-menu-option is-disabled"[^>]*role="menuitem"[^>]*aria-disabled="true"[^>]*data-locale="${definition.id}"`, 'g');
    const disabledOptions = html.match(disabledPattern) || [];
    if (disabledOptions.length !== 2) fail(`${locale}: disabled locale ${definition.id} must appear as unavailable in both language menus`);
  }
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
    resolve(rootDir, 'assets/favicon-16.png'),
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
  const localeUrls = Object.fromEntries(enabledLocaleDefinitions.map(definition => [
    definition.id,
    `${origin}${definition.route}`
  ]));
  const defaultUrl = localeUrls[content.localeConfig.defaultLocale];
  const alternates = [
    ...enabledLocaleDefinitions.map(definition => (
      `    <xhtml:link rel="alternate" hreflang="${escapeXml(definition.hreflang)}" href="${escapeXml(localeUrls[definition.id])}" />`
    )),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultUrl)}" />`
  ].join('\n');
  const entries = enabledLocaleDefinitions.map(definition => (
    `  <url>\n    <loc>${escapeXml(localeUrls[definition.id])}</loc>\n${alternates}\n  </url>`
  )).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated file. Edit src/content.json and run npm run build. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`;
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
  if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) fail('robots.txt sitemap URL does not match site origin');
  const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const localeUrls = Object.fromEntries(enabledLocaleDefinitions.map(definition => [
    definition.id,
    `${origin}${definition.route}`
  ]));
  const expectedLocations = enabledLocaleDefinitions.map(definition => localeUrls[definition.id]);
  if (JSON.stringify(sitemapLocations) !== JSON.stringify(expectedLocations)) {
    fail('sitemap.xml must contain exactly the enabled locale canonical URLs');
  }
  const expectedAlternates = Object.fromEntries(enabledLocaleDefinitions.map(definition => [
    definition.hreflang,
    localeUrls[definition.id]
  ]));
  expectedAlternates['x-default'] = localeUrls[content.localeConfig.defaultLocale];
  for (const [hreflang, url] of Object.entries(expectedAlternates)) {
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const count = (sitemap.match(new RegExp(`hreflang="${hreflang}" href="${escapedUrl}"`, 'g')) || []).length;
    if (count !== enabledLocaleDefinitions.length) fail(`sitemap.xml reciprocal ${hreflang} hreflang is incomplete`);
  }
}

const [template, contentRaw, mainJs] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(contentPath, 'utf8'),
  readFile(resolve(rootDir, 'assets/main.js'), 'utf8')
]);
const content = JSON.parse(contentRaw);
if (!content.shared || !content.locales) fail('Required shared and locale content objects are missing');
validateAndConfigureLocales(content);
assertNonEmptyStrings(content.localeConfig, 'localeConfig');
assertNonEmptyStrings(content.shared, 'shared');
for (const locale of localeOrder) assertNonEmptyStrings(content.locales[locale], `locales.${locale}`);
const defaultLocale = content.localeConfig.defaultLocale;
for (const locale of localeOrder.filter(item => item !== defaultLocale)) {
  assertParity(content.locales[defaultLocale], content.locales[locale], `locales.${defaultLocale}/${locale}`);
}
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
const defaultSignature = structuralSignature(generated[defaultLocale]);
for (const locale of localeOrder.filter(item => item !== defaultLocale)) {
  if (structuralSignature(generated[locale]) !== defaultSignature) {
    fail(`Generated ${defaultLocale.toUpperCase()}/${locale.toUpperCase()} DOM structures differ`);
  }
}
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
  for (const definition of localeDefinitions.filter(item => !item.enabled)) {
    const disabledOutput = await readFile(outputConfig[definition.id].path, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (disabledOutput !== null) fail(`Disabled locale ${definition.id} must not have a public generated route`);
  }
  console.log(`Static output is valid and up to date for enabled locales: ${localeOrder.join(', ')}.`);
} else {
  await Promise.all(localeOrder.map(locale => mkdir(dirname(outputConfig[locale].path), { recursive: true })));
  const writes = [
    ...localeOrder.map(locale => writeFile(outputConfig[locale].path, generated[locale])),
    writeFile(robotsPath, robots),
    ...localeDefinitions.filter(item => !item.enabled).map(definition => (
      unlink(outputConfig[definition.id].path).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      })
    ))
  ];
  if (content.shared.site.originStatus === 'configured') {
    writes.push(writeFile(sitemapPath, sitemap));
  } else {
    writes.push(unlink(sitemapPath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    }));
  }
  await Promise.all(writes);
  const generatedRoutes = enabledLocaleDefinitions.map(definition => definition.route).join(', ');
  console.log(content.shared.site.originStatus === 'configured'
    ? `Generated enabled locale routes (${generatedRoutes}), robots.txt and sitemap.xml.`
    : `Generated pre-launch enabled locale routes (${generatedRoutes}) and robots.txt; sitemap.xml omitted.`);
}
