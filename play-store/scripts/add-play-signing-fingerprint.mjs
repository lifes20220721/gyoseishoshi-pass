import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fingerprint = (process.argv[2] || '').trim().toUpperCase();
const pattern = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

if (!pattern.test(fingerprint)) {
  console.error('Play ConsoleのSHA-256フィンガープリントを AA:BB:... 形式で指定してください。');
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const assetLinksPath = path.join(repoRoot, '.well-known', 'assetlinks.json');
const statements = JSON.parse(fs.readFileSync(assetLinksPath, 'utf8'));
const target = statements.find((entry) => entry?.target?.package_name === 'com.gyoseishoshipass.app');

if (!target) {
  throw new Error('assetlinks.jsonに対象パッケージがありません。');
}

const fingerprints = target.target.sha256_cert_fingerprints;
if (!fingerprints.includes(fingerprint)) fingerprints.push(fingerprint);
fs.writeFileSync(assetLinksPath, `${JSON.stringify(statements, null, 2)}\n`);
console.log('Play App Signingの証明書フィンガープリントを追加しました。');

