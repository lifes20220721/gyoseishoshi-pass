import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const configSource = fs.readFileSync(new URL('./subscription-config.js', import.meta.url), 'utf8');
const subscriptionSource = fs.readFileSync(new URL('./subscription.js', import.meta.url), 'utf8');
const monthly = 'gyosei_premium_monthly';
const yearly = 'gyosei_premium_yearly';
const testToken = 'fake-test-token-never-sent-to-google';

function fixture({ result = { active: true, acknowledged: true }, responseOk = true,
  networkError = false, purchases = [], enabled = true, supported = true } = {}) {
  const requests = [], completions = [], payments = [];
  const goods = {
    async getDetails(ids) {
      return ids.map(itemId => ({ itemId, price: { currency: 'JPY', value: itemId === monthly ? '500' : '5000' } }));
    },
    async listPurchases() { return purchases; }
  };
  const window = { GYOPASS_DATA: {}, dispatchEvent() {} };
  if (supported) window.getDigitalGoodsService = async method => {
    assert.equal(method, 'https://play.google.com/billing');
    return goods;
  };
  const context = vm.createContext({
    window, navigator: { language: 'ja-JP' }, Intl,
    console: { warn() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (networkError) throw new Error('simulated-network-failure');
      return { ok: responseOk, async json() { return result; } };
    },
    PaymentRequest: class {
      constructor(methods) { payments.push(methods); }
      async show() {
        return { details: { purchaseToken: testToken }, async complete(value) { completions.push(value); } };
      }
    }
  });
  vm.runInContext(configSource, context);
  window.GYOPASS_SUBSCRIPTION_CONFIG = { ...window.GYOPASS_SUBSCRIPTION_CONFIG, enabled };
  vm.runInContext(subscriptionSource, context);
  return { access: window.GYOPASS_SUBSCRIPTION, requests, completions, payments };
}

for (const productId of [monthly, yearly]) {
  test(`${productId}: unlock only after server verification and acknowledgement`, async () => {
    const { access, requests, completions, payments } = fixture();
    assert.equal(await access.purchase(productId), true);
    assert.equal(access.getSnapshot().premium, true);
    assert.equal(access.getSnapshot().status, 'premium');
    assert.deepEqual(completions, ['success']);
    assert.equal(payments[0][0].data.sku, productId);
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      packageName: 'com.gyoseishoshipass.app', productId, purchaseToken: testToken
    });
    assert.equal(requests[0].options.credentials, 'omit');
    assert.match(requests[0].url, /^https:\/\/gyoseishoshi-pass-billing\./);
  });
}

for (const result of [{ active: false, acknowledged: false }, { active: true, acknowledged: false }, { active: false, acknowledged: true }]) {
  test(`verification ${JSON.stringify(result)} cannot unlock paid questions`, async () => {
    const { access, completions } = fixture({ result });
    await assert.rejects(access.purchase(monthly), /verification-failed/);
    assert.equal(access.getSnapshot().premium, false);
    assert.deepEqual(completions, ['fail']);
  });
}

for (const options of [{ responseOk: false }, { networkError: true }]) {
  test(`verification failure ${JSON.stringify(options)} completes once without unlocking`, async () => {
    const { access, completions } = fixture(options);
    await assert.rejects(access.purchase(monthly));
    assert.equal(access.getSnapshot().premium, false);
    assert.deepEqual(completions, ['fail']);
  });
}

test('restore checks a saved Play purchase on the server', async () => {
  const { access, requests, payments } = fixture({ purchases: [{ itemId: yearly, purchaseToken: testToken }] });
  assert.equal(await access.restorePurchases(), true);
  assert.equal(access.getSnapshot().premium, true);
  assert.equal(requests.length, 1);
  assert.equal(payments.length, 0);
});

test('expired or unacknowledged restored purchase does not grant access', async () => {
  const { access } = fixture({ purchases: [{ itemId: monthly, purchaseToken: testToken }], result: { active: false, acknowledged: false } });
  assert.equal(await access.restorePurchases(), false);
  assert.equal(access.getSnapshot().status, 'free');
});

test('ordinary browsers cannot initialize Play billing', async () => {
  const { access, requests } = fixture({ supported: false });
  assert.equal(await access.restorePurchases(), false);
  assert.equal(access.getSnapshot().status, 'unavailable');
  assert.equal(requests.length, 0);
});

test('disabled billing and unknown products never open a payment screen', async () => {
  const disabled = fixture({ enabled: false });
  await assert.rejects(disabled.access.purchase(monthly), /billing-not-ready/);
  assert.equal(disabled.payments.length, 0);
  const unknown = fixture();
  await assert.rejects(unknown.access.purchase('other_product'), /unknown-product/);
  assert.equal(unknown.payments.length, 0);
});
