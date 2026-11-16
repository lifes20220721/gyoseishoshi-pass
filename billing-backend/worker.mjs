const PACKAGE = 'com.gyoseishoshipass.app';
const PRODUCTS = new Set(['gyosei_premium_monthly', 'gyosei_premium_yearly']);
const ORIGINS = new Set(['https://gyoseishoshipass.com', 'https://www.gyoseishoshipass.com']);
const STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ROOT = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}`;

const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const encodeJson = object => base64url(new TextEncoder().encode(JSON.stringify(object)));

export function entitlement(subscription, productId, now = Date.now()) {
  if (!STATES.has(subscription.subscriptionState)) return null;
  const valid = (subscription.lineItems || []).filter(item => item.productId === productId && Date.parse(item.expiryTime) > now);
  return valid.sort((a, b) => Date.parse(b.expiryTime) - Date.parse(a.expiryTime))[0] || null;
}

export function createWorker({ fetchFn = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  let cachedToken;
  let tokenPromise;
  async function accessToken(env) {
    if (cachedToken && cachedToken.until > now()) return cachedToken.token;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      const sa = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || '');
      if (sa.type !== 'service_account' || sa.client_email !== 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com') throw new Error('INVALID_ACCOUNT');
      const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
      const keyBytes = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
      let key;
      try { key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); }
      catch { throw new Error('KEY_IMPORT_FAILED'); }
      const iat = Math.floor(now() / 1000);
      const input = `${encodeJson({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id })}.${encodeJson({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600 })}`;
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
      const response = await fetchFn(GOOGLE_TOKEN_URL, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${base64url(signature)}` }) });
      if (!response.ok) throw new Error('GOOGLE_AUTH_FAILED');
      const token = await response.json();
      if (typeof token.access_token !== 'string' || !(Number(token.expires_in) > 60)) throw new Error('INVALID_GOOGLE_TOKEN');
      cachedToken = { token: token.access_token, until: now() + Math.min(Number(token.expires_in) - 60, 3300) * 1000 };
      return cachedToken.token;
    })();
    try { return await tokenPromise; } finally { tokenPromise = null; }
  }

  return {
    async fetch(request, env) {
      const origin = request.headers.get('origin') || '';
      const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (ORIGINS.has(origin)) { headers['access-control-allow-origin'] = origin; headers.vary = 'Origin'; }
      const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
      const path = new URL(request.url).pathname;
      if (request.method === 'GET' && path === '/health') return reply(200, { ok: true });
      if (!ORIGINS.has(origin)) return reply(403, { error: 'origin-not-allowed' });
      if (path !== '/v1/subscriptions/verify') return reply(404, { error: 'not-found' });
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
      if (request.method !== 'POST') return reply(405, { error: 'method-not-allowed' });
      if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, { error: 'json-required' });
      if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) return reply(503, { error: 'billing-not-configured' });

      let body;
      try {
        let size = 0; const chunks = [];
        for await (const chunk of request.body || []) {
          size += chunk.byteLength;
          if (size > 16384) return reply(413, { error: 'request-too-large' });
          chunks.push(chunk);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch { return reply(400, { error: 'invalid-json' }); }
      if (!body || body.packageName !== PACKAGE || !PRODUCTS.has(body.productId)) return reply(400, { error: 'invalid-product' });
      if (typeof body.purchaseToken !== 'string' || body.purchaseToken.length < 20 || body.purchaseToken.length > 4096) return reply(400, { error: 'invalid-token' });

      try {
        const token = await accessToken(env);
        const auth = { authorization: `Bearer ${token}` };
        const response = await fetchFn(`${ROOT}/purchases/subscriptionsv2/tokens/${encodeURIComponent(body.purchaseToken)}`, { headers: auth, redirect: 'error' });
        if ([404, 410].includes(response.status)) return reply(200, { active: false, acknowledged: false });
        if (!response.ok) throw new Error('PLAY_VERIFICATION_FAILED');
        const subscription = await response.json();
        const item = entitlement(subscription, body.productId, now());
        if (!item) return reply(200, { active: false, acknowledged: false });
        if (subscription.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
          const acknowledgement = await fetchFn(`${ROOT}/purchases/subscriptions/${encodeURIComponent(body.productId)}/tokens/${encodeURIComponent(body.purchaseToken)}:acknowledge`, { method: 'POST', redirect: 'error', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' });
          if (!acknowledgement.ok) throw new Error('PLAY_ACKNOWLEDGEMENT_FAILED');
        }
        return reply(200, { active: true, acknowledged: true, expiresAt: item.expiryTime });
      } catch (error) {
        // Do not log private keys, OAuth responses, or purchase tokens.
        const known = new Set(['INVALID_ACCOUNT', 'KEY_IMPORT_FAILED', 'GOOGLE_AUTH_FAILED', 'INVALID_GOOGLE_TOKEN', 'PLAY_VERIFICATION_FAILED', 'PLAY_ACKNOWLEDGEMENT_FAILED']);
        return reply(503, { error: 'verification-unavailable', reason: known.has(error.message) ? error.message : 'UNEXPECTED_RUNTIME_ERROR' });
      }
    }
  };
}

export default createWorker();
