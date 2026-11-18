import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const packageName = 'com.gyoseishoshipass.app';
export const products = Object.freeze([
  { id: 'gyosei_premium_monthly', planId: 'monthly', period: 'P1M', yen: '500', title: '行政書士PASS プレミアム月額' },
  { id: 'gyosei_premium_yearly', planId: 'yearly', period: 'P1Y', yen: '5000', title: '行政書士PASS プレミアム年額' }
]);
const root = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
// JP is priced explicitly; no exchange-rate conversion or global pricing access is needed.
const regionsVersion = '2022/02';

export function matchesProduct(subscription, product) {
  const plan = subscription.basePlans?.find(item => item.basePlanId === product.planId);
  const japan = plan?.regionalConfigs?.find(item => item.regionCode === 'JP');
  return subscription.packageName === packageName && subscription.productId === product.id &&
    plan?.autoRenewingBasePlanType?.billingPeriodDuration === product.period &&
    japan?.price?.currencyCode === 'JPY' && String(japan.price.units) === product.yen &&
    Number(japan.price.nanos || 0) === 0 && japan.newSubscriberAvailability === true;
}

export async function configureSubscriptions(request, report = console.log) {
  for (const product of products) {
    let existing;
    try { existing = (await request({ method: 'GET', url: `${root}/subscriptions/${product.id}` })).data; }
    catch (error) { if (error.response?.status !== 404) throw error; }
    if (existing) {
      if (!matchesProduct(existing, product)) throw new Error(`EXISTING_PRODUCT_DIFFERS: ${product.id}`);
      report(`${product.id}: already configured at JPY ${product.yen} / ${product.period}`);
      continue;
    }
    const response = await request({
      method: 'POST',
      url: `${root}/subscriptions?productId=${encodeURIComponent(product.id)}&regionsVersion.version=${encodeURIComponent(regionsVersion)}`,
      data: {
        packageName, productId: product.id,
        listings: [{ languageCode: 'ja-JP', title: product.title,
          description: '無料100問に加え、行政書士PASSの全1000問を有効期間中に学習できます。',
          benefits: ['全1000問の問題演習', '全6科目・4形式に対応', '科目ごとに続きから再開'] }],
        basePlans: [{ basePlanId: product.planId,
          autoRenewingBasePlanType: { billingPeriodDuration: product.period, legacyCompatible: true },
          regionalConfigs: [{ regionCode: 'JP', newSubscriberAvailability: true,
            price: { currencyCode: 'JPY', units: product.yen, nanos: 0 } }] }]
      }
    });
    if (!matchesProduct(response.data, product)) throw new Error('CREATED_PRODUCT_MISMATCH');
    const checked = (await request({ method: 'GET', url: `${root}/subscriptions/${product.id}` })).data;
    if (!matchesProduct(checked, product)) throw new Error('READBACK_MISMATCH');
    report(`${product.id}: draft created and verified at JPY ${product.yen} / ${product.period}`);
  }
  report('Products configured. Base plans remain inactive until billing verification is connected.');
}

async function main() {
  const { GoogleAuth } = await import('google-auth-library');
  let credentials;
  try { credentials = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON || ''); }
  catch { throw new Error('INVALID_CREDENTIAL_JSON'); }
  if (credentials.client_email !== 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com') throw new Error('WRONG_ACCOUNT');
  const client = await new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] }).getClient();
  await configureSubscriptions(options => client.request({ ...options, timeout: 30000 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    const status = error.response?.status;
    const message = status ? 'GOOGLE_API_REQUEST_FAILED' : error.message;
    console.error('Subscription setup stopped:', message, status || '');
    if (status) {
      const detail = error.response?.data?.error;
      console.error('Google API detail:', String(detail?.message || '').slice(0, 500));
      console.error('Operation:', error.config?.method || '', String(error.config?.url || '').split('?')[0]);
    }
    process.exitCode = 1;
  });
}
