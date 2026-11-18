import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadDraft } from './upload-internal.mjs';

function transport({ releases = [], failValidation = false } = {}) {
  const calls = [];
  const request = async options => {
    calls.push(options);
    if (options.url.endsWith('/edits')) return { data: { id: 'test-edit' } };
    if (options.method === 'GET') return { data: { releases } };
    if (options.url.includes('uploadType=media')) return { data: { versionCode: 2 } };
    if (failValidation && options.url.endsWith(':validate')) throw new Error('validation failed');
    return { data: {} };
  };
  return { calls, request };
}

test('upload commits only a validated internal draft', async () => {
  const mock = transport();
  assert.equal(await uploadDraft({ request: mock.request, bundle: Buffer.from('test'), versionName: '1.1.0' }), 2);
  const track = mock.calls.find(call => call.method === 'PUT');
  assert.equal(track.data.track, 'internal');
  assert.equal(track.data.releases[0].status, 'draft');
  assert.deepEqual(track.data.releases[0].versionCodes, ['2']);
  assert(mock.calls.at(-2).url.endsWith(':validate'));
  assert(mock.calls.at(-1).url.endsWith(':commit'));
});

test('validation failure discards the edit without committing', async () => {
  const mock = transport({ failValidation: true });
  await assert.rejects(uploadDraft({ request: mock.request, bundle: Buffer.from('test'), versionName: '1.1.0' }));
  assert.equal(mock.calls.at(-1).method, 'DELETE');
  assert(!mock.calls.some(call => call.url.endsWith(':commit')));
});

test('an existing distributed internal release is preserved', async () => {
  const mock = transport({ releases: [{ status: 'completed' }] });
  await assert.rejects(uploadDraft({ request: mock.request, bundle: Buffer.from('test'), versionName: '1.1.0' }));
  assert(!mock.calls.some(call => call.url.includes('uploadType=media')));
  assert.equal(mock.calls.at(-1).method, 'DELETE');
});
