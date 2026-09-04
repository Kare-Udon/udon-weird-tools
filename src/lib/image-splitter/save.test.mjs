import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSaveLock, detectSaveCapabilities, saveAllImages, saveOneImage } from './save.ts';

test('detectSaveCapabilities uses the actual File[] passed to canShare', () => {
  const files = [
    new File(['one'], 'one.png', { type: 'image/png' }),
    new File(['two'], 'two.png', { type: 'image/png' }),
  ];
  let received;
  const capabilities = detectSaveCapabilities(files, {
    platform: {
      canShare: (data) => {
        received = data.files;
        return true;
      },
      share: async () => {},
      showDirectoryPicker: async () => ({}),
      showSaveFilePicker: async () => ({}),
      download: () => {},
    },
    zip: new File(['zip'], 'all.zip', { type: 'application/zip' }),
  });

  assert.deepEqual(received, files);
  assert.equal(capabilities.canShareFiles, true);
  assert.equal(capabilities.canPickDirectory, true);
  assert.equal(capabilities.canPickFile, true);
  assert.equal(capabilities.canDownload, true);
  assert.equal(capabilities.hasPreparedZip, true);
});

test('mobile save shares the complete File[] exactly once and never claims album persistence', async () => {
  const files = [
    new File(['one'], 'one.png', { type: 'image/png' }),
    new File(['two'], 'two.png', { type: 'image/png' }),
  ];
  const shareCalls = [];
  let downloadCount = 0;
  const result = await saveAllImages(files, {
    preference: 'mobile',
    platform: {
      canShare: (data) => data.files.length === 2 && data.files.every((file, index) => file === files[index]),
      share: async (data) => shareCalls.push(data),
      download: () => {
        downloadCount += 1;
      },
    },
  });

  assert.equal(shareCalls.length, 1);
  assert.deepEqual(shareCalls[0].files, files);
  assert.deepEqual(result, {
    status: 'handed-to-system',
    method: 'share',
    attempted: 2,
    written: 0,
    confirmedWritten: false,
    errorCode: null,
    canUsePreparedZip: false,
  });
  assert.equal(downloadCount, 0);
});

test('mobile batch share cancellation returns cancelled and does not fall back to download', async () => {
  let downloadCount = 0;
  const result = await saveAllImages([new File(['x'], 'x.png', { type: 'image/png' })], {
    preference: 'mobile',
    zip: new File(['zip'], 'all.zip', { type: 'application/zip' }),
    platform: {
      canShare: () => true,
      share: async () => {
        throw new DOMException('user cancelled', 'AbortError');
      },
      download: () => {
        downloadCount += 1;
      },
    },
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.errorCode, 'save-cancelled');
  assert.equal(downloadCount, 0);
});

test('share rejection is a separate failure and does not silently switch to ZIP or download', async () => {
  let downloadCount = 0;
  const result = await saveOneImage(new File(['x'], 'x.png', { type: 'image/png' }), {
    preference: 'mobile',
    zip: new File(['zip'], 'all.zip', { type: 'application/zip' }),
    platform: {
      canShare: () => true,
      share: async () => {
        throw new Error('share rejected');
      },
      download: () => {
        downloadCount += 1;
      },
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'share-failed');
  assert.equal(result.canUsePreparedZip, true);
  assert.equal(downloadCount, 0);
});

test('mobile without batch share reports a capability failure and leaves ZIP as an explicit UI route', async () => {
  let downloadCount = 0;
  const zip = new File(['zip'], 'all.zip', { type: 'application/zip' });
  const result = await saveAllImages([new File(['x'], 'x.png', { type: 'image/png' })], {
    preference: 'mobile',
    zip,
    platform: {
      download: () => {
        downloadCount += 1;
      },
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'batch-share-unavailable');
  assert.equal(result.canUsePreparedZip, true);
  assert.equal(downloadCount, 0);

  const zipResult = await saveAllImages([new File(['x'], 'x.png', { type: 'image/png' })], {
    preference: 'mobile',
    action: 'zip',
    zip,
    platform: {
      download: () => {
        downloadCount += 1;
      },
    },
  });
  assert.equal(zipResult.status, 'handed-to-system');
  assert.equal(zipResult.method, 'zip-download');
  assert.equal(downloadCount, 1);
});

test('desktop directory save starts picker before any await, avoids overwrite, and reports partial failures', async () => {
  const files = [
    new File(['one'], '旅行-01.png', { type: 'image/png' }),
    new File(['two'], '旅行-02.png', { type: 'image/png' }),
    new File(['three'], '旅行-03.png', { type: 'image/png' }),
  ];
  const existing = new Set(['旅行-01.png']);
  const created = [];
  const writes = [];
  let pickerResolve;
  let pickerCalls = 0;
  const directory = {
    kind: 'directory',
    async getFileHandle(name, options) {
      if (!options?.create) {
        if (existing.has(name)) return { kind: 'file' };
        throw new DOMException('missing', 'NotFoundError');
      }
      if (existing.has(name)) throw new Error(`overwrite attempted: ${name}`);
      existing.add(name);
      created.push(name);
      return {
        kind: 'file',
        async createWritable() {
          return {
            write: async (file) => {
              if (name === '旅行-02.png') throw new Error('disk full');
              writes.push([name, file.name]);
            },
            close: async () => {},
          };
        },
      };
    },
  };
  const platform = {
    showDirectoryPicker: () => {
      pickerCalls += 1;
      return new Promise((resolve) => {
        pickerResolve = resolve;
      });
    },
  };

  const pending = saveAllImages(files, { preference: 'desktop', platform });
  assert.equal(pickerCalls, 1);
  pickerResolve(directory);
  const result = await pending;

  assert.equal(result.status, 'partial');
  assert.equal(result.method, 'directory');
  assert.equal(result.written, 2);
  assert.equal(result.attempted, 3);
  assert.equal(result.errorCode, 'directory-partial');
  assert.deepEqual(created, ['旅行-01-2.png', '旅行-02.png', '旅行-03.png']);
  assert.deepEqual(writes, [['旅行-01-2.png', '旅行-01.png'], ['旅行-03.png', '旅行-03.png']]);
});

test('single desktop picker cancellation does not trigger a download fallback', async () => {
  let downloadCount = 0;
  const result = await saveOneImage(new File(['x'], 'x.png', { type: 'image/png' }), {
    preference: 'desktop',
    platform: {
      showSaveFilePicker: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
      download: () => {
        downloadCount += 1;
      },
    },
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(result.errorCode, 'save-cancelled');
  assert.equal(downloadCount, 0);
});

test('successful single-file picker reports actual write only after close', async () => {
  const writes = [];
  const result = await saveOneImage(new File(['x'], '../x.png', { type: 'image/png' }), {
    preference: 'desktop',
    platform: {
      showSaveFilePicker: async (options) => ({
        createWritable: async () => ({
          write: async (file) => writes.push([options.suggestedName, file.name]),
          close: async () => {},
        }),
      }),
    },
  });

  assert.equal(result.status, 'written');
  assert.equal(result.method, 'file-picker');
  assert.deepEqual(result.writtenNames, ['x.png']);
  assert.deepEqual(writes, [['x.png', '../x.png']]);
});

test('save lock prevents duplicate triggers and releases after the first operation finishes', async () => {
  const lock = createSaveLock();
  let resolveShare;
  const first = saveOneImage(new File(['x'], 'x.png', { type: 'image/png' }), {
    preference: 'mobile',
    lock,
    platform: {
      canShare: () => true,
      share: () => new Promise((resolve) => {
        resolveShare = resolve;
      }),
    },
  });
  const duplicate = await saveOneImage(new File(['y'], 'y.png', { type: 'image/png' }), {
    preference: 'mobile',
    lock,
    platform: {
      canShare: () => true,
      share: async () => assert.fail('duplicate must not call share'),
    },
  });

  assert.equal(duplicate.status, 'failed');
  assert.equal(duplicate.errorCode, 'save-busy');
  resolveShare();
  assert.equal((await first).status, 'handed-to-system');

  const next = await saveOneImage(new File(['z'], 'z.png', { type: 'image/png' }), {
    preference: 'mobile',
    lock,
    platform: {
      canShare: () => true,
      share: async () => {},
    },
  });
  assert.equal(next.status, 'handed-to-system');
});
