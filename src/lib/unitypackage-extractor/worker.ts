import {
  asExtractionError,
  errorDetail,
  extractionError,
  isAbortError,
  UnityPackageExtractionError,
  type ExtractionErrorCode,
} from './errors.ts';
import {
  extractUnityPackageTar,
  scanUnityPackageTar,
  type UnityPackageExtractionSink,
  type UnityPackageIndex,
} from './parser.ts';

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null;
  postMessage: (message: WorkerOutboundMessage, transfer?: Transferable[]) => void;
};

type WorkerInboundMessage =
  | { kind: 'start'; pass: 'scan' | 'extract' }
  | { kind: 'chunk'; buffer: ArrayBuffer }
  | { kind: 'finish' }
  | { kind: 'abort' }
  | { kind: 'operation-ok'; id: number }
  | { kind: 'operation-error'; id: number; code?: string; detail?: string };

type WorkerOutboundMessage =
  | { kind: 'ready'; pass: 'scan' | 'extract' }
  | { kind: 'chunk-accepted' }
  | { kind: 'scan-complete'; index: UnityPackageIndex }
  | { kind: 'make-directory'; id: number; path: string }
  | { kind: 'file-open'; id: number; path: string; size: number }
  | { kind: 'file-data'; id: number; buffer: ArrayBuffer }
  | { kind: 'file-close'; id: number }
  | { kind: 'extract-complete'; filesWritten: number; bytesWritten: number; warnings: string[] }
  | { kind: 'error'; code: ExtractionErrorCode; detail?: string };

type PendingOperation = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

type ActivePass = {
  pass: 'scan' | 'extract';
  inputWriter: WritableStreamDefaultWriter<BufferSource> | null;
  runPromise: Promise<void>;
  pending: Map<number, PendingOperation>;
  nextOperationId: number;
  finished: boolean;
  failed: boolean;
  aborted: boolean;
};

const scope = globalThis as unknown as WorkerScope;
let activePass: ActivePass | null = null;
let savedIndex: UnityPackageIndex | null = null;

scope.onmessage = (event) => {
  void handleMessage(event.data).catch((error: unknown) => {
    failActive(error);
  });
};

async function handleMessage(message: WorkerInboundMessage): Promise<void> {
  if (message.kind === 'start') {
    await startPass(message.pass);
    return;
  }
  if (message.kind === 'chunk') {
    const pass = requireActivePass();
    if (pass.finished || pass.failed || pass.aborted || !pass.inputWriter) {
      throw extractionError('worker-failed', 'pass is not accepting chunks');
    }
    await pass.inputWriter.write(new Uint8Array(message.buffer));
    scope.postMessage({ kind: 'chunk-accepted' });
    return;
  }
  if (message.kind === 'finish') {
    const pass = requireActivePass();
    if (pass.finished) return;
    pass.finished = true;
    try {
      await pass.inputWriter?.close();
      await pass.runPromise;
    } catch (error) {
      if (error instanceof UnityPackageExtractionError) throw error;
      throw mapGzipError(error);
    }
    return;
  }
  if (message.kind === 'abort') {
    abortActivePass();
    return;
  }
  const pass = requireActivePass();
  const operation = pass.pending.get(message.id);
  if (!operation) return;
  pass.pending.delete(message.id);
  if (message.kind === 'operation-ok') {
    operation.resolve();
    return;
  }
  const code = isExtractionErrorCode(message.code) ? message.code : 'write-failed';
  operation.reject(new UnityPackageExtractionError(code, message.detail));
}

async function startPass(passName: 'scan' | 'extract'): Promise<void> {
  if (activePass && !activePass.finished && !activePass.failed && !activePass.aborted) {
    throw extractionError('worker-failed', 'previous pass is still running');
  }
  if (passName === 'extract' && !savedIndex) throw extractionError('worker-failed', 'scan pass is missing');

  const state: ActivePass = {
    pass: passName,
    inputWriter: null,
    runPromise: Promise.resolve(),
    pending: new Map(),
    nextOperationId: 1,
    finished: false,
    failed: false,
    aborted: false,
  };
  activePass = state;
  const decompressor = new DecompressionStream('gzip');
  state.inputWriter = decompressor.writable.getWriter();
  state.runPromise = runPass(state, decompressor.readable);
  state.runPromise.catch((error: unknown) => {
    failActive(error, state);
  });
  scope.postMessage({ kind: 'ready', pass: passName });
}

async function runPass(state: ActivePass, stream: ReadableStream<Uint8Array>): Promise<void> {
  const chunks = streamChunks(stream);
  try {
    if (state.pass === 'scan') {
      const index = await scanUnityPackageTar(chunks);
      savedIndex = index;
      if (!state.aborted) scope.postMessage({ kind: 'scan-complete', index });
      return;
    }

    const sink = createExtractionSink(state);
    const stats = await extractUnityPackageTar(chunks, savedIndex as UnityPackageIndex, sink);
    if (!state.aborted) {
      scope.postMessage({ kind: 'extract-complete', filesWritten: stats.filesWritten, bytesWritten: stats.bytesWritten, warnings: savedIndex?.warnings ?? [] });
    }
  } catch (error) {
    if (state.aborted || isAbortError(error)) throw extractionError('cancelled');
    if (error instanceof UnityPackageExtractionError) throw error;
    throw mapGzipError(error);
  }
}

async function* streamChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      if (result.value.byteLength > 0) yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function createExtractionSink(state: ActivePass): UnityPackageExtractionSink {
  return {
    makeDirectory: (path) => waitForHostOperation(state, (id) => ({ kind: 'make-directory', id, path })),
    openFile: (entry) => waitForHostOperation(state, (id) => ({ kind: 'file-open', id, path: entry.path, size: entry.size })),
    writeFileChunk: (chunk) => {
      const copy = new Uint8Array(chunk);
      return waitForHostOperation(state, (id) => ({ kind: 'file-data', id, buffer: copy.buffer }), [copy.buffer]);
    },
    closeFile: () => waitForHostOperation(state, (id) => ({ kind: 'file-close', id })),
  };
}

function waitForHostOperation(
  state: ActivePass,
  createMessage: (id: number) => WorkerOutboundMessage,
  transfer: Transferable[] = [],
): Promise<void> {
  const id = state.nextOperationId;
  state.nextOperationId += 1;
  return new Promise<void>((resolve, reject) => {
    state.pending.set(id, { resolve, reject });
    scope.postMessage(createMessage(id), transfer);
  });
}

function requireActivePass(): ActivePass {
  if (!activePass) throw extractionError('worker-failed', 'no active pass');
  return activePass;
}

function abortActivePass(): void {
  const pass = activePass;
  if (!pass) return;
  pass.aborted = true;
  void pass.inputWriter?.abort(extractionError('cancelled'));
  for (const operation of pass.pending.values()) operation.reject(extractionError('cancelled'));
  pass.pending.clear();
}

function failActive(error: unknown, state: ActivePass | null = activePass): void {
  if (!state || state.failed || state.aborted) return;
  state.failed = true;
  const normalized = error instanceof UnityPackageExtractionError ? error : asExtractionError(error, 'worker-failed');
  for (const operation of state.pending.values()) operation.reject(normalized);
  state.pending.clear();
  try {
    void state.inputWriter?.abort(normalized);
  } catch {
    // 解压失败后流可能已经关闭，清理操作只能尽力而为。
  }
  scope.postMessage({ kind: 'error', code: normalized.code, detail: normalized.detail });
}

function mapGzipError(error: unknown): UnityPackageExtractionError {
  const detail = errorDetail(error);
  const text = (detail ?? '').toLowerCase();
  const code = /truncat|unexpected end|end of file|eof/.test(text) ? 'gzip-truncated' : 'gzip-invalid';
  return extractionError(code, detail);
}

function isExtractionErrorCode(value: string | undefined): value is ExtractionErrorCode {
  return value === 'unsupported-browser' || value === 'missing-file' || value === 'invalid-file' || value === 'input-too-large' ||
    value === 'cancelled' || value === 'permission-denied' || value === 'gzip-invalid' || value === 'gzip-truncated' ||
    value === 'tar-invalid-header' || value === 'tar-invalid-boundary' || value === 'tar-truncated' || value === 'path-unsafe' ||
    value === 'path-too-long' || value === 'empty-path' || value === 'duplicate-group-member' || value === 'duplicate-path' ||
    value === 'path-conflict' || value === 'missing-pathname' || value === 'missing-asset' || value === 'empty-package' ||
    value === 'entry-too-large' || value === 'index-budget-exceeded' || value === 'expanded-size-limit' || value === 'output-budget-exceeded' ||
    value === 'output-directory-failed' || value === 'file-exists' || value === 'write-failed' || value === 'worker-failed' || value === 'unknown';
}
