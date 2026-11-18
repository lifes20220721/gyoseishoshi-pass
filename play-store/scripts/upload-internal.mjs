import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'com.gyoseishoshipass.app';
const apiRoot = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;

// Keep this transport injectable so verification never needs credentials or a real upload.
export async function uploadDraft({ request, bundle, versionName }) {
  const edit = await request({ method: 'POST', url: `${apiRoot}/edits`, data: {} });
  if (!edit.data?.id) throw new Error('Google Play did not return an edit ID.');
  const editUrl = `${apiRoot}/edits/${encodeURIComponent(edit.data.id)}`;
  let committed = false;
  try {
    const track = await request({ method: 'GET', url: `${editUrl}/tracks/internal` });
    if ((track.data?.releases || []).some(release => release.status !== 'draft')) {
      throw new Error('内部テストに配信済みリリースがあります。既存配信を変更しないため停止しました。');
    }
    const uploaded = await request({
      method: 'POST',
      url: `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}/edits/${encodeURIComponent(edit.data.id)}/bundles?uploadType=media`,
      headers: { 'content-type': 'application/octet-stream' },
      data: bundle
    });
    const code = Number(uploaded.data?.versionCode);
    if (!Number.isInteger(code) || code <= 0) throw new Error('アップロード後のversionCodeを取得できませんでした。');
    await request({
      method: 'PUT', url: `${editUrl}/tracks/internal`,
      data: { track: 'internal', releases: [{
        name: versionName, versionCodes: [String(code)], status: 'draft',
        releaseNotes: [{ language: 'ja-JP', text: '無料100問・プレミアム全1000問、科目別の続きから再開に対応。' }]
      }] }
    });
    await request({ method: 'POST', url: `${editUrl}:validate`, data: {} });
    await request({ method: 'POST', url: `${editUrl}:commit`, data: {} });
    committed = true;
    return code;
  } finally {
    if (!committed) await request({ method: 'DELETE', url: editUrl }).catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--upload-draft')) throw new Error('使用方法: node scripts/upload-internal.mjs [--upload-draft]');
  const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'twa-manifest.json'), 'utf8'));
  if (manifest.packageId !== packageName) throw new Error('パッケージ名が一致しません。');
  const bundlePath = path.join(projectDir, 'app-release-bundle.aab');
  const info = await fs.stat(bundlePath);
  if (info.size === 0) throw new Error('AABが空です。');
  console.log(`確認: ${packageName} / ${manifest.appVersionName} / ${info.size} bytes`);
  if (!args.includes('--upload-draft')) {
    console.log('ローカル確認完了。外部送信は行っていません。送信時は npm run upload:internal を実行してください。');
    return;
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS にPlay Console権限付きサービスアカウントのJSONファイルのパスを指定してください。');
  }
  const { GoogleAuth } = await import('google-auth-library');
  const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] }).getClient();
  const code = await uploadDraft({
    request: options => client.request(options),
    bundle: await fs.readFile(bundlePath), versionName: manifest.appVersionName
  });
  console.log(`内部テスト下書きへ登録しました: versionCode ${code}。テスター配信は開始していません。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // Do not print request headers, tokens, or credential objects.
    console.error('停止:', error.response?.data?.error?.message || error.message);
    process.exitCode = 1;
  });
}
