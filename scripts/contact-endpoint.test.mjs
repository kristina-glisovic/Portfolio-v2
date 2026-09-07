import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../src/content.json' with { type: 'json' };
import { createLocaleWorker } from '../worker/index.js';

const validPayload = {
  name: 'John Smith',
  email: 'john@example.com',
  company: 'Example Company',
  projectType: 'custom-website',
  details: 'A production website with a clear content structure and launch plan.',
  timeline: '1-2-months',
  budget: '2500-5000',
  locale: 'en',
  website: '',
};

function setup(providerResponse = new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }), siteConfig) {
  const calls = [];
  const handler = createLocaleWorker(content.localeConfig, {
    siteConfig,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return typeof providerResponse === 'function' ? providerResponse(url, options) : providerResponse;
    },
  });
  return { handler, calls };
}

async function submit(handler, payload = validPayload, options = {}) {
  const headers = new Headers({
    'Content-Type': options.contentType || 'application/json',
    Origin: options.origin || 'https://portfolio.test',
  });
  const request = new Request('https://portfolio.test/api/contact', {
    method: options.method || 'POST',
    headers,
    body: (options.method || 'POST') === 'GET' ? undefined : (options.rawBody ?? JSON.stringify(payload)),
  });
  const response = await handler.fetch(request, {
    RESEND_API_KEY: options.secret === false ? undefined : 'test-secret',
    ASSETS: { fetch: () => { throw new Error('contact request reached static assets'); } },
  });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return response;
}

test('valid request sends the expected Resend email and returns success', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  const email = JSON.parse(calls[0].options.body);
  assert.equal(email.from, 'Kristina Portfolio <noreply@kristinaglisovic.dev>');
  assert.deepEqual(email.to, ['hello@kristinaglisovic.dev']);
  assert.equal(email.reply_to, 'john@example.com');
  assert.equal(email.subject, 'New portfolio inquiry - John Smith');
  assert.match(email.text, /Name: John Smith/);
  assert.match(email.html, /Project type/);
});

test('required field and email validation rejects malformed requests without Resend', async () => {
  for (const payload of [
    { ...validPayload, name: '' },
    { ...validPayload, email: 'not-an-email' },
    { ...validPayload, details: '' },
  ]) {
    const { handler, calls } = setup();
    const response = await submit(handler, payload);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, code: 'INVALID_REQUEST' });
    assert.equal(calls.length, 0);
  }
});

test('honeypot returns ordinary success without contacting Resend', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler, { ...validPayload, website: 'https://spam.test' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 0);
});

test('wrong method returns 405 with Allow POST', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler, validPayload, { method: 'GET' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
  assert.equal(calls.length, 0);
});

test('unsupported content type returns 415', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler, validPayload, { contentType: 'text/plain' });
  assert.equal(response.status, 415);
  assert.equal(calls.length, 0);
});

test('oversized payload returns 413 without Resend', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler, { ...validPayload, details: 'x'.repeat(17 * 1024) });
  assert.equal(response.status, 413);
  assert.equal(calls.length, 0);
});

test('missing RESEND_API_KEY returns a generic server error', async () => {
  const { handler, calls } = setup();
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await submit(handler, validPayload, { secret: false });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, code: 'SERVER_ERROR' });
  } finally {
    console.error = originalError;
  }
  assert.equal(calls.length, 0);
});

test('Resend failure returns a generic provider error without leaking its body', async () => {
  const { handler, calls } = setup(new Response('provider-internal-secret', { status: 422 }));
  const originalError = console.error;
  console.error = () => {};
  let response;
  try { response = await submit(handler); } finally { console.error = originalError; }
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.equal(body, JSON.stringify({ ok: false, code: 'PROVIDER_ERROR' }));
  assert.doesNotMatch(body, /provider-internal-secret/);
  assert.equal(calls.length, 1);
});

test('configured production origin rejects an unexpected browser origin', async () => {
  const { handler, calls } = setup(undefined, { originStatus: 'configured', origin: 'https://portfolio.test' });
  const response = await submit(handler, validPayload, { origin: 'https://evil.test' });
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('invalid locale is rejected instead of being trusted', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler, { ...validPayload, locale: 'de' });
  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test('Serbian subject is localized and user HTML is escaped', async () => {
  const { handler, calls } = setup();
  const response = await submit(handler, {
    ...validPayload,
    name: 'Petar',
    company: '<script>alert(1)</script>',
    details: '<img src=x onerror=alert(1)>',
    locale: 'sr',
  });
  assert.equal(response.status, 200);
  const email = JSON.parse(calls[0].options.body);
  assert.equal(email.subject, 'Novi upit sa portfolio sajta - Petar');
  assert.doesNotMatch(email.html, /<script>|<img/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /&lt;img/);
});
