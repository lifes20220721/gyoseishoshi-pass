'use strict';

(() => {
  const config = window.GYOPASS_SUBSCRIPTION_CONFIG;
  const data = window.GYOPASS_DATA;
  if (!config || !data) return;

  const FREE_QUOTAS = Object.freeze({
    administrative: Object.freeze({ ox: 14, five: 19, multi: 2, written: 5 }),
    constitution: Object.freeze({ ox: 3, five: 5, multi: 1, written: 1 }),
    civil: Object.freeze({ ox: 3, five: 5, multi: 1, written: 1 }),
    commercial: Object.freeze({ ox: 3, five: 4, multi: 1, written: 1 }),
    legal: Object.freeze({ ox: 3, five: 4, multi: 1, written: 1 }),
    general: Object.freeze({ ox: 8, five: 12, multi: 1, written: 1 })
  });
  const BILLING_METHOD = 'https://play.google.com/billing';
  let freeQuestionIds = null;
  let premium = false;
  let billingService = null;
  let productDetails = new Map();
  let status = config.enabled ? 'checking' : 'preparing';

  function stableHash(value) {
    let hash = 2166136261;
    for (const char of value) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function ensureFreeQuestionIds() {
    if (freeQuestionIds) return freeQuestionIds;
    const selected = new Set();
    for (const [subject, typeQuotas] of Object.entries(FREE_QUOTAS)) {
      for (const [type, quota] of Object.entries(typeQuotas)) {
        const candidates = [...(data[type] || [])]
          .filter(question => question.subject === subject)
          .sort((a, b) => stableHash(`free-v1:${a.id}`) - stableHash(`free-v1:${b.id}`) || String(a.id).localeCompare(String(b.id)));
        if (candidates.length < quota) throw new Error(`無料問題数を確保できません: ${subject}/${type}`);
        candidates.slice(0, quota).forEach(question => selected.add(question.id));
      }
    }
    if (selected.size !== config.freeQuestionCount) throw new Error(`無料問題数が${config.freeQuestionCount}問ではありません`);
    freeQuestionIds = selected;
    return selected;
  }

  function canAccess(question) {
    return premium || ensureFreeQuestionIds().has(question.id);
  }

  function filterQuestions(questions) {
    return premium ? [...questions] : questions.filter(canAccess);
  }

  function getSnapshot() {
    return Object.freeze({
      premium,
      status,
      freeQuestionCount: config.freeQuestionCount,
      totalQuestionCount: config.totalQuestionCount,
      products: config.products.map(product => ({
        ...product,
        displayPrice: productDetails.get(product.id)?.displayPrice || product.fallbackPrice
      }))
    });
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent('gyopass:subscription-change', { detail: getSnapshot() }));
  }

  async function verifyPurchase(purchase) {
    if (!config.verificationEndpoint) return false;
    const response = await fetch(config.verificationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        packageName: config.packageName,
        productId: purchase.itemId,
        purchaseToken: purchase.purchaseToken
      })
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.active === true && result.acknowledged === true;
  }

  async function restorePurchases() {
    if (!config.enabled || !config.verificationEndpoint) {
      status = 'preparing';
      emitChange();
      return false;
    }
    if (!('getDigitalGoodsService' in window)) {
      status = 'unavailable';
      emitChange();
      return false;
    }
    try {
      billingService ||= await window.getDigitalGoodsService(BILLING_METHOD);
      const details = await billingService.getDetails(config.products.map(product => product.id));
      productDetails = new Map(details.map(item => [item.itemId, {
        ...item,
        displayPrice: new Intl.NumberFormat(navigator.language, { style: 'currency', currency: item.price.currency }).format(item.price.value)
      }]));
      const purchases = await billingService.listPurchases();
      const relevant = purchases.filter(purchase => config.products.some(product => product.id === purchase.itemId));
      premium = (await Promise.all(relevant.map(verifyPurchase))).some(Boolean);
      status = premium ? 'premium' : 'free';
    } catch (error) {
      console.warn('Google Play課金情報を確認できませんでした。', error);
      status = 'unavailable';
      premium = false;
    }
    emitChange();
    return premium;
  }

  async function purchase(productId) {
    if (!config.enabled || !config.verificationEndpoint) throw new Error('billing-not-ready');
    if (!config.products.some(product => product.id === productId)) throw new Error('unknown-product');
    billingService ||= await window.getDigitalGoodsService(BILLING_METHOD);
    const request = new PaymentRequest([{
      supportedMethods: BILLING_METHOD,
      data: { sku: productId }
    }], {
      total: { label: '合計', amount: { currency: 'JPY', value: '0' } }
    });
    const response = await request.show();
    try {
      const acknowledged = await verifyPurchase({ itemId: productId, purchaseToken: response.details.purchaseToken });
      await response.complete(acknowledged ? 'success' : 'fail');
      if (!acknowledged) throw new Error('verification-failed');
      premium = true;
      status = 'premium';
      emitChange();
      return true;
    } catch (error) {
      await response.complete('fail').catch(() => {});
      throw error;
    }
  }

  window.GYOPASS_SUBSCRIPTION = Object.freeze({
    canAccess,
    filterQuestions,
    getFreeQuestionIds: () => new Set(ensureFreeQuestionIds()),
    getSnapshot,
    restorePurchases,
    purchase
  });
})();
