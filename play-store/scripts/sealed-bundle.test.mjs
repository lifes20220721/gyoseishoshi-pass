import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { sealBundle, openBundle } from './sealed-bundle.mjs';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const credentials = {
  type: 'service_account', client_email: 'gyosei-play-uploader@shihoshoshi-pass-ci.iam.gserviceaccount.com',
  private_key_id: 'test', private_key: pair.privateKey.export({ format: 'pem', type: 'pkcs8' })
};
const publicKey = pair.publicKey.export({ format: 'pem', type: 'spki' });
const bundle = Buffer.from('signed AAB fixture');

test('only the matching account key can decrypt the intact bundle', () => {
  const envelope = sealBundle(bundle, { test: publicKey }, 2);
  assert.deepEqual(openBundle(envelope, credentials, 2), bundle);
  assert(!JSON.stringify(envelope).includes(credentials.private_key));
  assert.throws(() => openBundle(envelope, { ...credentials, private_key_id: 'different' }, 2));
  assert.throws(() => openBundle(envelope, { ...credentials, client_email: 'other@example.com' }, 2));
});

test('ciphertext and version tampering are rejected', () => {
  const envelope = sealBundle(bundle, { test: publicKey }, 2);
  const altered = Buffer.from(envelope.ciphertext, 'base64');
  altered[0] ^= 1;
  assert.throws(() => openBundle({ ...envelope, ciphertext: altered.toString('base64') }, credentials, 2));
  assert.throws(() => openBundle({ ...envelope, versionCode: 3 }, credentials, 2));
});
