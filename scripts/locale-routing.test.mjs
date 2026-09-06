import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../src/content.json' with { type: 'json' };
import worker, { createLocaleWorker } from '../worker/index.js';

async function request(path = '/', options = {}, handler = worker) {
  const { country, cookie, agent, local, method = 'GET', cf } = options;
  const headers = new Headers();
  if (country) headers.set('CF-IPCountry', country);
  if (cookie) headers.set('Cookie', `portfolio_locale=${cookie}`);
  if (agent) headers.set('User-Agent', agent);
  const req = new Request(`https://${local ? 'localhost' : 'portfolio.test'}${path}`, { headers, method });
  if (cf) Object.defineProperty(req, 'cf', { value: cf });
  return handler.fetch(req, { ASSETS: { fetch: incoming => {
    assert.equal(incoming, req);
    return new Response('static asset', { status: 200 });
  } } });
}

test('country mapping, disabled DE, missing and invalid country', async () => {
  for (const [country, status, location] of [['RS', 302, '/sr/'], ['DE', 200], ['US', 200], [undefined, 200], ['invalid', 200]]) {
    const response = await request('/', { country });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    if (location) assert.equal(new URL(response.headers.get('Location')).pathname, location);
  }
});

test('explicit paths, assets and unsafe methods bypass routing', async () => {
  for (const path of ['/sr/', '/de/', '/assets/style.css', '/robots.txt', '/favicon.ico', '/unknown']) {
    assert.equal((await request(path, { country: 'RS', cookie: 'en' })).status, 200);
  }
  assert.equal((await request('/', { country: 'RS', method: 'POST' })).status, 200);
  assert.equal((await request('/', { country: 'RS', method: 'HEAD' })).status, 302);
});

test('manual selection sets exact cookie, retains query and clears intent without looping', async () => {
  for (const [locale, path] of [['en', '/'], ['sr', '/sr/']]) {
    const response = await request(`${path}?campaign=one&locale=${locale}&tag=two`, { country: 'RS' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), `https://portfolio.test${path}?campaign=one&tag=two`);
    assert.equal(response.headers.get('Set-Cookie'), `portfolio_locale=${locale}; Max-Age=15552000; Path=/; Secure; HttpOnly; SameSite=Lax`);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await request(path, { country: 'RS', cookie: locale })).status, 200);
  }
});

test('saved preference wins over country; invalid/disabled choices never set cookies', async () => {
  assert.equal((await request('/', { country: 'RS', cookie: 'en' })).status, 200);
  assert.equal((await request('/', { country: 'US', cookie: 'sr' })).headers.get('Location'), 'https://portfolio.test/sr/');
  assert.equal((await request('/', { country: 'US', cookie: 'de' })).status, 200);
  for (const path of ['/?locale=de', '/?locale=https://evil.test', '/?locale=en&locale=sr', '/sr/?locale=en']) {
    const response = await request(path);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(new URL(response.headers.get('Location')).origin, 'https://portfolio.test');
  }
});

test('crawler/local bypass; Cloudflare country is preferred; query preserved', async () => {
  for (const options of [{ agent: 'Googlebot' }, { agent: 'bingbot' }, { local: true }, { cf: { botManagement: { verifiedBot: true } } }]) {
    assert.equal((await request('/', { country: 'RS', cookie: 'sr', ...options })).status, 200);
  }
  assert.equal((await request('/', { country: 'RS', cf: { country: 'US' } })).status, 200);
  assert.equal((await request('/?campaign=one&tag=two', { country: 'RS' })).headers.get('Location'), 'https://portfolio.test/sr/?campaign=one&tag=two');
});

test('German mapping activates only when both enabled and approved', async () => {
  for (const approved of [false, true]) {
    const config = structuredClone(content.localeConfig);
    const de = config.locales.find(locale => locale.id === 'de');
    de.enabled = true;
    de.contentStatus = approved ? 'approved' : 'draft';
    const response = await request('/', { country: 'DE' }, createLocaleWorker(config));
    assert.equal(response.status, approved ? 302 : 200);
    if (approved) assert.equal(response.headers.get('Location'), 'https://portfolio.test/de/');
  }
});
