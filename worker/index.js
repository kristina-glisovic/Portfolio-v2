const encoder = new TextEncoder();

async function credentialsMatch(actual, expected) {
  const hashes = await Promise.all(
    [actual, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );
  const actualHash = new Uint8Array(hashes[0]);
  const expectedHash = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let i = 0; i < actualHash.length; i++) {
    difference |= actualHash[i] ^ expectedHash[i];
  }
  return difference === 0;
}

export default {
  async fetch(request, env) {
    if (typeof env.PREVIEW_PASSWORD !== 'string' || !env.PREVIEW_PASSWORD.length) {
      return new Response('Preview access is not configured.', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const authorization = request.headers.get('Authorization');
    const basic = authorization?.match(/^Basic\s+([A-Za-z0-9+/]+={0,2})$/i);
    let credentials = null;
    if (basic) {
      try {
        const bytes = Uint8Array.from(atob(basic[1]), character => character.charCodeAt(0));
        credentials = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        // Malformed Base64 or UTF-8 is an authentication failure.
      }
    }

    if (credentials === null || !await credentialsMatch(credentials, `preview:${env.PREVIEW_PASSWORD}`)) {
      return new Response('Authentication required.', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Portfolio Preview", charset="UTF-8"',
          'Cache-Control': 'no-store',
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
