import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareImageSplitterArtifacts } from './prepare.ts';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('component preparation keeps PNGs available and completes the ZIP for a stable selection', async () => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      drawImage: () => {},
    }),
    toBlob: (callback, type) => callback(new Blob([createPngHeader(canvas.width, canvas.height)], { type })),
  };
  const filesReady = [];
  const result = await prepareImageSplitterArtifacts({
    decoded: {
      width: 9,
      height: 5,
      source: { width: 9, height: 5 },
      previewUrl: 'preview-url',
      release: () => {},
    },
    slices: [
      { index: 0, x: 0, y: 0, width: 4, height: 5 },
      { index: 1, x: 4, y: 0, width: 5, height: 5 },
    ],
    sourceName: 'stable.png',
    encodeOptions: { canvasFactory: () => canvas },
    onFilesReady: (files) => filesReady.push(files),
  });

  assert.equal(filesReady.length, 1);
  assert.deepEqual(filesReady[0].map((file) => file.type), ['image/png', 'image/png']);
  assert.equal(result.files, filesReady[0]);
  assert.equal(result.zipError, null);
  assert.ok(result.zip instanceof File);
  assert.equal(result.zip.type, 'application/zip');
  assert.deepEqual(Array.from(new Uint8Array(await result.zip.slice(0, 4).arrayBuffer())), [80, 75, 3, 4]);
});

test('component preparation keeps encoded PNGs when ZIP preparation fails', async () => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      drawImage: () => {},
    }),
    toBlob: (callback, type) => callback(new Blob([createPngHeader(canvas.width, canvas.height)], { type })),
  };
  let filesReady = null;
  const result = await prepareImageSplitterArtifacts({
    decoded: {
      width: 9,
      height: 5,
      source: { width: 9, height: 5 },
      previewUrl: 'preview-url',
      release: () => {},
    },
    slices: [
      { index: 0, x: 0, y: 0, width: 4, height: 5 },
      { index: 1, x: 4, y: 0, width: 5, height: 5 },
    ],
    sourceName: 'stable.png',
    encodeOptions: { canvasFactory: () => canvas },
    zipOptions: { maxBytes: 1 },
    onFilesReady: (files) => { filesReady = files; },
  });

  assert.ok(filesReady);
  assert.equal(result.files, filesReady);
  assert.equal(result.files.length, 2);
  assert.equal(result.zip, null);
  assert.equal(result.zipError?.code, 'zip-too-large');
});

function createPngHeader(width, height) {
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  return concat([
    PNG_SIGNATURE,
    createPngChunk('IHDR', ihdrData),
    createPngChunk('IEND', new Uint8Array()),
  ]);
}

function createPngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(12 + data.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.byteLength, false);
  output.set(typeBytes, 4);
  output.set(data, 8);
  return output;
}

function concat(chunks) {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
