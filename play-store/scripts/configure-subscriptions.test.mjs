import assert from 'node:assert/strict';
import test from 'node:test';
import { configureSubscriptions, products, packageName } from './configure-subscriptions.mjs';

function fakeApi({ forbidden = false } = {}) {
  const stored = new Map(); const calls = [];
  const request = async call => {
    calls.push(call);
    if (forbidden) throw Object.assign(new Error('forbidden'), { response: { status: 403 } });
    if (call.method === 'GET') {
      const id = call.url.split('/').at(-1);
      if (!stored.has(id)) throw Object.assign(new Error('not found'), { response: { status: 404 } });
      return { data: stored.get(id) };
    }
    assert.equal(call.method, 'POST');
    assert(call.url.includes('regionsVersion.version=2022%2F02'));
    stored.set(call.data.productId, call.data);
    return { data: call.data };
  };
  return { stored, calls, request };
}

test('creates exactly the approved prices, without activating or charging', async () => {
  const api = fakeApi(); await configureSubscriptions(api.request, () => {});
  assert.equal(api.stored.size, 2);
  for (const product of products) {
    const value = api.stored.get(product.id);
    assert.equal(value.packageName, packageName);
    assert.deepEqual(value.basePlans[0].regionalConfigs, [{ regionCode: 'JP', newSubscriberAvailability: true, price: { currencyCode: 'JPY', units: product.yen, nanos: 0 } }]);
    assert.equal(value.basePlans[0].autoRenewingBasePlanType.billingPeriodDuration, product.period);
  }
  assert(!api.calls.some(call => call.url.includes(':activate')));
  assert(!api.calls.some(call => call.url.includes('convertRegionPrices')));
  const count = api.calls.filter(call => call.method === 'POST').length;
  await configureSubscriptions(api.request, () => {});
  assert.equal(api.calls.filter(call => call.method === 'POST').length, count);
});

test('permission failure does not create products or try broader access', async () => {
  const api = fakeApi({ forbidden: true });
  await assert.rejects(configureSubscriptions(api.request, () => {}));
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].method, 'GET');
});

test('existing different prices are not overwritten', async () => {
  const api = fakeApi();
  api.stored.set(products[0].id, { packageName, productId: products[0].id, basePlans: [] });
  await assert.rejects(configureSubscriptions(api.request, () => {}), /EXISTING_PRODUCT_DIFFERS/);
  assert(!api.calls.some(call => call.method !== 'GET'));
});
