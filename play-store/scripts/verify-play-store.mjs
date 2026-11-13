import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(projectDir, '..');
const required = [
  'twa-manifest.json',
  'app/build.gradle',
  'store_icon.png',
  'store-listing-ja.md'
];

for (const file of required) {
  if (!fs.existsSync(path.join(projectDir, file))) throw new Error(`不足ファイル: ${file}`);
}

const gradle = fs.readFileSync(path.join(projectDir, 'app', 'build.gradle'), 'utf8');
const twa = JSON.parse(fs.readFileSync(path.join(projectDir, 'twa-manifest.json'), 'utf8'));
const assetLinks = JSON.parse(fs.readFileSync(path.join(repoRoot, '.well-known', 'assetlinks.json'), 'utf8'));
const privacy = fs.readFileSync(path.join(repoRoot, 'privacy.html'), 'utf8');

const checks = [
  [twa.packageId === 'com.gyoseishoshipass.app', 'パッケージ名'],
  [twa.appVersionCode >= 1, 'versionCode'],
  [/compileSdkVersion 36/.test(gradle) && /targetSdkVersion 36/.test(gradle), 'API 36'],
  [/minSdkVersion 24/.test(gradle), 'Minimum API 24'],
  [!gradle.includes('127.0.0.1') && gradle.includes('https://gyoseishoshipass.com/'), '公開URL'],
  [assetLinks.some((entry) => entry?.target?.package_name === twa.packageId), 'Digital Asset Links'],
  [privacy.includes('Androidアプリ'), 'Android向けプライバシー記載']
];

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`検証失敗: ${label}`);
  console.log(`OK: ${label}`);
}

const bundle = path.join(projectDir, 'app-release-bundle.aab');
if (fs.existsSync(bundle)) {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) throw new Error('AAB署名検証にはJAVA_HOMEが必要です。');
  // Android upload keys are intentionally self-signed; verify the archive signature without
  // treating the expected self-signed certificate warning as a failure.
  const verified = spawnSync(path.join(javaHome, 'bin', 'jarsigner'), ['-verify', bundle], { encoding: 'utf8' });
  if (verified.status !== 0) throw new Error(verified.stderr || verified.stdout || 'AAB署名検証に失敗しました。');
  console.log(`OK: 署名済みAAB (${fs.statSync(bundle).size} bytes)`);
} else {
  console.log('SKIP: ローカルの署名済みAABは未生成です。');
}

