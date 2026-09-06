import content from '../src/content.json' with { type: 'json' };

const countryLocales = { RS: 'sr', DE: 'de' };
const cookieName = 'portfolio_locale';
const cookieAge = 180 * 24 * 60 * 60;

// Exported factory also allows testing future enabled locales without changing content.
export function createLocaleWorker(config) {
  const available = new Map(config.locales
    .filter(locale => locale.enabled && locale.contentStatus === 'approved')
    .map(locale => [locale.id, locale]));
  const fallback = available.get(config.defaultLocale);

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
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
