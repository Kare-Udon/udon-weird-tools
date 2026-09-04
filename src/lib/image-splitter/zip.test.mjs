import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStoreZip } from './zip.ts';

test('createStoreZip creates an ordered UTF-8 STORE archive with matching CRC and lengths', async () => {
  const files = [
    new File([new TextEncoder().encode('first')], '../旅行/第一.png', { type: 'image/png' }),
    new File([new TextEncoder().encode('second')], '第二.png', { type: 'image/png' }),
  ];

  const zip = await createStoreZip(files, { sourceName: '../旅行.png' });
  assert.equal(zip.name, '旅行-split.zip');
  assert.equal(zip.type, 'application/zip');
  assert.ok(zip.size > 0);

  const archive = parseStoreZip(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(archive.entries.map((entry) => entry.name), ['第一.png', '第二.png']);
  assert.deepEqual(archive.entries.map((entry) => new TextDecoder().decode(entry.data)), ['first', 'second']);
  assert.ok(archive.entries.every((entry) => entry.method === 0));
  assert.ok(archive.entries.every((entry) => entry.utf8));
  assert.ok(archive.entries.every((entry) => entry.compressedSize === entry.uncompressedSize));
  assert.ok(archive.entries.every((entry) => entry.crc === crc32(entry.data)));
  assert.equal(archive.centralDirectoryOffset, archive.localDataEnd);
});

test('createStoreZip sanitizes traversal names, preserves duplicates with suffixes, and enforces ZIP limits', async () => {
  const files = [
    new File([new Uint8Array([1])], '../../same.png', { type: 'image/png' }),
    new File([new Uint8Array([2])], 'same.png', { type: 'image/png' }),
  ];
  const zip = await createStoreZip(files, { sourceName: 'output' });
  const archive = parseStoreZip(new Uint8Array(await zip.arrayBuffer()));
  assert.deepEqual(archive.entries.map((entry) => entry.name), ['same.png', 'same-2.png']);
  assert.ok(archive.entries.every((entry) => !entry.name.includes('/') && !entry.name.includes('\\')));
  assert.ok(archive.entries.every((entry) => entry.name !== '.' && entry.name !== '..'));

  await assert.rejects(
    () => createStoreZip([new File([new Uint8Array([1, 2, 3])], 'a.png')], { maxBytes: 20 }),
    (error) => error.code === 'zip-too-large',
  );
});

test('createStoreZip stops before reading files when cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => createStoreZip([new File([new Uint8Array([1])], 'a.png')], { signal: controller.signal }),
    (error) => error.code === 'cancelled',
  );
});

function parseStoreZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  assert.equal(centralOffset + centralSize, eocd);

  const entries = [];
  let localOffset = 0;
  let centralCursor = centralOffset;
  let localDataEnd = 0;
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(localOffset, true), 0x04034b50);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decodeUtf8(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.slice(dataStart, dataStart + localCompressedSize);
    localDataEnd = dataStart + localCompressedSize;

    assert.equal(view.getUint32(centralCursor, true), 0x02014b50);
    const centralFlags = view.getUint16(centralCursor + 8, true);
    const centralMethod = view.getUint16(centralCursor + 10, true);
    const centralCrc = view.getUint32(centralCursor + 16, true);
    const centralCompressedSize = view.getUint32(centralCursor + 20, true);
    const centralUncompressedSize = view.getUint32(centralCursor + 24, true);
    const centralNameLength = view.getUint16(centralCursor + 28, true);
    const centralExtraLength = view.getUint16(centralCursor + 30, true);
    const centralCommentLength = view.getUint16(centralCursor + 32, true);
    const centralLocalOffset = view.getUint32(centralCursor + 42, true);
    const centralName = decodeUtf8(bytes.subarray(centralCursor + 46, centralCursor + 46 + centralNameLength));

    assert.equal(localName, centralName);
    assert.equal(localFlags, centralFlags);
    assert.equal(localMethod, centralMethod);
    assert.equal(localCrc, centralCrc);
    assert.equal(localCompressedSize, centralCompressedSize);
    assert.equal(centralLocalOffset, localOffset);
    entries.push({
      name: centralName,
      data,
      method: centralMethod,
      crc: centralCrc,
      compressedSize: centralCompressedSize,
      uncompressedSize: centralUncompressedSize,
      utf8: (centralFlags & 0x0800) !== 0,
    });

    localOffset = dataStart + localCompressedSize;
    centralCursor += 46 + centralNameLength + centralExtraLength + centralCommentLength;
  }

  assert.equal(eocd >= 0, true);
  return { entries, centralDirectoryOffset: centralOffset, localDataEnd };
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
}));
