import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { normalizeVoskModelArchive } from './vosk-archive.ts';
import { getVoskTimelineModel, voskTimelineModels } from './vosk.ts';

test('exposes Vosk timeline models for every supported speech language', () => {
  assert.deepEqual(
    voskTimelineModels.map((option) => [option.language, option.modelUrl ? new URL(option.modelUrl).pathname.split('/').at(-1) : null]),
    [
      ['english', 'vosk-model-small-en-us-0.15.tar.gz'],
      ['chinese', 'vosk-model-small-cn-0.3.tar.gz'],
      ['japanese', 'vosk-model-small-ja-0.22.zip'],
      ['korean', 'vosk-model-small-ko-0.22.zip'],
    ],
  );
});

test('returns the matching Vosk timeline model for a language', () => {
  assert.equal(getVoskTimelineModel('chinese').name, 'Vosk Small ZH');
});

test('converts official Vosk ZIP layout into vosk-browser tar.gz layout', async () => {
  const zip = createStoredZip({
    'vosk-model-small-ja-0.22/am/final.mdl': 'model',
    'vosk-model-small-ja-0.22/conf/model.conf': 'config',
  });
  const normalized = await normalizeVoskModelArchive(new Blob([zip], { type: 'application/zip' }), 'zip');
  const tar = gunzipSync(new Uint8Array(await normalized.arrayBuffer()));

  assert.deepEqual(readTarFileNames(tar), ['model/', 'model/am/', 'model/conf/', 'model/am/final.mdl', 'model/conf/model.conf']);
});

function createStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, value] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const data = new TextEncoder().encode(value);
    const local = new Uint8Array(30 + nameBytes.byteLength + data.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.byteLength);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.byteLength;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, centralParts.length, true);
  eocdView.setUint16(10, centralParts.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralOffset, true);

  return concatBytes([...localParts, ...centralParts, eocd]);
}

function readTarFileNames(tar) {
  const names = [];
  for (let offset = 0; offset < tar.byteLength; offset += 512) {
    const name = readTarString(tar, offset, 100);
    if (!name) break;
    names.push(name);
    const size = Number.parseInt(readTarString(tar, offset + 124, 12).replace(/\0/g, '').trim(), 8);
    offset += Math.ceil(size / 512) * 512;
  }
  return names;
}

function readTarString(bytes, offset, length) {
  const slice = bytes.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end >= 0 ? slice.subarray(0, end) : slice);
}

function concatBytes(chunks) {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
