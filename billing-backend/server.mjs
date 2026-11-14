import http from 'node:http';
import { GoogleAuth } from 'google-auth-library';

const PORT = Number(process.env.PORT || 8080);
const PACKAGE_NAME = 'com.gyoseishoshipass.app';
const ALLOWED_ORIGINS = new Set([
  'https://gyoseishoshipass.com',
  'https://www.gyoseishoshipass.com'
]);
const PRODUCT_IDS = new Set(['gyosei_premium_monthly', 'gyosei_premium_yearly']);
const ACTIVE_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
]);
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });

function send(response, status, body, origin = '') {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw new Error('request-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function getSubscription(client, purchaseToken) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await client.request({ url, method: 'GET' });
  return response.data;
}

async function acknowledgeSubscription(client, productId, purchaseToken) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  await client.request({ url, method: 'POST', data: {} });
}

function hasActiveLineItem(subscription, productId) {
  const now = Date.now();
  return (subscription.lineItems || []).some(item => {
    const matchesProduct = item.productId === productId;
    const expiry = Date.parse(item.expiryTime || '');
    return matchesProduct && Number.isFinite(expiry) && expiry > now;
  });
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (request.method === 'OPTIONS') {
    if (!ALLOWED_ORIGINS.has(origin)) return send(response, 403, { error: 'origin-not-allowed' });
    response.writeHead(204, {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'Origin'
    });
    return response.end();
  }
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true }, origin);
  if (request.method !== 'POST' || request.url !== '/v1/subscriptions/verify') return send(response, 404, { error: 'not-found' }, origin);
  if (!ALLOWED_ORIGINS.has(origin)) return send(response, 403, { error: 'origin-not-allowed' });

  try {
    const body = await readJson(request);
    if (body.packageName !== PACKAGE_NAME || !PRODUCT_IDS.has(body.productId)) return send(response, 400, { error: 'invalid-product' }, origin);
    if (typeof body.purchaseToken !== 'string' || body.purchaseToken.length < 20 || body.purchaseToken.length > 4096) {
      return send(response, 400, { error: 'invalid-token' }, origin);
    }

    const client = await auth.getClient();
    const subscription = await getSubscription(client, body.purchaseToken);
    const active = ACTIVE_STATES.has(subscription.subscriptionState) && hasActiveLineItem(subscription, body.productId);
    if (!active) return send(response, 200, { active: false, acknowledged: false }, origin);

    if (subscription.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') {
      await acknowledgeSubscription(client, body.productId, body.purchaseToken);
    }
    return send(response, 200, {
      active: true,
      acknowledged: true,
      expiresAt: subscription.lineItems.find(item => item.productId === body.productId)?.expiryTime || null
    }, origin);
  } catch (error) {
    const status = error.message === 'request-too-large' ? 413 : error instanceof SyntaxError ? 400 : 502;
    console.error('Subscription verification failed:', error.response?.status || error.code || error.message);
    return send(response, status, { error: status === 502 ? 'verification-unavailable' : 'invalid-request' }, origin);
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Billing verification server listening on ${PORT}`));
