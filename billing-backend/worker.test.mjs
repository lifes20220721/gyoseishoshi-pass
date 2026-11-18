import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createWorker, entitlement } from './worker.mjs';

const epoch = Date.parse('2026-11-16T00:00:00Z');
const productId = 'gyosei_premium_monthly';
const validItem = { productId, expiryTime: '2026-12-16T00:00:00Z' };
test('active, grace and canceled subscriptions retain access only until expiry', () => {
  for (const subscriptionState of ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']) {
    assert(entitlement({ subscriptionState, lineItems: [validItem] }, productId, epoch));
    assert.equal(entitlement({ subscriptionState, lineItems: [validItem] }, productId, epoch + 60 * 86400000), null);
  }
  for (const subscriptionState of ['SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PENDING']) {
    assert.equal(entitlement({ subscriptionState, lineItems: [validItem] }, productId, epoch), null);
  }
  assert.equal(entitlement({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [validItem] }, 'gyosei_premium_yearly', epoch), null);
});

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com', private_key_id: 'test', private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const request = (origin = 'https://gyoseishoshipass.com') => new Request('https://billing.example/v1/subscriptions/verify', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ packageName: 'com.gyoseishoshipass.app', productId, purchaseToken: 'test-purchase-token-12345' }) });

test('premium access is returned only after Google verification and acknowledgement', async () => {
  const calls = [];
  const worker = createWorker({ now: () => epoch, fetchFn: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-access-token', expires_in: 3600 });
    if (url.endsWith(':acknowledge')) return new Response(null, { status: 204 });
    return Response.json({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [validItem], acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' });
  } });
  const response = await worker.fetch(request(), env);
  assert.deepEqual(await response.json(), { active: true, acknowledged: true, expiresAt: validItem.expiryTime });
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://gyoseishoshipass.com');
  assert.equal(calls.length, 3);
  assert(calls[2].url.endsWith(':acknowledge'));
  assert(calls.every(call => call.options.redirect === 'manual'), 'Workers supports manual redirects; error mode throws before sending.');
});

test('acknowledgement failure does not grant access', async () => {
  const worker = createWorker({ now: () => epoch, fetchFn: async url => {
    if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
    if (url.endsWith(':acknowledge')) return new Response(null, { status: 403 });
    return Response.json({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [validItem] });
  } });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).active, undefined);
});

test('foreign origins and unconfigured billing never contact Google', async () => {
  const worker = createWorker({ fetchFn: () => { throw new Error('unexpected Google request'); } });
  assert.equal((await worker.fetch(request('https://untrusted.example'), env)).status, 403);
  assert.equal((await worker.fetch(request(), {})).status, 503);
});
