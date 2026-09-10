import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const originalGlobals = {
  Worker: getGlobal('Worker'),
  isSecureContext: getGlobal('isSecureContext'),
  showDirectoryPicker: getGlobal('showDirectoryPicker'),
  FileSystemDirectoryHandle: getGlobal('FileSystemDirectoryHandle'),
  FileSystemFileHandle: getGlobal('FileSystemFileHandle'),
};

let workerPlan = {};
const workerInstances = [];

defineGlobal('Worker', function FakeWorkerFactory(...args) {
  return new FakeWorker(...args);
});
defineGlobal('isSecureContext', true);
defineGlobal('showDirectoryPicker', async () => new MemoryDirectory('picked'));
const FakeDirectoryHandle = class FakeDirectoryHandle {};
FakeDirectoryHandle.prototype.getFileHandle = () => {};
FakeDirectoryHandle.prototype.getDirectoryHandle = () => {};
defineGlobal('FileSystemDirectoryHandle', FakeDirectoryHandle);
const FakeFileHandle = class FakeFileHandle {};
FakeFileHandle.prototype.createWritable = () => {};
defineGlobal('FileSystemFileHandle', FakeFileHandle);

const { extractToDirectory, isStreamingSupported } = await import('./browser.ts?unitypackage-browser-tests');

after(() => {
  restoreGlobal('Worker', originalGlobals.Worker);
  restoreGlobal('showDirectoryPicker', originalGlobals.showDirectoryPicker);
  restoreGlobal('FileSystemDirectoryHandle', originalGlobals.FileSystemDirectoryHandle);
  restoreGlobal('FileSystemFileHandle', originalGlobals.FileSystemFileHandle);
  if (originalGlobals.isSecureContext === undefined) deleteGlobal('isSecureContext');
  else defineGlobal('isSecureContext', originalGlobals.isSecureContext);
});

test('能力检测要求安全上下文、gzip、Worker 与目录/写入 API', () => {
  assert.equal(isStreamingSupported(), true);
  const fileHandleConstructor = getGlobal('FileSystemFileHandle');
  deleteGlobal('FileSystemFileHandle');
  assert.equal(isStreamingSupported(), false);
  defineGlobal('FileSystemFileHandle', fileHandleConstructor);
  assert.equal(isStreamingSupported(), true);
  defineGlobal('isSecureContext', false);
  assert.equal(isStreamingSupported(), false);
  defineGlobal('isSecureContext', true);
});

test('adapter completes scan and extract passes only after operation acknowledgements', async () => {
  workerPlan = {};
  const root = new MemoryDirectory('root');
  const progress = [];
  const result = await extractToDirectory(new File(['fake gzip'], 'sample.unitypackage'), root, {
    onProgress: (value) => progress.push(value),
  });

  assert.deepEqual(result, {
    directoryName: result.directoryName,
    filesWritten: 1,
    bytesWritten: 3,
    warnings: ['unknown-member-ignored'],
  });
  assert.match(result.directoryName, /^sample-[a-z0-9]+$/);
  assert.ok(progress.some((value) => value.phase === 'scanning'));
  assert.ok(progress.some((value) => value.phase === 'extracting' && value.filesWritten === 1));
  const output = root.directories.get(result.directoryName);
  const assets = output.directories.get('Assets');
  const file = assets.files.get('test.bin');
  assert.equal(file.writer.closed, true);
  assert.deepEqual(concat(file.writer.chunks), new TextEncoder().encode('abc'));
  assert.equal(workerInstances.at(-1).chunkAcks > 0, true);
});

test('input transfer chunks are explicitly capped instead of trusting File.stream chunk sizes', async () => {
  workerPlan = {};
  const root = new MemoryDirectory('root');
  const result = await extractToDirectory(new File([new Uint8Array(160_000)], 'large.unitypackage'), root);
  const worker = workerInstances.at(-1);
  assert.ok(result.directoryName.startsWith('large-'));
  assert.ok(worker.chunkAcks > 2);
  assert.ok(worker.maxChunkBytes <= 64 * 1024);
});

test('scan cancellation releases control waits and does not create an output directory', async () => {
  workerPlan = {};
  const root = new MemoryDirectory('root');
  const controller = new AbortController();
  await assert.rejects(
    () => extractToDirectory(new File(['fake gzip'], 'cancel.unitypackage'), root, {
      signal: controller.signal,
      onProgress: (value) => {
        if (value.phase === 'scanning') controller.abort();
      },
    }),
    (error) => error.code === 'cancelled' && error.directoryName === undefined,
  );
  assert.equal(root.directories.size, 0);
});

test('write cancellation waits for a delayed writer and reports the partial directory', async () => {
  const controller = new AbortController();
  const state = {};
  workerPlan = {
    createWriter: () => new DelayedWriter(state, { onWriteStarted: () => controller.abort() }),
  };
  const root = new MemoryDirectory('root');
  await assert.rejects(
    () => extractToDirectory(new File(['fake gzip'], 'write-cancel.unitypackage'), root, { signal: controller.signal }),
    (error) => error.code === 'cancelled' && error.directoryName?.startsWith('write-cancel-') && state.writer.aborted === true,
  );
});

test('delayed createWritable is aborted after cancellation instead of reviving the task', async () => {
  const controller = new AbortController();
  const state = {};
  workerPlan = {
    createWriter: () => new DelayedWriter(state, { onOpenStarted: () => controller.abort(), delayOpen: true }),
  };
  const root = new MemoryDirectory('root');
  await assert.rejects(
    () => extractToDirectory(new File(['fake gzip'], 'open-cancel.unitypackage'), root, { signal: controller.signal }),
    (error) => error.code === 'cancelled' && error.directoryName?.startsWith('open-cancel-') && state.writer.aborted === true,
  );
});

test('write failure aborts the writer and preserves the partial directory name', async () => {
  const state = {};
  workerPlan = {
    createWriter: () => new DelayedWriter(state, { writeError: new Error('disk full') }),
  };
  const root = new MemoryDirectory('root');
  await assert.rejects(
    () => extractToDirectory(new File(['fake gzip'], 'failed.unitypackage'), root),
    (error) => error.code === 'write-failed' && error.directoryName?.startsWith('failed-') && state.writer.aborted === true,
  );
});

test('close cancellation is observed before counting the file as written', async () => {
  const controller = new AbortController();
  const state = {};
  workerPlan = {
    createWriter: () => new DelayedWriter(state, { onCloseStarted: () => controller.abort(), delayClose: true }),
  };
  const root = new MemoryDirectory('root');
  await assert.rejects(
    () => extractToDirectory(new File(['fake gzip'], 'close-cancel.unitypackage'), root, { signal: controller.signal }),
    (error) => error.code === 'cancelled' && error.directoryName?.startsWith('close-cancel-') && error.filesWritten === 0,
  );
});

class FakeWorker {
  constructor() {
    this.listeners = { message: [], error: [] };
    this.plan = workerPlan;
    this.pass = null;
    this.waitingOperation = null;
    this.nextOperation = 1;
    this.chunkAcks = 0;
    this.maxChunkBytes = 0;
    this.terminated = false;
    workerInstances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }

  postMessage(message) {
    if (this.terminated) return;
    if (message.kind === 'abort') {
      this.terminated = true;
      return;
    }
    if (message.kind === 'start') {
      this.pass = message.pass;
      this.emit({ kind: 'ready', pass: message.pass });
      return;
    }
    if (message.kind === 'chunk') {
      this.chunkAcks += 1;
      this.maxChunkBytes = Math.max(this.maxChunkBytes, message.buffer.byteLength);
      this.emit({ kind: 'chunk-accepted' });
      return;
    }
    if (message.kind === 'finish') {
      if (this.pass === 'scan') {
        this.emit({
          kind: 'scan-complete',
          index: {
            entries: [{ groupId: 'guid', kind: 'file', path: 'Assets/test.bin', size: 3 }],
            warnings: ['unknown-member-ignored'],
            outputBytes: 3,
          },
        });
      } else {
        this.sendNextOperation();
      }
      return;
    }
    if (message.kind === 'operation-error') {
      this.emit({ kind: 'error', code: message.code ?? 'write-failed', detail: message.detail });
      return;
    }
    if (message.kind === 'operation-ok' && message.id === this.waitingOperation?.id) {
      const completed = this.waitingOperation.kind;
      this.waitingOperation = null;
      if (completed === 'file-open') {
        const bytes = new TextEncoder().encode('abc');
        this.waitingOperation = { id: this.nextOperation++, kind: 'file-data' };
        this.emit({ kind: 'file-data', id: this.waitingOperation.id, buffer: bytes.buffer });
      } else if (completed === 'file-data') {
        this.waitingOperation = { id: this.nextOperation++, kind: 'file-close' };
        this.emit({ kind: 'file-close', id: this.waitingOperation.id });
      } else {
        this.emit({ kind: 'extract-complete', filesWritten: 1, bytesWritten: 3, warnings: ['unknown-member-ignored'] });
      }
    }
  }

  terminate() {
    this.terminated = true;
  }

  emit(message) {
    queueMicrotask(() => {
      if (this.terminated) return;
      for (const listener of this.listeners.message) listener({ data: message });
    });
  }

  sendNextOperation() {
    this.waitingOperation = { id: this.nextOperation++, kind: 'file-open' };
    this.emit({ kind: 'file-open', id: this.waitingOperation.id, path: 'Assets/test.bin', size: 3 });
  }
}

class MemoryDirectory {
  constructor(name) {
    this.name = name;
    this.directories = new Map();
    this.files = new Map();
  }

  async getDirectoryHandle(name, options = {}) {
    const existing = this.directories.get(name);
    if (!options.create) {
      if (existing) return existing;
      if (this.files.has(name)) throw new DOMException('file exists', 'TypeMismatchError');
      throw new DOMException('missing', 'NotFoundError');
    }
    if (this.files.has(name)) throw new DOMException('file exists', 'TypeMismatchError');
    if (existing) return existing;
    const directory = new MemoryDirectory(name);
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(name, options = {}) {
    const existing = this.files.get(name);
    if (!options.create) {
      if (existing) return existing;
      if (this.directories.has(name)) throw new DOMException('directory exists', 'TypeMismatchError');
      throw new DOMException('missing', 'NotFoundError');
    }
    if (this.directories.has(name)) throw new DOMException('directory exists', 'TypeMismatchError');
    if (existing) return existing;
    const file = new MemoryFileHandle(name);
    this.files.set(name, file);
    return file;
  }
}

class MemoryFileHandle {
  constructor(name) {
    this.name = name;
    this.writer = null;
  }

  async createWritable() {
    const writer = workerPlan.createWriter ? workerPlan.createWriter() : new DelayedWriter({}, {});
    this.writer = writer;
    writer.options.onOpenStarted?.();
    if (writer.options.delayOpen) {
      return new Promise((resolve) => queueMicrotask(() => resolve(writer)));
    }
    return writer;
  }
}

class DelayedWriter {
  constructor(state, options) {
    this.chunks = [];
    this.closed = false;
    this.aborted = false;
    this.options = options;
    if (state) state.writer = this;
  }

  async write(data) {
    this.options.onWriteStarted?.();
    if (this.options.writeError) throw this.options.writeError;
    if (this.options.delayWrite) {
      await new Promise((resolve, reject) => {
        this.pendingWrite = { resolve, reject };
      });
    }
    this.chunks.push(new Uint8Array(data));
  }

  async close() {
    this.options.onCloseStarted?.();
    if (this.options.delayClose) {
      await new Promise((resolve, reject) => {
        this.pendingClose = { resolve, reject };
      });
    }
    this.closed = true;
  }

  async abort() {
    this.aborted = true;
    this.pendingWrite?.reject(new DOMException('aborted', 'AbortError'));
    this.pendingClose?.reject(new DOMException('aborted', 'AbortError'));
  }
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
