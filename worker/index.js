import content from '../src/content.json' with { type: 'json' };

const countryLocales = { RS: 'sr', DE: 'de' };
const cookieName = 'portfolio_locale';
const cookieAge = 180 * 24 * 60 * 60;
const contactPath = '/api/contact';
const maxContactBodyBytes = 16 * 1024;
const resendEndpoint = 'https://api.resend.com/emails';
const contactFrom = 'Kristina Portfolio <noreply@kristinaglisovic.dev>';
const contactTo = 'hello@kristinaglisovic.dev';
const allowedProjectTypes = ['custom-website', 'web-application', 'shopify-ecommerce', 'redesign-improvements', 'other'];
const allowedTimelines = ['', 'asap', '1-2-months', '3-6-months', 'flexible'];
const allowedBudgets = ['', 'under-2500', '2500-5000', '5000-10000', '10000-plus', 'not-sure'];
const allowedContactFields = new Set(['name', 'email', 'company', 'projectType', 'details', 'timeline', 'budget', 'locale', 'website']);

const contactResponse = (status, payload, extraHeaders = {}) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  },
});

const escapeHtml = value => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function normalizeField(payload, name, maxLength, { required = false, multiline = false } = {}) {
  const raw = payload[name] ?? '';
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if ((required && !value) || value.length > maxLength || value.includes('\0')) return null;
  if (!multiline && /[\r\n]/.test(value)) return null;
  return value;
}

function getContactCopy(locale) {
  const form = content.locales[locale].contact.form;
  const optionValue = (field, values, value) => {
    if (!value) return '';
    const index = values.indexOf(value);
    return form.fields[field].options[index];
  };
  const sr = locale === 'sr';
  return {
    heading: sr ? 'Novi upit sa portfolio sajta' : 'New portfolio inquiry',
    subjectPrefix: sr ? 'Novi upit sa portfolio sajta' : 'New portfolio inquiry',
    labels: sr ? {
      name: 'Ime', email: 'Email', company: 'Kompanija', projectType: 'Tip projekta',
      timeline: 'Okvirni rok', budget: 'Okvirni budžet', details: 'Poruka', source: 'Izvor',
    } : {
      name: 'Name', email: 'Email', company: 'Company', projectType: 'Project type',
      timeline: 'Timeline', budget: 'Budget', details: 'Message', source: 'Source',
    },
    projectType: value => optionValue('projectType', allowedProjectTypes, value),
    timeline: value => optionValue('timeline', allowedTimelines.slice(1), value),
    budget: value => optionValue('budget', allowedBudgets.slice(1), value),
  };
}

function validateContactPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (Object.keys(payload).some(key => !allowedContactFields.has(key))) return null;

  const website = normalizeField(payload, 'website', 200);
  if (website === null) return null;
  if (website) return { honeypot: true };

  const name = normalizeField(payload, 'name', 100, { required: true });
  const email = normalizeField(payload, 'email', 254, { required: true });
  const company = normalizeField(payload, 'company', 150);
  const projectType = normalizeField(payload, 'projectType', 50, { required: true });
  const details = normalizeField(payload, 'details', 5000, { required: true, multiline: true });
  const timeline = normalizeField(payload, 'timeline', 100);
  const budget = normalizeField(payload, 'budget', 100);
  const locale = payload.locale ?? 'en';
  if ([name, email, company, projectType, details, timeline, budget].includes(null)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!allowedProjectTypes.includes(projectType) || !allowedTimelines.includes(timeline) || !allowedBudgets.includes(budget)) return null;
  if (!['en', 'sr'].includes(locale)) return null;
  return { name, email, company, projectType, details, timeline, budget, locale };
}

function isAllowedContactOrigin(request, url, siteConfig) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.origin === url.origin) return true;
  if (siteConfig?.originStatus === 'configured') {
    try { return parsed.origin === new URL(siteConfig.origin).origin; } catch { return false; }
  }
  return false;
}

function createEmailPayload(data) {
  const copy = getContactCopy(data.locale);
  const rows = [
    [copy.labels.name, data.name],
    [copy.labels.email, data.email],
    [copy.labels.company, data.company],
    [copy.labels.projectType, copy.projectType(data.projectType)],
    [copy.labels.timeline, copy.timeline(data.timeline)],
    [copy.labels.budget, copy.budget(data.budget)],
  ].filter(([, value]) => value);
  const text = [
    copy.heading,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `${copy.labels.details}:`,
    data.details,
    '',
    `${copy.labels.source}: Portfolio contact form`,
  ].join('\n');
  const htmlRows = rows.map(([label, value]) => (
    `<tr><th align="left" style="padding:4px 16px 4px 0;color:#667085;font-weight:600;vertical-align:top">${escapeHtml(label)}</th><td style="padding:4px 0;color:#101828">${escapeHtml(value)}</td></tr>`
  )).join('');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#101828"><h1 style="font-size:22px">${escapeHtml(copy.heading)}</h1><table style="border-collapse:collapse">${htmlRows}</table><h2 style="margin:24px 0 8px;font-size:16px">${escapeHtml(copy.labels.details)}</h2><p style="white-space:pre-wrap">${escapeHtml(data.details)}</p><p style="margin-top:24px;color:#667085;font-size:13px">${escapeHtml(copy.labels.source)}: Portfolio contact form</p></div>`;
  return {
    from: contactFrom,
    to: [contactTo],
    reply_to: data.email,
    subject: `${copy.subjectPrefix} - ${data.name}`,
    text,
    html,
  };
}

async function handleContactRequest(request, env, url, providerFetch, siteConfig) {
  if (request.method !== 'POST') {
    return contactResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST' });
  }
  if (!isAllowedContactOrigin(request, url, siteConfig)) {
    return contactResponse(403, { ok: false, code: 'ORIGIN_NOT_ALLOWED' });
  }
  if ((request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return contactResponse(415, { ok: false, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxContactBodyBytes) {
    return contactResponse(413, { ok: false, code: 'PAYLOAD_TOO_LARGE' });
  }

  let body;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxContactBodyBytes) {
      return contactResponse(413, { ok: false, code: 'PAYLOAD_TOO_LARGE' });
    }
    body = JSON.parse(text);
  } catch {
    return contactResponse(400, { ok: false, code: 'INVALID_REQUEST' });
  }
  const data = validateContactPayload(body);
  if (!data) return contactResponse(400, { ok: false, code: 'INVALID_REQUEST' });
  if (data.honeypot) return contactResponse(200, { ok: true });
  if (typeof env.RESEND_API_KEY !== 'string' || !env.RESEND_API_KEY) {
    console.error('Contact endpoint configuration error');
    return contactResponse(500, { ok: false, code: 'SERVER_ERROR' });
  }

  let providerResponse;
  try {
    providerResponse = await providerFetch(resendEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createEmailPayload(data)),
    });
  } catch {
    console.error('Contact provider request failed');
    return contactResponse(502, { ok: false, code: 'PROVIDER_ERROR' });
  }
  if (!providerResponse.ok) {
    console.error('Contact provider rejected request');
    return contactResponse(502, { ok: false, code: 'PROVIDER_ERROR' });
  }
  return contactResponse(200, { ok: true });
}

// Exported factory also allows testing future enabled locales without changing content.
export function createLocaleWorker(config, options = {}) {
  const available = new Map(config.locales
    .filter(locale => locale.enabled && locale.contentStatus === 'approved')
    .map(locale => [locale.id, locale]));
  const fallback = available.get(config.defaultLocale);
  const providerFetch = options.fetchImpl || fetch;
  const siteConfig = options.siteConfig || content.shared.site;

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === contactPath) {
        return handleContactRequest(request, env, url, providerFetch, siteConfig);
      }
      if (!['GET', 'HEAD'].includes(request.method)) return env.ASSETS.fetch(request);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || url.hostname.endsWith('.localhost');
      const bot = request.cf?.botManagement?.verifiedBot === true
        || /bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|applebot|googleother|google-inspectiontool/i
          .test(request.headers.get('User-Agent') || '');
      const redirect = (route, preference) => {
        url.pathname = route;
        const headers = new Headers({ Location: url.href, 'Cache-Control': 'no-store' });
        if (preference && !local && !bot) {
          headers.set('Set-Cookie', `${cookieName}=${preference}; Max-Age=${cookieAge}; Path=/; Secure; HttpOnly; SameSite=Lax`);
        }
        return new Response(null, { status: 302, headers });
      };

      // Only locale landing pages accept the explicit selector intent.
      const landing = config.locales.some(locale => locale.route === url.pathname);
      if (landing && url.searchParams.has('locale')) {
        const choices = url.searchParams.getAll('locale');
        const selected = choices.length === 1 ? available.get(choices[0]) : undefined;
        url.searchParams.delete('locale');
        if (selected && selected.route === url.pathname) return redirect(selected.route, selected.id);
        // Invalid or disabled choices never activate an unpublished locale.
        return redirect(url.pathname);
      }

      // Explicit localized paths, assets and other routes never receive geo redirects.
      if (url.pathname !== fallback.route || local || bot) return env.ASSETS.fetch(request);
      const cookies = (request.headers.get('Cookie') || '').split(';').map(value => value.trim());
      const saved = cookies.find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
      const country = request.cf?.country || request.headers.get('CF-IPCountry');
      const target = available.get(saved) || available.get(countryLocales[country]) || fallback;
      if (target.route !== url.pathname) return redirect(target.route);

      // Even an English response is preference-dependent: do not cache it across visits/users.
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    },
  };
}

export default createLocaleWorker(content.localeConfig);
