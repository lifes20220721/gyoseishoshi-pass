import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const privateDir = path.join(projectDir, 'private');
const credentialsPath = path.join(privateDir, 'upload-key-credentials.txt');
const keystorePath = path.join(privateDir, 'upload-keystore.jks');
const javaHome = process.env.JAVA_HOME;

if (!javaHome) throw new Error('JAVA_HOMEにJDK 17を指定してください。');
if (!process.env.ANDROID_HOME) throw new Error('ANDROID_HOMEにAndroid SDKを指定してください。');
if (!fs.existsSync(credentialsPath) || !fs.existsSync(keystorePath)) {
  throw new Error('private/にアップロード署名鍵とパスワードファイルが必要です。');
}

const secrets = Object.fromEntries(
  fs.readFileSync(credentialsPath, 'utf8').trim().split(/\n/).map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  })
);
const env = { ...process.env, ...secrets };

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: projectDir, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};

run(path.join(projectDir, 'gradlew'), ['bundleRelease']);
run(path.join(javaHome, 'bin', 'jarsigner'), [
  '-sigalg', 'SHA256withRSA',
  '-digestalg', 'SHA-256',
  '-keystore', keystorePath,
  '-storepass:env', 'BUBBLEWRAP_KEYSTORE_PASSWORD',
  '-keypass:env', 'BUBBLEWRAP_KEY_PASSWORD',
  '-signedjar', path.join(projectDir, 'app-release-bundle.aab'),
  path.join(projectDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab'),
  'gyoseishoshipass-upload'
]);

console.log('作成完了:', path.join(projectDir, 'app-release-bundle.aab'));

