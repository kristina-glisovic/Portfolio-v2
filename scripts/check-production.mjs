import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = message => {
  console.error(`Production readiness check failed: ${message}`);
  process.exit(1);
};

const buildCheck = spawnSync(process.execPath, [resolve(rootDir, 'scripts/build.mjs'), '--check'], {
  cwd: rootDir,
  encoding: 'utf8'
});
process.stdout.write(buildCheck.stdout || '');
process.stderr.write(buildCheck.stderr || '');
if (buildCheck.status !== 0) fail('the standard static build check did not pass');

const content = JSON.parse(await readFile(resolve(rootDir, 'src/content.json'), 'utf8'));
const localeConfig = content.localeConfig;
if (!localeConfig || !Array.isArray(localeConfig.locales) || !localeConfig.locales.length) {
  fail('localeConfig.locales is missing');
}
const localeIds = new Set();
const localeRoutes = new Set();
const localeOutputs = new Set();
for (const locale of localeConfig.locales) {
  if (!locale?.id || typeof locale.enabled !== 'boolean' || !locale.route || !locale.output) {
    fail('localeConfig contains an invalid locale definition');
  }
  if (localeIds.has(locale.id) || localeRoutes.has(locale.route) || localeOutputs.has(locale.output)) {
    fail('localeConfig locale IDs, routes and outputs must be unique');
  }
  localeIds.add(locale.id);
  localeRoutes.add(locale.route);
  localeOutputs.add(locale.output);
}
const enabledLocales = localeConfig.locales.filter(locale => locale.enabled);
const disabledLocales = localeConfig.locales.filter(locale => !locale.enabled);
if (!enabledLocales.some(locale => locale.id === localeConfig.defaultLocale)) {
  fail('localeConfig.defaultLocale must be enabled');
}
for (const locale of enabledLocales) {
  if (locale.contentStatus !== 'approved') {
    fail(`enabled locale ${locale.id} is not marked approved`);
  }
  if (!content.locales?.[locale.id]) {
    fail(`enabled locale ${locale.id} is missing required content`);
  }
  if (content.locales[locale.id].lang !== locale.htmlLang) {
    fail(`enabled locale ${locale.id} has an invalid HTML language tag`);
  }
}
for (const locale of disabledLocales) {
  const disabledOutput = await readFile(resolve(rootDir, locale.output), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (disabledOutput !== null) fail(`disabled locale ${locale.id} has a public generated route`);
}

const demoTestimonials = enabledLocales.flatMap(({ id: locale }) => (
  (content.locales[locale]?.testimonials?.entries || [])
    .filter(entry => entry?.isDemo === true)
    .map(entry => `${locale}: ${entry.id}`)
));
if (demoTestimonials.length) {
  fail(`demo testimonials are present (${demoTestimonials.join(', ')}); remove all entries marked isDemo before production launch`);
}
const contactFormConfig = content.shared?.contactForm;
if (contactFormConfig?.endpointStatus !== 'configured') {
  fail('shared.contactForm.endpointStatus is not "configured"; the inquiry form cannot launch without a real HTTPS endpoint');
}
let contactEndpoint;
try {
  contactEndpoint = new URL(contactFormConfig.endpoint);
} catch {
  fail('shared.contactForm.endpoint is not a valid absolute URL');
}
if (contactEndpoint.protocol !== 'https:') fail('the contact form endpoint must use HTTPS');
if (contactEndpoint.hostname === 'example.com' || contactEndpoint.hostname.endsWith('.example.com')) {
  fail('example.com cannot be used as the contact form endpoint');
}
if (content.shared?.site?.originStatus !== 'configured') {
  fail('shared.site.originStatus is not "configured"; placeholder mode is intentionally not launch-ready');
}

let originUrl;
try {
  originUrl = new URL(content.shared.site.origin);
} catch {
  fail('shared.site.origin is not a valid absolute URL');
}
if (originUrl.protocol !== 'https:') fail('the production origin must use HTTPS');
if (originUrl.pathname !== '/' || originUrl.search || originUrl.hash) fail('the production origin must not contain a path, query, or hash');
if (originUrl.hostname === 'example.com' || originUrl.hostname.endsWith('.example.com')) fail('example.com cannot be used as the production origin');
const origin = originUrl.origin;

const routes = Object.fromEntries(enabledLocales.map(locale => [locale.id, {
  file: locale.output,
  url: `${origin}${locale.route}`,
  language: locale.htmlLang,
  hreflang: locale.hreflang
}]));
const defaultRoute = routes[localeConfig.defaultLocale];
const pages = Object.fromEntries(await Promise.all(Object.entries(routes).map(async ([locale, route]) => [
  locale,
  await readFile(resolve(rootDir, route.file), 'utf8')
])));
const [mainJs, template] = await Promise.all([
  readFile(resolve(rootDir, 'assets/main.js'), 'utf8'),
  readFile(resolve(rootDir, 'src/template.html'), 'utf8')
]);
const robots = await readFile(resolve(rootDir, 'robots.txt'), 'utf8');
const sitemap = await readFile(resolve(rootDir, 'sitemap.xml'), 'utf8').catch(() => fail('sitemap.xml is missing'));
const notFound = await readFile(resolve(rootDir, '404.html'), 'utf8').catch(() => fail('404.html is missing'));

const meta = (html, attribute, name) => html.match(new RegExp(`<meta ${attribute}="${name.replaceAll(':', '\\:')}" content="([^"]+)"`))?.[1];
for (const [locale, route] of Object.entries(routes)) {
  const html = pages[locale];
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
  if (/\{\{[^}]+\}\}|\bdata-(?:i18n|content)(?:-[\w-]+)?=/.test(html)) fail(`${route.file} contains unresolved source tokens`);
  if (/https:\/\/example\.com/i.test(html)) fail(`${route.file} contains example.com`);
  if (new RegExp(`<html lang="${route.language}"`).test(html) === false) fail(`${route.file} has the wrong language tag`);

  const canonicals = [...head.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(match => match[1]);
  if (canonicals.length !== 1 || canonicals[0] !== route.url) fail(`${route.file} does not have exactly one correct self-canonical`);
  const alternates = Object.fromEntries([...head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(match => [match[1], match[2]]));
  const expectedAlternates = Object.fromEntries(enabledLocales.map(locale => [locale.hreflang, routes[locale.id].url]));
  expectedAlternates['x-default'] = defaultRoute.url;
  if (JSON.stringify(alternates) !== JSON.stringify(expectedAlternates)) {
    fail(`${route.file} does not contain the complete enabled-locale reciprocal hreflang set`);
  }

  const ogUrl = meta(html, 'property', 'og:url');
  const ogImage = meta(html, 'property', 'og:image');
  const twitterImage = meta(html, 'name', 'twitter:image');
  if (ogUrl !== route.url) fail(`${route.file} og:url does not match its canonical`);
  for (const [label, value] of [['Open Graph image', ogImage], ['Twitter image', twitterImage]]) {
    let url;
    try { url = new URL(value); } catch { fail(`${route.file} ${label} is not an absolute URL`); }
    if (url.origin !== origin) fail(`${route.file} ${label} does not use the production origin`);
  }

  const jsonLdBlocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (jsonLdBlocks.length !== 1) fail(`${route.file} must contain exactly one JSON-LD graph`);
  let jsonLd;
  try { jsonLd = JSON.parse(jsonLdBlocks[0][1]); } catch { fail(`${route.file} JSON-LD does not parse`); }
  const graph = jsonLd?.['@graph'];
  const person = graph?.find(item => item['@type'] === 'Person');
  const website = graph?.find(item => item['@type'] === 'WebSite');
  if (!person || !website) fail(`${route.file} JSON-LD must contain Person and WebSite entities`);
  if (person.url !== defaultRoute.url || website.url !== route.url || website.inLanguage !== content.locales[locale].meta.schemaLanguage) {
    fail(`${route.file} JSON-LD URLs or language do not match the production routes`);
  }
  if ([person['@id'], website['@id']].some(value => typeof value !== 'string' || !value.startsWith(origin))) {
    fail(`${route.file} JSON-LD IDs do not use the production origin`);
  }

  if (/href="#"/.test(html)) fail(`${route.file} contains a placeholder href`);
  if (/handleFormSubmit|Message Sent!|Client Name|Company Name/i.test(html)) fail(`${route.file} contains placeholder or simulated form/proof content`);
  const contactForm = html.match(/<form\b[^>]*\bdata-contact-form[^>]*>/i)?.[0];
  if (!contactForm || !contactForm.includes(`data-contact-endpoint="${contactEndpoint.href}"`)) {
    fail(`${route.file} does not contain the configured contact form endpoint`);
  }
  if (/<section\b[^>]*\bid="(?:skills|certificates)"/i.test(html)) {
    fail(`${route.file} contains a removed legacy proof section`);
  }
}

if (/translations\.json|\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(mainJs)) {
  fail('production JavaScript contains obsolete localization or persistent browser-storage logic');
}
if (/googletagmanager|google-analytics|\bgtag\s*\(|\bfbq\s*\(|tracking pixel/i.test(`${template}\n${mainJs}`)) {
  fail('analytics or tracking code is present but has not been approved for launch');
}

if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) fail('robots.txt does not reference the production sitemap');
if (/example\.com/i.test(robots) || /example\.com/i.test(sitemap)) fail('crawl files contain example.com');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const expectedSitemapUrls = enabledLocales.map(locale => routes[locale.id].url);
if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedSitemapUrls)) {
  fail('sitemap.xml does not contain exactly the enabled locale routes');
}
for (const locale of enabledLocales) {
  const expected = `hreflang="${locale.hreflang}" href="${routes[locale.id].url}"`;
  if ((sitemap.match(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== enabledLocales.length) {
    fail(`sitemap.xml reciprocal ${locale.hreflang} hreflang is incomplete`);
  }
}
const xDefault = `hreflang="x-default" href="${defaultRoute.url}"`;
if ((sitemap.match(new RegExp(xDefault.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== enabledLocales.length) {
  fail('sitemap.xml x-default hreflang is incomplete');
}

if (!/<meta name="robots" content="noindex,follow"/.test(notFound)
  || (notFound.match(/<main\b/g) || []).length !== 1
  || (notFound.match(/<h1\b/g) || []).length !== 1
  || !/<a[^>]+href="\/"/.test(notFound)) {
  fail('404.html is missing its noindex directive, main heading, or homepage link');
}
if (/<script\b/i.test(notFound)) fail('404.html must remain functional without JavaScript');

const requiredAssets = [
  'assets/favicon.svg',
  'assets/favicon-32.png',
  'assets/favicon-16.png',
  'assets/apple-touch-icon.png',
  'assets/og-portfolio.png',
  'favicon.ico'
];
for (const file of requiredAssets) {
  await access(resolve(rootDir, file)).catch(() => fail(`required asset is missing: ${file}`));
}

console.log(`Production readiness check passed for ${origin}.`);
