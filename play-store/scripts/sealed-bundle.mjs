import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { constants, createCipheriv, createDecipheriv, createHash, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageName = 'com.gyoseishoshipass.app';
const accountEmail = 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const aad = envelope => Buffer.from(JSON.stringify({ packageName: envelope.packageName, versionCode: envelope.versionCode, sha256: envelope.sha256 }));

export function sealBundle(bundle, certificates, versionCode) {
  if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error('INVALID_VERSION_CODE');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const envelope = { format: 1, packageName, versionCode, sha256: digest(bundle), iv: iv.toString('base64'), recipients: {} };
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(envelope));
  envelope.ciphertext = Buffer.concat([cipher.update(bundle), cipher.final()]).toString('base64');
  envelope.tag = cipher.getAuthTag().toString('base64');
  for (const [id, certificate] of Object.entries(certificates)) {
    envelope.recipients[id] = publicEncrypt({ key: certificate, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64');
  }
  if (!Object.keys(envelope.recipients).length) throw new Error('NO_PUBLIC_CERTIFICATES');
  return envelope;
}

export function openBundle(envelope, credentials, versionCode) {
  if (envelope.format !== 1 || envelope.packageName !== packageName || envelope.versionCode !== versionCode) throw new Error('WRONG_BUNDLE');
  if (credentials.type !== 'service_account' || credentials.client_email !== accountEmail) throw new Error('WRONG_SERVICE_ACCOUNT');
  const wrappedKey = envelope.recipients?.[credentials.private_key_id];
  if (!wrappedKey) throw new Error('CERTIFICATE_CHANGED_RESEAL_REQUIRED');
  const key = privateDecrypt({ key: credentials.private_key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(wrappedKey, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(aad(envelope));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const bytes = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  if (digest(bytes) !== envelope.sha256) throw new Error('BUNDLE_HASH_MISMATCH');
  return bytes;
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  const manifest = JSON.parse(await fs.readFile(path.join(projectDir, 'twa-manifest.json'), 'utf8'));
  const envelopeFile = path.join(projectDir, '..', '.github', 'play-bundles', `v${manifest.appVersionCode}.sealed.json`);
  const bundleFile = path.join(projectDir, 'app-release-bundle.aab');
  if (mode === 'seal' && file) {
    const bundle = await fs.readFile(bundleFile);
    const certs = JSON.parse(await fs.readFile(file, 'utf8'));
    const envelope = sealBundle(bundle, certs, manifest.appVersionCode);
    await fs.mkdir(path.dirname(envelopeFile), { recursive: true });
    await fs.writeFile(envelopeFile, JSON.stringify(envelope));
    console.log(`Encrypted signed AAB: ${bundle.length} bytes; SHA-256 ${envelope.sha256}`);
    return;
  }
  if (mode === 'open') {
    let credentials;
    try { credentials = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON || ''); }
    catch { throw new Error('INVALID_CREDENTIAL_JSON'); }
    const envelope = JSON.parse(await fs.readFile(envelopeFile, 'utf8'));
    const bundle = openBundle(envelope, credentials, manifest.appVersionCode);
    const privateDir = path.join(projectDir, 'private');
    await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(privateDir, 'workflow-service-account.json'), JSON.stringify(credentials), { mode: 0o600 });
    await fs.writeFile(bundleFile, bundle, { mode: 0o600 });
    console.log(`Signed AAB decrypted and hash verified: ${bundle.length} bytes`);
    return;
  }
  throw new Error('Usage: node scripts/sealed-bundle.mjs seal <public-certificates.json> | open');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Bundle transport failed. Check the certificate, account and bundle version. No credentials were printed.'); process.exitCode = 1; });
}
