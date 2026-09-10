import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import {
  UNITYPACKAGE_STREAMING_LIMITS,
  extractUnityPackageTar,
  scanUnityPackageTar,
} from './parser.ts';

const encoder = new TextEncoder();

test('scans and extracts asset-before-pathname packages across arbitrary chunks', async () => {
  const tar = createTar([
    { name: 'guid-a/asset', data: encoder.encode('hello 世界'), type: '0' },
    { name: 'guid-a/asset.meta', data: encoder.encode('ignored metadata'), type: '0' },
    { name: 'guid-a/pathname', data: encoder.encode('Assets/旅行.txt\n'), type: '0' },
    { name: 'guid-b/pathname', data: encoder.encode('Assets/Empty Folder/'), type: '0' },
  ]);
  const chunks = chunkBytes(tar, [1, 7, 19, 3, 511, 2]);

  const index = await scanUnityPackageTar(chunks);

  assert.deepEqual(index.entries, [
    { groupId: 'guid-b', kind: 'directory', path: 'Assets/Empty Folder', size: 0 },
    { groupId: 'guid-a', kind: 'file', path: 'Assets/旅行.txt', size: encoder.encode('hello 世界').byteLength },
  ]);

  const output = new Map();
  const directories = [];
  await extractUnityPackageTar(chunkBytes(tar, [5, 13, 2, 97]), index, {
    makeDirectory: async (path) => directories.push(path),
    openFile: async (entry) => {
      output.set(entry.path, []);
    },
    writeFileChunk: async (chunk) => {
      const current = [...output.values()].at(-1);
      current.push(new Uint8Array(chunk));
    },
    closeFile: async () => {},
  });

  assert.deepEqual(directories, ['Assets/Empty Folder']);
  assert.deepEqual([...output.keys()], ['Assets/旅行.txt']);
  assert.deepEqual(concat(output.get('Assets/旅行.txt')), encoder.encode('hello 世界'));
});

test('does not retain a complete asset and awaits the sink for every chunk', async () => {
  const asset = Uint8Array.from({ length: 32 * 1024 }, (_, index) => index % 251);
  const tar = createTar([
    { name: 'guid/asset', data: asset, type: '0' },
    { name: 'guid/pathname', data: encoder.encode('Assets/big.bin'), type: '0' },
  ]);
  let inFlight = 0;
  let maxInFlight = 0;
  let chunksWritten = 0;
  let largestChunk = 0;
  const releases = [];
  let completed = false;

  const extraction = extractUnityPackageTar(chunkBytes(tar, [1024]), await scanUnityPackageTar(chunkBytes(tar, [333])), {
    makeDirectory: async () => {},
    openFile: async () => {},
    writeFileChunk: async (chunk) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      chunksWritten += 1;
      largestChunk = Math.max(largestChunk, chunk.byteLength);
      await new Promise((resolve) => {
        releases.push(resolve);
      });
      inFlight -= 1;
    },
    closeFile: async () => {},
  });

  extraction.then(() => {
    completed = true;
  });
  await waitFor(() => releases.length === 1);
  assert.equal(chunksWritten, 1);
  assert.equal(maxInFlight, 1);
  assert.ok(largestChunk <= 1024);
  while (!completed) {
    const release = await waitForValue(() => releases.shift());
    release();
    if (!completed) await waitFor(() => releases.length === 1 || completed);
  }
  await extraction;
  assert.ok(chunksWritten > 1);
  assert.equal(maxInFlight, 1);
});

test('rejects unsafe output paths before extraction', async () => {
  for (const pathname of ['../escape.txt', '/absolute.txt', 'C:\\absolute.txt', 'Assets/a/../../b']) {
    const tar = createTar([
      { name: 'guid/asset', data: encoder.encode('x'), type: '0' },
      { name: 'guid/pathname', data: encoder.encode(pathname), type: '0' },
    ]);
    await assert.rejects(
      () => scanUnityPackageTar(chunkBytes(tar, [17])),
      (error) => error.code === 'path-unsafe',
    );
  }
});

test('rejects duplicate paths and file-directory conflicts', async () => {
  const duplicate = createTar([
    { name: 'one/asset', data: encoder.encode('one'), type: '0' },
    { name: 'one/pathname', data: encoder.encode('Assets/same.txt'), type: '0' },
    { name: 'two/asset', data: encoder.encode('two'), type: '0' },
    { name: 'two/pathname', data: encoder.encode('Assets/same.txt'), type: '0' },
  ]);
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(duplicate, [512])), (error) => error.code === 'duplicate-path');

  const conflict = createTar([
    { name: 'one/asset', data: encoder.encode('one'), type: '0' },
    { name: 'one/pathname', data: encoder.encode('Assets/Folder'), type: '0' },
    { name: 'two/asset', data: encoder.encode('two'), type: '0' },
    { name: 'two/pathname', data: encoder.encode('Assets/Folder/child.txt'), type: '0' },
  ]);
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(conflict, [97])), (error) => error.code === 'path-conflict');
});

test('checks file ancestors without depending on same-root sort adjacency', async () => {
  const entries = [];
  for (let index = 0; index < 180; index += 1) {
    entries.push({ name: `guid-${index}/asset`, data: encoder.encode(String(index)), type: '0' });
    entries.push({ name: `guid-${index}/pathname`, data: encoder.encode(`Assets/root-${String(index).padStart(3, '0')}.txt`), type: '0' });
  }
  entries.push({ name: 'parent/asset', data: encoder.encode('parent'), type: '0' });
  entries.push({ name: 'parent/pathname', data: encoder.encode('Assets/root'), type: '0' });
  entries.push({ name: 'child/asset', data: encoder.encode('child'), type: '0' });
  entries.push({ name: 'child/pathname', data: encoder.encode('Assets/root/child.txt'), type: '0' });
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(createTar(entries), [503, 17, 29])), (error) => error.code === 'path-conflict');
});

test('rejects truncated tar and invalid tar headers', async () => {
  const valid = createTar([
    { name: 'guid/pathname', data: encoder.encode('Assets/file.txt'), type: '0' },
  ]);
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(valid.slice(0, -1024), [11])), (error) => error.code === 'tar-truncated');

  const invalid = valid.slice();
  invalid[0] ^= 0xff;
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(invalid, [512])), (error) => error.code === 'tar-invalid-header');
});

test('enforces explicit index and path budgets', async () => {
  const longPath = `Assets/${'x'.repeat(UNITYPACKAGE_STREAMING_LIMITS.maxPathBytes)}`;
  const tar = createTar([
    { name: 'guid/pathname', data: encoder.encode(longPath), type: '0' },
  ]);
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(tar, [23])), (error) => error.code === 'path-too-long');
});

test('gzip input can be decompressed without changing the bounded tar parser contract', async () => {
  const tar = createTar([
    { name: 'guid/asset', data: encoder.encode('compressed'), type: '0' },
    { name: 'guid/pathname', data: encoder.encode('Assets/compressed.txt'), type: '0' },
  ]);
  const compressed = gzipSync(tar);
  const decompressed = new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const index = await scanUnityPackageTar(chunkBytes(decompressed, [2, 5, 31]));
  assert.equal(index.entries[0].path, 'Assets/compressed.txt');
});

test('accepts standard explicit tar directories and leading ./ member prefixes', async () => {
  const tar = createTar([
    { name: './', data: new Uint8Array(), type: '5' },
    { name: './guid/', data: new Uint8Array(), type: '5' },
    { name: './guid/pathname', data: encoder.encode('Assets/Directory'), type: '0' },
  ]);
  const index = await scanUnityPackageTar(chunkBytes(tar, [29, 7, 512]));
  assert.deepEqual(index.entries, [{ groupId: 'guid', kind: 'directory', path: 'Assets/Directory', size: 0 }]);
  const invalidRootFile = createTar([{ name: './', data: new Uint8Array(), type: '0' }]);
  await assert.rejects(() => scanUnityPackageTar(chunkBytes(invalidRootFile, [29])), (error) => error.code === 'path-unsafe');
});

function chunkBytes(bytes, sizes) {
  return (async function* () {
    let offset = 0;
    let index = 0;
    while (offset < bytes.byteLength) {
      const size = sizes[index % sizes.length];
      yield bytes.slice(offset, offset + size);
      offset += size;
      index += 1;
    }
  })();
}

function createTar(entries) {
  const blocks = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    writeString(header, 0, 100, entry.name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, entry.data.byteLength);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    header[156] = entry.type.charCodeAt(0);
    writeString(header, 257, 6, 'ustar\0');
    writeString(header, 263, 2, '00');
    const checksum = header.reduce((sum, value) => sum + value, 0);
    writeOctal(header, 148, 8, checksum);
    blocks.push(header, entry.data);
    const padding = (512 - (entry.data.byteLength % 512)) % 512;
    if (padding) blocks.push(new Uint8Array(padding));
  }
  blocks.push(new Uint8Array(1024));
  return concat(blocks);
}

function writeString(target, offset, length, value) {
  const bytes = encoder.encode(value);
  target.set(bytes.slice(0, length), offset);
}

function writeOctal(target, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  writeString(target, offset, length - 1, text);
  target[offset + length - 1] = 0;
}

function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for parser backpressure test');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function waitForValue(read) {
  let value = read();
  await waitFor(() => {
    value ??= read();
    return value !== undefined;
  });
  return value;
}
