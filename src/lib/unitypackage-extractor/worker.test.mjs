import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';

test('worker protocol performs two bounded passes and waits for every sink acknowledgement', async () => {
  const originalPostMessage = getGlobal('postMessage');
  const originalOnMessage = getGlobal('onmessage');
  const output = [];
  defineGlobal('postMessage', (message) => output.push(message));
  await import('./worker.ts?unitypackage-worker-protocol');

  const tar = createTar([
    { name: 'guid/asset', data: new TextEncoder().encode('abc'), type: '0' },
    { name: 'guid/pathname', data: new TextEncoder().encode('Assets/test.bin'), type: '0' },
  ]);
  const compressed = gzipSync(tar);
  const operations = [];

  await send({ kind: 'start', pass: 'scan' });
  await waitForMessage(output, (message) => message.kind === 'ready' && message.pass === 'scan');
  for (const chunk of chunks(compressed, [1, 5, 23])) {
    await sendAndPump({ kind: 'chunk', buffer: chunk }, output, operations);
  }
  await send({ kind: 'finish' });
  const scan = await waitForMessage(output, (message) => message.kind === 'scan-complete');
  assert.equal(scan.index.entries[0].path, 'Assets/test.bin');

  await send({ kind: 'start', pass: 'extract' });
  await waitForMessage(output, (message) => message.kind === 'ready' && message.pass === 'extract');
  for (const chunk of chunks(compressed, [7, 2, 31])) {
    await sendAndPump({ kind: 'chunk', buffer: chunk }, output, operations);
  }
  await send({ kind: 'finish' });
  const extracted = await pumpUntil(output, operations, (message) => message.kind === 'extract-complete');

  assert.equal(operations[0].kind, 'file-open');
  assert.equal(operations.at(-1).kind, 'file-close');
  assert.ok(operations.slice(1, -1).every((operation) => operation.kind === 'file-data'));
  assert.deepEqual(concat(operations.filter((operation) => operation.kind === 'file-data').map((operation) => operation.data)), new TextEncoder().encode('abc'));
  assert.deepEqual(extracted, { kind: 'extract-complete', filesWritten: 1, bytesWritten: 3, warnings: [] });

  await send({ kind: 'start', pass: 'scan' });
  await waitForMessage(output, (message) => message.kind === 'ready' && message.pass === 'scan');
  await send({ kind: 'chunk', buffer: Uint8Array.from([1, 2, 3]).buffer });
  await send({ kind: 'finish' });
  const gzipError = await waitForMessage(output, (message) => message.kind === 'error');
  assert.ok(gzipError.code === 'gzip-invalid' || gzipError.code === 'gzip-truncated');

  restoreGlobal('postMessage', originalPostMessage);
  restoreGlobal('onmessage', originalOnMessage);
});

async function send(message) {
  getGlobal('onmessage')({ data: message });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function sendAndPump(message, output, operations) {
  await send(message);
  while (true) {
    const response = await waitForMessage(output, (value) => value.kind === 'chunk-accepted' || value.kind.endsWith?.('directory') || value.kind.startsWith('file-') || value.kind === 'error');
    if (response.kind === 'chunk-accepted') return;
    await acknowledgeOperation(response, operations);
  }
}

async function pumpUntil(output, operations, done) {
  while (true) {
    const message = await waitForMessage(output, (value) => value.kind.startsWith('file-') || value.kind === 'extract-complete' || value.kind === 'error');
    if (message.kind === 'error') throw new Error(`${message.code}: ${message.detail ?? ''}`);
    if (done(message)) return message;
    await acknowledgeOperation(message, operations);
  }
}

async function acknowledgeOperation(message, operations) {
  if (message.kind === 'file-data') {
    operations.push({ kind: message.kind, data: new Uint8Array(message.buffer) });
  } else {
    operations.push({ kind: message.kind });
  }
  await send({ kind: 'operation-ok', id: message.id });
}

async function waitForMessage(output, predicate) {
  const deadline = Date.now() + 2_000;
  while (true) {
    const index = output.findIndex(predicate);
    if (index >= 0) return output.splice(index, 1)[0];
    if (Date.now() >= deadline) throw new Error('timed out waiting for worker message');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function* chunks(bytes, sizes) {
  let offset = 0;
  let index = 0;
  while (offset < bytes.byteLength) {
    const size = sizes[index % sizes.length];
    const copy = bytes.slice(offset, offset + size);
    offset += size;
    index += 1;
    yield copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
  }
}

function createTar(entries) {
  const blocks = [];
  for (const entry of entries) {
    const header = new Uint8Array(512);
    writeString(header, 0, 100, entry.name);
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 124, 12, entry.data.byteLength);
    header.fill(0x20, 148, 156);
    header[156] = entry.type.charCodeAt(0);
    writeString(header, 257, 6, 'ustar\0');
    writeOctal(header, 148, 8, header.reduce((sum, value) => sum + value, 0));
    blocks.push(header, entry.data);
    const padding = (512 - (entry.data.byteLength % 512)) % 512;
    if (padding) blocks.push(new Uint8Array(padding));
  }
  blocks.push(new Uint8Array(1024));
  return concat(blocks);
}

function writeString(target, offset, length, value) {
  target.set(new TextEncoder().encode(value).slice(0, length), offset);
}

function writeOctal(target, offset, length, value) {
  writeString(target, offset, length - 1, value.toString(8).padStart(length - 1, '0'));
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

function restoreGlobal(name, value) {
  if (value === undefined) deleteGlobal(name);
  else defineGlobal(name, value);
}

function getGlobal(name) {
  return Reflect.get(globalThis, name);
}

function defineGlobal(name, value) {
  Reflect.defineProperty(globalThis, name, { configurable: true, value, writable: true });
}

function deleteGlobal(name) {
  Reflect.deleteProperty(globalThis, name);
}
