import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatStorageBytes,
  inferKnownToolKey,
  inferModelName,
  inferStorageGroup,
  inferStorageToolSlug,
} from './storage-manager.ts';
import {
  parseToolFileStoragePath,
  parseToolLocalStorageKey,
  toolCacheName,
  toolLocalStorageKey,
  toolModelCachePath,
  toolOpfsModelPath,
} from './local/storage-contract.ts';

test('builds and parses contract localStorage keys', () => {
  const key = toolLocalStorageKey('json-cleaner', 'data', 'recent-run');

  assert.equal(key, 'weird-tools:tool:json-cleaner:data:recent-run');
  assert.deepEqual(parseToolLocalStorageKey(key), {
    toolSlug: 'json-cleaner',
    kind: 'data',
    entryId: 'recent-run',
  });
});

test('builds and parses contract model file paths', () => {
  const cachePath = toolModelCachePath('speech-to-text', 'moonshine-tiny-en', 'onnx/model.onnx');
  const opfsPath = toolOpfsModelPath('speech-to-text', 'moonshine-tiny-en', 'onnx/model.onnx');

  assert.equal(toolCacheName('speech-to-text'), 'weird-tools:tool:speech-to-text:files');
  assert.equal(cachePath, '/__tool-storage/speech-to-text/models/moonshine-tiny-en/onnx/model.onnx');
  assert.equal(opfsPath, 'tools/speech-to-text/models/moonshine-tiny-en/onnx/model.onnx');
  assert.deepEqual(parseToolFileStoragePath(cachePath), {
    toolSlug: 'speech-to-text',
    modelId: 'moonshine-tiny-en',
    relativePath: 'onnx/model.onnx',
    modelRootPath: '__tool-storage/speech-to-text/models/moonshine-tiny-en',
  });
  assert.deepEqual(parseToolFileStoragePath(opfsPath), {
    toolSlug: 'speech-to-text',
    modelId: 'moonshine-tiny-en',
    relativePath: 'onnx/model.onnx',
    modelRootPath: 'tools/speech-to-text/models/moonshine-tiny-en',
  });
});

test('storage manager only infers models from the storage contract', () => {
  assert.equal(inferStorageGroup('/__tool-storage/speech-to-text/models/moonshine-tiny-en/model.onnx'), 'moonshine-tiny-en');
  assert.equal(inferModelName('tools/speech-to-text/models/moonshine-tiny-en/tokenizer.json'), 'moonshine-tiny-en');
  assert.equal(inferStorageGroup('/models/clip-vit-base/weights.bin'), 'site-files');
  assert.equal(inferModelName('https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx'), null);
  assert.equal(inferModelName('/_astro/page.js'), null);
});

test('infers tool keys from contract keys and paths', () => {
  const slugs = ['json-cleaner', 'speech-to-text'];

  assert.equal(inferStorageToolSlug(['weird-tools:tool:json-cleaner:data:recent-run']), 'json-cleaner');
  assert.equal(inferKnownToolKey(['/__tool-storage/speech-to-text/models/moonshine/model.onnx'], slugs), 'speech-to-text');
  assert.equal(inferKnownToolKey(['moonshine-tiny-en'], slugs), null);
});

test('formats storage byte counts with stable units', () => {
  assert.equal(formatStorageBytes(512), '512 B');
  assert.equal(formatStorageBytes(1536), '1.5 KB');
  assert.equal(formatStorageBytes(2 * 1024 * 1024), '2.0 MB');
});
