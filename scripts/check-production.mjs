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

const routes = {
  en: { file: 'index.html', url: `${origin}/`, language: 'en' },
  sr: { file: 'sr/index.html', url: `${origin}/sr/`, language: 'sr-Latn' }
};
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
  if (alternates.en !== routes.en.url || alternates['sr-Latn'] !== routes.sr.url || alternates['x-default'] !== routes.en.url) {
    fail(`${route.file} does not contain the complete reciprocal hreflang set`);
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
  if (person.url !== routes.en.url || website.url !== route.url) fail(`${route.file} JSON-LD URLs do not match the production routes`);
  if ([person['@id'], website['@id']].some(value => typeof value !== 'string' || !value.startsWith(origin))) {
    fail(`${route.file} JSON-LD IDs do not use the production origin`);
  }

  if (/href="#"/.test(html)) fail(`${route.file} contains a placeholder href`);
  if (/<form\b|handleFormSubmit|Message Sent!|Client Name|Company Name/i.test(html)) fail(`${route.file} contains placeholder or simulated form/proof content`);
  if (/<section\b[^>]*\bid="(?:skills|certificates|testimonials)"/i.test(html)) {
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
if (JSON.stringify(sitemapUrls) !== JSON.stringify([routes.en.url, routes.sr.url])) fail('sitemap.xml does not contain exactly the EN and SR routes');

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
  'assets/apple-touch-icon.png',
  'assets/og-portfolio.png',
  'favicon.ico'
];
for (const file of requiredAssets) {
  await access(resolve(rootDir, file)).catch(() => fail(`required asset is missing: ${file}`));
}

console.log(`Production readiness check passed for ${origin}.`);
