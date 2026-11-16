import test from 'node:test';
import assert from 'node:assert/strict';
import { deployWorker } from './deploy-worker.mjs';

const credentials = { type: 'service_account', client_email: 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com', private_key: 'test-key' };
const accountId = '1234567890abcdef1234567890abcdef';
const ok = result => Response.json({ success: true, result });

test('deployment sends credentials only as a secret binding and does not change billing plans', async () => {
  const calls = [];
  const endpoint = await deployWorker({ token: 'test-token', credentials, source: 'test-worker', report: () => {}, fetchFn: async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/accounts?per_page=50')) return ok([{ id: accountId }]);
    if (url.endsWith('/workers/subdomain')) return ok({ subdomain: 'test-account' });
    if (url.endsWith('/health')) return Response.json({ ok: true });
    if (url.endsWith('/v1/subscriptions/verify')) return new Response(null, { status: 403 });
    if (options.body instanceof FormData) {
      const metadata = JSON.parse(await options.body.get('metadata').text());
      assert.equal(metadata.bindings[0].type, 'secret_text');
      assert.equal(JSON.parse(metadata.bindings[0].text).private_key, 'test-key');
      assert.equal(await options.body.get('worker.mjs').text(), 'test-worker');
    }
    return ok({});
  } });
  assert.equal(endpoint, 'https://gyoseishoshi-pass-billing.test-account.workers.dev/v1/subscriptions/verify');
  assert(!calls.some(call => /billing|subscriptions|plans/.test(call.url.replace('gyoseishoshi-pass-billing', '').replace('/v1/subscriptions/verify', ''))));
});

test('missing token or ambiguous account prevents deployment', async () => {
  await assert.rejects(deployWorker({ token: '', credentials, source: '' }), /MISSING_CLOUDFLARE_API_TOKEN/);
  const calls = [];
  await assert.rejects(deployWorker({ token: 'test', credentials, source: '', fetchFn: async url => { calls.push(url); return ok([{ id: accountId }, { id: accountId }]); } }), /TOKEN_MUST_BE_SCOPED_TO_ONE_ACCOUNT/);
  assert.equal(calls.length, 1);
});

test('Cloudflare permission errors stop before script upload', async () => {
  await assert.rejects(deployWorker({ token: 'test', credentials, source: '', fetchFn: async () => Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 }) }), /CLOUDFLARE_HTTP_403_CODES_10000/);
});
