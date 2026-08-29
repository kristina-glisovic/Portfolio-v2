import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(rootDir, 'src/template.html');
const contentPath = resolve(rootDir, 'src/content.json');
const checkOnly = process.argv.includes('--check');
const localeOrder = ['en', 'sr'];
const outputConfig = {
  en: { path: resolve(rootDir, 'index.html'), assetPrefix: 'assets/' },
  sr: { path: resolve(rootDir, 'sr/index.html'), assetPrefix: '../assets/' }
};

const fail = message => {
  throw new Error(message);
};

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function getPath(context, path) {
  const value = path.split('.').reduce((current, part) => current?.[part], context);
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Missing required string: ${path}`);
  }
  return value;
}

function assertNonEmptyStrings(value, path) {
  if (typeof value === 'string') {
    if (!value.trim()) fail(`Empty string at ${path}`);
    if (/[<>]/.test(value)) fail(`Unrestricted HTML is not allowed in content: ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) fail(`Empty array at ${path}`);
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

function render(template, locale, content) {
  const localeContent = content.locales[locale];
  const context = { ...localeContent, shared: content.shared };
  let html = template;

  html = html.replace(/<([a-z][\w-]*)([^>]*?)\sdata-content="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_, tag, before, key, after) => `<${tag}${before}${after}>${escapeHtml(getPath(context, key))}</${tag}>`);
  html = applyAttributeDirective(html, 'aria-label', 'aria-label', context);
  html = applyAttributeDirective(html, 'alt', 'alt', context);
  html = applyAttributeDirective(html, 'content', 'content', context);
  html = renderLocaleLinks(html, locale, context);
  html = html.replace(/\{\{(text|attr):([^}]+)\}\}/g, (_, __, key) => escapeHtml(getPath(context, key)));
  html = html.replaceAll('{{assetPrefix}}', outputConfig[locale].assetPrefix);
  html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<!-- Generated file. Do not edit directly. Edit src/template.html or src/content.json and run npm run build. -->');
  html = html.replace(/[ \t]+$/gm, '');
  return html;
}

function validateGeneratedHtml(html, locale) {
  if (/\{\{[^}]+\}\}/.test(html)) fail(`${locale}: unresolved template token`);
  if (/\bdata-(?:i18n|content)(?:-[\w-]+)?=/.test(html)) fail(`${locale}: unresolved content directive`);
  if (/translations\.json/.test(html)) fail(`${locale}: generated HTML references translations.json`);
  if (!new RegExp(`<html lang="${locale === 'en' ? 'en' : 'sr-Latn'}"`).test(html)) fail(`${locale}: incorrect html lang`);
  if (!/<title>\s*[^<]+\s*<\/title>/.test(html)) fail(`${locale}: missing title`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`${locale}: missing meta description`);

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

async function validateAssets(html, outputPath, locale) {
  const references = [];
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) references.push(match[1]);
  for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) {
    references.push(...match[1].split(',').map(item => item.trim().split(/\s+/)[0]));
  }
  for (const reference of references) {
    if (!reference.includes('assets/')) continue;
    const clean = reference.split('?')[0].split('#')[0];
    const assetPath = resolve(dirname(outputPath), clean);
    try {
      await access(assetPath);
    } catch {
      fail(`${locale}: missing asset ${reference}`);
    }
  }
}

function structuralSignature(html) {
  return [...html.matchAll(/<(\/)?([a-z][\w-]*)\b[^>]*>/gi)]
    .map(match => `${match[1] ? '/' : ''}${match[2].toLowerCase()}`)
    .join('|');
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

const generated = Object.fromEntries(localeOrder.map(locale => [locale, render(template, locale, content)]));
for (const locale of localeOrder) {
  validateGeneratedHtml(generated[locale], locale);
  await validateAssets(generated[locale], outputConfig[locale].path, locale);
}
if (structuralSignature(generated.en) !== structuralSignature(generated.sr)) fail('Generated EN/SR DOM structures differ');
if (/translations\.json|localStorage\.getItem\(['"]language|localStorage\.setItem\(['"]language/.test(mainJs)) {
  fail('Production JavaScript still contains runtime localization code');
}

if (checkOnly) {
  for (const locale of localeOrder) {
    const committed = await readFile(outputConfig[locale].path, 'utf8').catch(() => '');
    if (committed !== generated[locale]) fail(`${locale}: committed generated HTML is stale; run npm run build`);
  }
  console.log('Static bilingual output is valid and up to date.');
} else {
  await mkdir(dirname(outputConfig.sr.path), { recursive: true });
  await Promise.all(localeOrder.map(locale => writeFile(outputConfig[locale].path, generated[locale])));
  console.log('Generated index.html and sr/index.html.');
}
