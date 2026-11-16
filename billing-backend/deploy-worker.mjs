import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'gyoseishoshi-pass-billing';
const API = 'https://api.cloudflare.com/client/v4';

export async function deployWorker({ token, credentials, source, fetchFn = (...args) => fetch(...args), report = console.log }) {
  if (!token) throw new Error('MISSING_CLOUDFLARE_API_TOKEN');
  if (credentials?.type !== 'service_account' || credentials.client_email !== 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com') throw new Error('INVALID_GOOGLE_ACCOUNT');
  async function call(endpoint, options = {}) {
    const response = await fetchFn(`${API}${endpoint}`, {
      ...options, redirect: 'error', headers: { ...options.headers, authorization: `Bearer ${token}` }
    });
    let body;
    try { body = await response.json(); } catch { throw new Error(`CLOUDFLARE_HTTP_${response.status}`); }
    if (!response.ok || body.success !== true) {
      const codes = (body.errors || []).map(error => error.code).join(',');
      throw new Error(`CLOUDFLARE_HTTP_${response.status}_CODES_${codes}`);
    }
    return body.result;
  }

  const accounts = await call('/accounts?per_page=50');
  if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error('TOKEN_MUST_BE_SCOPED_TO_ONE_ACCOUNT');
  const account = accounts[0];
  if (!/^[a-f0-9]{32}$/.test(account.id)) throw new Error('INVALID_ACCOUNT_ID');
  const prefix = `/accounts/${account.id}/workers`;
  let subdomain;
  try { subdomain = (await call(`${prefix}/subdomain`))?.subdomain; }
  catch (error) { if (!error.message.startsWith('CLOUDFLARE_HTTP_404_')) throw error; }
  if (!subdomain) {
    subdomain = `gyosei-pass-${account.id.slice(0, 8)}`;
    await call(`${prefix}/subdomain`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subdomain }) });
  }
  if (!/^[a-z0-9-]+$/.test(subdomain)) throw new Error('INVALID_WORKERS_SUBDOMAIN');

  // Code and the credential are uploaded directly over HTTPS; the credential is a
  // secret_text binding, never a source module or a plaintext variable.
  const upload = new FormData();
  upload.set('metadata', new Blob([JSON.stringify({
    main_module: 'worker.mjs', compatibility_date: '2026-11-16',
    bindings: [{ type: 'secret_text', name: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', text: JSON.stringify(credentials) }],
    observability: { enabled: false }
  })], { type: 'application/json' }));
  upload.set('worker.mjs', new Blob([source], { type: 'application/javascript+module' }), 'worker.mjs');
  await call(`${prefix}/scripts/${NAME}`, { method: 'PUT', body: upload });
  await call(`${prefix}/scripts/${NAME}/subdomain`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, previews_enabled: false }) });

  const base = `https://${NAME}.${subdomain}.workers.dev`;
  const health = await fetchFn(`${base}/health`, { redirect: 'error' });
  if (health.status !== 200 || (await health.json()).ok !== true) throw new Error('HEALTH_CHECK_FAILED');
  const denied = await fetchFn(`${base}/v1/subscriptions/verify`, { method: 'POST', redirect: 'error', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: '{}' });
  if (denied.status !== 403) throw new Error('ORIGIN_CHECK_FAILED');
  const verificationEndpoint = `${base}/v1/subscriptions/verify`;
  report(`Worker published; health and origin checks passed: ${base}`);
  return verificationEndpoint;
}

async function main() {
  let credentials;
  try { credentials = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON || ''); }
  catch { throw new Error('INVALID_GOOGLE_CREDENTIAL_JSON'); }
  const endpoint = await deployWorker({ token: process.env.CLOUDFLARE_API_TOKEN, credentials, source: await fs.readFile(path.join(directory, 'worker.mjs'), 'utf8') });
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `Purchase verification server published: ${endpoint}\nBilling has not been enabled in the app.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // Only our predefined codes are exposed. Never print fetch errors or response
    // request objects, which could contain Cloudflare or Google credentials.
    const code = /^[A-Z0-9_,]+$/.test(error.message) ? error.message : 'DEPLOYMENT_FAILED';
    console.error('Worker deployment stopped:', code);
    process.exitCode = 1;
  });
}
