import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeImageFile,
  encodeSlices,
  inspectImageHeader,
} from './browser.ts';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('inspectImageHeader recognizes static PNG and reports actual dimensions', () => {
  const header = createPngHeader(13, 7);

  assert.deepEqual(inspectImageHeader(header), {
    format: 'png',
    width: 13,
    height: 7,
    animated: false,
    orientation: 1,
  });
});

test('inspectImageHeader reads JPEG EXIF orientation and nested AVIF ispe dimensions', () => {
  assert.deepEqual(inspectImageHeader(createJpegHeader(640, 480, 6)), {
    format: 'jpeg',
    width: 640,
    height: 480,
    animated: false,
    orientation: 6,
  });

  assert.deepEqual(inspectImageHeader(createAvifHeader(1920, 1080)), {
    format: 'avif',
    width: 1920,
    height: 1080,
    animated: false,
    orientation: 1,
  });

  const heic = createBox('ftyp', concat([
    new TextEncoder().encode('heic'),
    new Uint8Array(4),
    new TextEncoder().encode('mif1'),
  ]));
  assert.equal(inspectImageHeader(heic), null);
});

test('inspectImageHeader rejects animated PNG and animated WebP markers', () => {
  assert.equal(inspectImageHeader(createPngHeader(2, 2, true)).animated, true);

  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode('RIFF'), 0);
  webp.set(new TextEncoder().encode('WEBP'), 8);
  webp.set(new TextEncoder().encode('VP8X'), 12);
  webp[16] = 10;
  webp[20] = 2;
  webp[24] = 1;
  assert.equal(inspectImageHeader(webp).animated, true);
});

test('decodeImageFile uses oriented ImageBitmap, makes a small preview, and releases every URL/source', async () => {
  const file = new File([createPngHeader(4, 2)], '../旅行.png', { type: 'application/octet-stream' });
  const revoked = [];
  const drawCalls = [];
  let bitmapClosed = 0;
  let previewCanvas;
  const previewContext = {
    imageSmoothingEnabled: true,
    drawImage: (...args) => {
      assert.equal(previewContext.imageSmoothingEnabled, true, '低分辨率预览应保留缩放平滑');
      drawCalls.push(args);
    },
  };

  const decoded = await decodeImageFile(file, {
    imageBitmapFactory: async (input, options) => {
      assert.equal(input, file);
      assert.equal(options.imageOrientation, 'from-image');
      return {
        width: 4,
        height: 2,
        close: () => {
          bitmapClosed += 1;
        },
      };
    },
    previewCanvasFactory: () => {
      previewCanvas = {
        width: 0,
        height: 0,
        getContext: () => previewContext,
        toBlob: (callback, type) => callback(new Blob([createPngHeader(2, 1)], { type })),
      };
      return previewCanvas;
    },
    objectUrlApi: {
      create: (blob) => {
        assert.equal(blob.type, 'image/png');
        return 'preview-url';
      },
      revoke: (url) => revoked.push(url),
    },
    previewMaxDimension: 2,
  });

  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.previewUrl, 'preview-url');
  assert.deepEqual(drawCalls[0].slice(1), [0, 0, 4, 2, 0, 0, 2, 1]);

  decoded.release();
  decoded.release();

  assert.equal(bitmapClosed, 1);
  assert.deepEqual(revoked, ['preview-url']);
  assert.equal(previewCanvas.width, 0);
  assert.equal(previewCanvas.height, 0);
});

test('decodeImageFile rasterizes the already oriented HTMLImage fallback once and releases its source canvas', async () => {
  const file = new File([createJpegHeader(3, 2, 6)], 'fallback.jpg', { type: 'image/jpeg' });
  const revoked = [];
  const sourceDrawCalls = [];
  const sourceContextRequests = [];
  const sourceSamplingStates = [];
  let decodedCount = 0;
  const image = {
    // Chromium 的 natural 尺寸已经是 EXIF 定向后的尺寸。
    naturalWidth: 2,
    naturalHeight: 3,
    width: 2,
    height: 3,
    src: '',
    decode: async () => {
      decodedCount += 1;
    },
  };
  const sourceContext = {
    imageSmoothingEnabled: true,
    drawImage: (...args) => {
      sourceSamplingStates.push(sourceContext.imageSmoothingEnabled);
      sourceDrawCalls.push(args);
    },
  };
  const sourceCanvas = {
    width: 0,
    height: 0,
    getContext: (kind, options) => {
      sourceContextRequests.push({ kind, options });
      return sourceContext;
    },
  };

  const decoded = await decodeImageFile(file, {
    imageBitmapFactory: async () => {
      throw new Error('bitmap unavailable');
    },
    imageElementFactory: () => image,
    sourceCanvasFactory: (width, height) => {
      assert.deepEqual([width, height], [2, 3]);
      return sourceCanvas;
    },
    previewCanvasFactory: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (callback, type) => callback(new Blob([createPngHeader(2, 3)], { type })),
    }),
    objectUrlApi: {
      create: () => 'source-url',
      revoke: (url) => revoked.push(url),
    },
  });

  assert.equal(decoded.source, sourceCanvas);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 3);
  assert.equal(decodedCount, 1);
  assert.equal(image.src, 'source-url');
  assert.deepEqual(sourceContextRequests, [{ kind: '2d', options: { alpha: true, willReadFrequently: true } }]);
  assert.deepEqual(sourceSamplingStates, [false]);
  assert.deepEqual(sourceDrawCalls, [[image, 0, 0, 2, 3]]);

  decoded.release();
  assert.equal(image.src, '');
  assert.equal(sourceCanvas.width, 0);
  assert.equal(sourceCanvas.height, 0);
  assert.deepEqual(revoked, ['source-url', decoded.previewUrl]);
});

test('decodeImageFile validates actual format and image limits before allocating a decoder', async () => {
  const unsupported = new File([Uint8Array.from([71, 73, 70, 56, 57, 97])], 'fake.png', { type: 'image/png' });
  await assert.rejects(
    () => decodeImageFile(unsupported, { imageBitmapFactory: async () => assert.fail('decoder must not run') }),
    (error) => error.code === 'unsupported-format',
  );

  const tooWide = new File([createPngHeader(8193, 1)], 'wide.png', { type: 'image/png' });
  await assert.rejects(
    () => decodeImageFile(tooWide, { imageBitmapFactory: async () => assert.fail('decoder must not run') }),
    (error) => error.code === 'image-too-large',
  );
});

for (const [width, height] of [[6000, 4000], [4000, 6000]]) {
  test(`decodeImageFile 接受 ${width}×${height} 的 2400 万像素图像并保留原尺寸`, async () => {
    const file = new File([createJpegHeader(width, height, 1)], 'camera.jpg', { type: 'image/jpeg' });
    const drawCalls = [];
    let closed = 0;
    const source = { width, height, close: () => { closed += 1; } };
    const preview = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...args) => drawCalls.push(args) }),
      toBlob: (callback, type) => callback(new Blob([createPngHeader(preview.width, preview.height)], { type })),
    };
    const decoded = await decodeImageFile(file, {
      imageBitmapFactory: async () => source,
      previewCanvasFactory: () => preview,
      objectUrlApi: { create: () => 'preview-url', revoke: () => {} },
    });

    try {
      assert.deepEqual([decoded.width, decoded.height], [width, height]);
      assert.equal(decoded.source, source);
      assert.deepEqual([source.width, source.height], [width, height]);
      const previewSize = width > height ? [1024, 683] : [683, 1024];
      assert.deepEqual(drawCalls, [[source, 0, 0, width, height, 0, 0, ...previewSize]]);
    } finally {
      decoded.release();
    }
    assert.equal(closed, 1);
  });
}

test('decodeImageFile 在解码前拒绝超过 2400 万像素的 JPEG 和 PNG', async () => {
  for (const header of [createJpegHeader(6000, 4001, 1), createPngHeader(6000, 4001)]) {
    const file = new File([header], 'over-limit', { type: 'application/octet-stream' });
    await assert.rejects(
      () => decodeImageFile(file, { imageBitmapFactory: async () => assert.fail('超限图像不应启动解码器') }),
      (error) => error.code === 'image-too-large' && error.detail === '6000x4001',
    );
  }
});

test('decodeImageFile 对实际解码尺寸执行 2400 万像素限制并释放超限图像', async () => {
  const file = new File([createJpegHeader(6000, 4000, 1)], 'camera.jpg', { type: 'image/jpeg' });
  let closed = 0;
  await assert.rejects(
    () => decodeImageFile(file, {
      imageBitmapFactory: async () => ({ width: 6000, height: 4001, close: () => { closed += 1; } }),
      imageElementFactory: () => assert.fail('尺寸超限不能通过后备解码绕过'),
      previewCanvasFactory: () => assert.fail('尺寸超限不应生成预览'),
    }),
    (error) => error.code === 'image-too-large' && error.detail === '6000x4001',
  );
  assert.equal(closed, 1);
});

test('encodeSlices reuses one canvas, preserves source rectangles, names files stably, and validates PNG dimensions', async () => {
  const drawCalls = [];
  const canvasSizes = [];
  const contextRequests = [];
  const samplingStates = [];
  let disposed = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  const context = {
    imageSmoothingEnabled: true,
    drawImage: (...args) => {
      samplingStates.push(context.imageSmoothingEnabled);
      drawCalls.push(args);
    },
  };
  const canvas = {
    get width() { return canvasWidth; },
    set width(value) {
      canvasWidth = value;
      // 真实 Canvas 调整尺寸会重置绘制状态，即使拿到的是同一 context。
      context.imageSmoothingEnabled = true;
    },
    get height() { return canvasHeight; },
    set height(value) {
      canvasHeight = value;
      context.imageSmoothingEnabled = true;
    },
    getContext: (kind, options) => {
      contextRequests.push({ kind, options });
      return context;
    },
    toBlob: (callback, type) => {
      callback(new Blob([createPngHeader(canvas.width, canvas.height)], { type }));
    },
  };
  const source = { width: 9, height: 5 };

  const files = await encodeSlices(
    { width: 9, height: 5, source },
    [
      { index: 0, x: 0, y: 0, width: 4, height: 5 },
      { index: 1, x: 4, y: 0, width: 5, height: 5 },
    ],
    '../旅行.png',
    {
      canvasFactory: (width, height) => {
        canvasSizes.push([width, height]);
        return canvas;
      },
      disposeCanvas: (value) => {
        disposed += 1;
        value.width = 0;
        value.height = 0;
      },
    },
  );

  assert.equal(canvasSizes.length, 1);
  assert.deepEqual(contextRequests, [
    { kind: '2d', options: { alpha: true, willReadFrequently: true } },
    { kind: '2d', options: { alpha: true, willReadFrequently: true } },
  ]);
  assert.deepEqual(samplingStates, [false, false], '每次调整分片尺寸后都必须恢复原尺寸采样设置');
  assert.deepEqual(files.map((file) => [file.name, file.type, file.size]), [
    ['旅行-01.png', 'image/png', files[0].size],
    ['旅行-02.png', 'image/png', files[1].size],
  ]);
  assert.deepEqual(drawCalls.map((args) => args.slice(1)), [
    [0, 0, 4, 5, 0, 0, 4, 5],
    [4, 0, 5, 5, 0, 0, 5, 5],
  ]);
  assert.equal(readPngSize(await files[0].arrayBuffer()).width, 4);
  assert.equal(readPngSize(await files[1].arrayBuffer()).width, 5);
  assert.equal(disposed, 1);
});

test('encodeSlices rejects invalid rectangles and stale/cancelled work without retaining the canvas', async () => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback, type) => callback(new Blob([createPngHeader(canvas.width, canvas.height)], { type })),
  };

  await assert.rejects(
    () => encodeSlices(
      { width: 4, height: 4, source: {} },
      [{ index: 0, x: 0, y: 0, width: 0, height: 4 }],
      'bad.png',
      { canvasFactory: () => canvas },
    ),
    (error) => error.code === 'invalid-slice',
  );

  const controller = new AbortController();
  const disposed = [];
  const cancellingCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback, type) => {
      controller.abort();
      callback(new Blob([createPngHeader(cancellingCanvas.width, cancellingCanvas.height)], { type }));
    },
  };
  await assert.rejects(
    () => encodeSlices(
      { width: 4, height: 4, source: {} },
      [{ index: 0, x: 0, y: 0, width: 4, height: 4 }],
      'cancel.png',
      {
        signal: controller.signal,
        canvasFactory: () => cancellingCanvas,
        disposeCanvas: (value) => disposed.push(value),
      },
    ),
    (error) => error.code === 'cancelled',
  );
  assert.equal(disposed.length, 1);

  await assert.rejects(
    () => encodeSlices(
      { width: 4, height: 4, source: {} },
      [{ index: 0, x: 0, y: 0, width: 4, height: 4 }],
      'stale.png',
      { canvasFactory: () => canvas, isCurrent: () => false },
    ),
    (error) => error.code === 'stale-task',
  );
});

test('encodeSlices enforces the output collection limit without silently reducing image dimensions', async () => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback, type) => callback(new Blob([createPngHeader(canvas.width, canvas.height)], { type })),
  };

  await assert.rejects(
    () => encodeSlices(
      { width: 4, height: 4, source: {} },
      [{ index: 0, x: 0, y: 0, width: 4, height: 4 }],
      'limit.png',
      { canvasFactory: () => canvas, maxOutputBytes: 1 },
    ),
    (error) => error.code === 'output-set-too-large',
  );
});

function createPngHeader(width, height, animated = false) {
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  const chunks = [PNG_SIGNATURE, createPngChunk('IHDR', ihdrData)];
  if (animated) chunks.push(createPngChunk('acTL', new Uint8Array(8)));
  chunks.push(createPngChunk('IEND', new Uint8Array()));
  return concat(chunks);
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
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function readPngSize(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), Array.from(PNG_SIGNATURE));
  assert.equal(new TextDecoder().decode(bytes.subarray(12, 16)), 'IHDR');
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function createJpegHeader(width, height, orientation) {
  const exif = new Uint8Array(32);
  exif.set(new TextEncoder().encode('Exif\0\0'), 0);
  exif.set(new TextEncoder().encode('II'), 6);
  const exifView = new DataView(exif.buffer);
  exifView.setUint16(8, 42, true);
  exifView.setUint32(10, 8, true);
  exifView.setUint16(14, 1, true);
  exifView.setUint16(16, 0x0112, true);
  exifView.setUint16(18, 3, true);
  exifView.setUint32(20, 1, true);
  exifView.setUint16(24, orientation, true);

  const app1 = new Uint8Array(4 + exif.byteLength);
  const app1View = new DataView(app1.buffer);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1View.setUint16(2, exif.byteLength + 2, false);
  app1.set(exif, 4);

  const sof = new Uint8Array(19);
  const sofView = new DataView(sof.buffer);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sofView.setUint16(2, 17, false);
  sof[4] = 8;
  sofView.setUint16(5, height, false);
  sofView.setUint16(7, width, false);
  sof[9] = 3;
  sof[10] = 1;
  sof[11] = 0x11;
  sof[12] = 0;
  sof[13] = 2;
  sof[14] = 0x11;
  sof[15] = 0;
  sof[16] = 3;
  sof[17] = 0x11;
  sof[18] = 0;
  return concat([Uint8Array.from([0xff, 0xd8]), app1, sof]);
}

function createAvifHeader(width, height) {
  const ispePayload = new Uint8Array(12);
  const ispeView = new DataView(ispePayload.buffer);
  ispeView.setUint32(4, width, false);
  ispeView.setUint32(8, height, false);
  const ftyp = createBox('ftyp', concat([
    new TextEncoder().encode('avif'),
    new Uint8Array(4),
    new TextEncoder().encode('mif1'),
  ]));
  const meta = createBox('meta', concat([
    new Uint8Array(4),
    createBox('iprp', createBox('ipco', createBox('ispe', ispePayload))),
  ]));
  return concat([ftyp, meta]);
}

function createBox(type, payload) {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, output.byteLength, false);
  output.set(typeBytes, 4);
  output.set(payload, 8);
  return output;
}
