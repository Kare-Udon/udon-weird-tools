import {
  asExtractionError,
  errorDetail,
  extractionError,
  isAbortError,
  UnityPackageExtractionError,
  type ExtractionErrorCode,
} from './errors.ts';
import { UNITYPACKAGE_STREAMING_LIMITS, type UnityPackageIndex } from './parser.ts';

export const STREAMING_TRANSFER_CHUNK_BYTES = 64 * 1024;

export type ExtractionProgress = {
  phase: 'scanning' | 'extracting';
  bytesRead: number;
  totalBytes: number;
  filesWritten: number;
};

export type ExtractionResult = {
  directoryName: string;
  filesWritten: number;
  bytesWritten: number;
  warnings: string[];
};

export type ExtractionOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: ExtractionProgress) => void;
};

type WorkerControlMessage =
  | { kind: 'ready'; pass: 'scan' | 'extract' }
  | { kind: 'chunk-accepted' }
  | { kind: 'scan-complete'; index: UnityPackageIndex }
  | { kind: 'extract-complete'; filesWritten: number; bytesWritten: number; warnings: string[] }
  | { kind: 'error'; code: ExtractionErrorCode; detail?: string };

type WorkerOperationMessage =
  | { kind: 'make-directory'; id: number; path: string }
  | { kind: 'file-open'; id: number; path: string; size: number }
  | { kind: 'file-data'; id: number; buffer: ArrayBuffer }
  | { kind: 'file-close'; id: number };

type WorkerMessage = WorkerControlMessage | WorkerOperationMessage;

type ExtractionWorker = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  addEventListener: (type: 'message' | 'error', listener: (event: MessageEvent<WorkerMessage> | ErrorEvent) => void) => void;
  terminate: () => void;
};

type DirectoryHandle = FileSystemDirectoryHandle & {
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
};
type Writable = FileSystemWritableFileStream;

export { EXTRACTION_ERROR_CODES, EXTRACTION_WARNING_CODES, UnityPackageExtractionError } from './errors.ts';
export { UNITYPACKAGE_STREAMING_LIMITS } from './parser.ts';
export type { ExtractionErrorCode } from './errors.ts';

export function isStreamingSupported(): boolean {
  const scope = globalThis as typeof globalThis & {
    isSecureContext?: boolean;
    showDirectoryPicker?: (options?: { mode?: 'readwrite' }) => Promise<DirectoryHandle>;
    DecompressionStream?: typeof DecompressionStream;
    FileSystemDirectoryHandle?: { prototype?: Partial<FileSystemDirectoryHandle> };
    FileSystemFileHandle?: { prototype?: Partial<FileSystemFileHandle> };
  };
  if (scope.isSecureContext !== true) return false;
  if (typeof scope.showDirectoryPicker !== 'function') return false;
  if (typeof scope.DecompressionStream !== 'function') return false;
  if (typeof Worker !== 'function') return false;
  if (typeof File !== 'function' || typeof File.prototype.stream !== 'function' || typeof Blob.prototype.slice !== 'function') return false;
  const directoryPrototype = scope.FileSystemDirectoryHandle?.prototype;
  const filePrototype = scope.FileSystemFileHandle?.prototype;
  if (!directoryPrototype || typeof directoryPrototype.getFileHandle !== 'function') return false;
  if (typeof directoryPrototype.getDirectoryHandle !== 'function') return false;
  if (!filePrototype || typeof filePrototype.createWritable !== 'function') return false;
  try {
    new scope.DecompressionStream('gzip');
  } catch {
    return false;
  }
  return true;
}

export async function chooseOutputDirectory(): Promise<FileSystemDirectoryHandle> {
  const scope = globalThis as typeof globalThis & {
    showDirectoryPicker?: (options?: { mode?: 'readwrite' }) => Promise<DirectoryHandle>;
  };
  if (typeof scope.showDirectoryPicker !== 'function') throw extractionError('unsupported-browser');
  try {
    const directory = await scope.showDirectoryPicker({ mode: 'readwrite' });
    assertDirectoryHandle(directory);
    if (typeof directory.requestPermission === 'function') {
      const permission = await directory.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') throw extractionError('permission-denied');
    }
    return directory;
  } catch (error) {
    if (error instanceof UnityPackageExtractionError) throw error;
    if (isAbortError(error)) throw extractionError('cancelled');
    if (isPermissionError(error)) throw extractionError('permission-denied', errorDetail(error));
    throw extractionError('output-directory-failed', errorDetail(error));
  }
}

export async function extractToDirectory(
  file: File,
  directory: FileSystemDirectoryHandle,
  options: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const signal = options.signal;
  const onProgress = options.onProgress;
  assertNotAborted(signal);
  if (typeof File !== 'function' || !(file instanceof File) || typeof file.stream !== 'function') throw extractionError('invalid-file');
  if (file.size <= 0) throw extractionError('invalid-file', 'empty file');
  if (file.size > UNITYPACKAGE_STREAMING_LIMITS.maxCompressedBytes) {
    throw extractionError('input-too-large', String(UNITYPACKAGE_STREAMING_LIMITS.maxCompressedBytes));
  }
  assertDirectoryHandle(directory);

  const client = new ExtractionWorkerClient(createWorker(), signal);
  let outputDirectory: DirectoryHandle | null = null;
  let directoryName: string | undefined;
  let activeFile: ActiveWritable | null = null;
  let filesWritten = 0;
  let bytesWritten = 0;
  let currentBytesRead = 0;
  const directoryCache = new Map<string, DirectoryHandle>();
  const openingWriters = new Set<Writable>();

  client.setOperationHandler(async (message) => {
    try {
      if (!outputDirectory) throw extractionError('output-directory-failed', 'output directory is not ready');
      if (message.kind === 'make-directory') {
        await ensureDirectoryPath(outputDirectory, message.path.split('/'), directoryCache, signal);
      } else if (message.kind === 'file-open') {
        if (activeFile) throw extractionError('write-failed', 'another file is still open');
        const parts = message.path.split('/');
        const fileName = parts.pop();
        if (!fileName) throw extractionError('path-unsafe', message.path);
        const parent = await ensureDirectoryPath(outputDirectory, parts, directoryCache, signal);
        await assertOutputEntryAbsent(parent, fileName);
        const fileHandle = await parent.getFileHandle(fileName, { create: true });
        const writer = await fileHandle.createWritable();
        openingWriters.add(writer);
        try {
          assertNotAborted(signal);
          activeFile = { path: message.path, size: message.size, bytes: 0, writer };
        } catch (error) {
          await abortWritable(writer);
          throw error;
        } finally {
          openingWriters.delete(writer);
        }
      } else if (message.kind === 'file-data') {
        if (!activeFile) throw extractionError('write-failed', 'file data arrived without a file');
        const data = new Uint8Array(message.buffer);
        await activeFile.writer.write(data);
        assertNotAborted(signal);
        activeFile.bytes += data.byteLength;
        bytesWritten += data.byteLength;
      } else {
        if (!activeFile) throw extractionError('write-failed', 'file close arrived without a file');
        if (activeFile.bytes !== activeFile.size) throw extractionError('write-failed', `size mismatch for ${activeFile.path}`);
        await activeFile.writer.close();
        assertNotAborted(signal);
        filesWritten += 1;
        activeFile = null;
        onProgress?.({ phase: 'extracting', bytesRead: currentBytesRead, totalBytes: file.size, filesWritten });
      }
      client.acknowledgeOperation(message.id);
    } catch (error) {
      await abortWritable(activeFile?.writer);
      activeFile = null;
      client.rejectOperation(message.id, toOperationError(error));
    }
  });

  try {
    const scan = await feedPass(file, client, 'scan', signal, file.size, () => 0, onProgress, (bytes) => {
      currentBytesRead = bytes;
    });
    assertNotAborted(signal);
    const created = await createUniqueOutputDirectory(directory, outputDirectoryName(file.name), signal);
    outputDirectory = created.handle;
    directoryName = created.name;
    directoryCache.clear();
    onProgress?.({ phase: 'extracting', bytesRead: 0, totalBytes: file.size, filesWritten: 0 });
    await feedPass(file, client, 'extract', signal, file.size, () => filesWritten, onProgress, (bytes) => {
      currentBytesRead = bytes;
    });
    assertNotAborted(signal);
    return {
      directoryName,
      filesWritten,
      bytesWritten,
      warnings: [...scan.warnings],
    };
  } catch (error) {
    const normalized = signal?.aborted ? extractionError('cancelled') : asExtractionError(error, 'worker-failed');
    throw new UnityPackageExtractionError(normalized.code, normalized.detail, {
      directoryName,
      filesWritten,
      bytesWritten,
    });
  } finally {
    client.abort();
    const writerBeforeFlights = (activeFile as ActiveWritable | null)?.writer;
    await abortWritable(writerBeforeFlights);
    await Promise.all([...openingWriters].map((writer) => abortWritable(writer)));
    await client.waitForOperations();
    const writerAfterFlights = (activeFile as ActiveWritable | null)?.writer;
    await abortWritable(writerAfterFlights);
    client.dispose();
  }
}

type ActiveWritable = {
  path: string;
  size: number;
  bytes: number;
  writer: Writable;
};

async function feedPass(
  file: File,
  client: ExtractionWorkerClient,
  pass: 'scan' | 'extract',
  signal: AbortSignal | undefined,
  totalBytes: number,
  getFilesWritten: () => number,
  onProgress: ((progress: ExtractionProgress) => void) | undefined,
  onBytesRead: (bytes: number) => void,
): Promise<{ warnings: string[] }> {
  await client.startPass(pass);
  let bytesRead = 0;
  const phase = pass === 'scan' ? 'scanning' : 'extracting';
  while (bytesRead < file.size) {
    assertNotAborted(signal);
    const end = Math.min(file.size, bytesRead + STREAMING_TRANSFER_CHUNK_BYTES);
    const chunk = new Uint8Array(await file.slice(bytesRead, end).arrayBuffer());
    if (chunk.byteLength === 0) throw extractionError('invalid-file', 'file ended before its declared size');
    bytesRead += chunk.byteLength;
    onBytesRead(bytesRead);
    onProgress?.({ phase, bytesRead, totalBytes, filesWritten: getFilesWritten() });
    await client.sendChunk(chunk);
  }
  const result = await client.finishPass(pass);
  return result.kind === 'scan-complete' ? { warnings: result.index.warnings } : { warnings: result.warnings };
}

function createWorker(): ExtractionWorker {
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as ExtractionWorker;
  } catch (error) {
    throw extractionError('worker-failed', errorDetail(error));
  }
}

class ExtractionWorkerClient {
  private readonly worker: ExtractionWorker;
  private readonly signal?: AbortSignal;
  private readonly controlQueue: WorkerControlMessage[] = [];
  private readonly controlWaiters: Array<{
    kind: WorkerControlMessage['kind'];
    resolve: (message: WorkerControlMessage) => void;
    reject: (error: unknown) => void;
  }> = [];
  private operationHandler: ((message: WorkerOperationMessage) => Promise<void>) | null = null;
  private fatalError: UnityPackageExtractionError | null = null;
  private readonly operationFlights = new Set<Promise<void>>();
  private stopped = false;

  constructor(worker: ExtractionWorker, signal?: AbortSignal) {
    this.worker = worker;
    this.signal = signal;
    worker.addEventListener('message', (event) => {
      this.handleMessage(event as MessageEvent<WorkerMessage>);
    });
    worker.addEventListener('error', (event) => {
      this.failAll(extractionError('worker-failed', (event as ErrorEvent).message));
    });
    signal?.addEventListener('abort', () => this.abort(), { once: true });
  }

  setOperationHandler(handler: (message: WorkerOperationMessage) => Promise<void>): void {
    this.operationHandler = handler;
  }

  async startPass(pass: 'scan' | 'extract'): Promise<void> {
    this.throwIfFailed();
    this.worker.postMessage({ kind: 'start', pass });
    await this.waitForControl('ready');
  }

  async sendChunk(chunk: Uint8Array): Promise<void> {
    this.throwIfFailed();
    const buffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    this.worker.postMessage({ kind: 'chunk', buffer }, [buffer]);
    await this.waitForControl('chunk-accepted');
  }

  async finishPass(pass: 'scan' | 'extract'): Promise<ExtractControlResult> {
    this.throwIfFailed();
    this.worker.postMessage({ kind: 'finish' });
    return (pass === 'scan'
      ? await this.waitForControl('scan-complete')
      : await this.waitForControl('extract-complete')) as ExtractControlResult;
  }

  async waitForOperations(): Promise<void> {
    await Promise.allSettled([...this.operationFlights]);
  }

  acknowledgeOperation(id: number): void {
    this.worker.postMessage({ kind: 'operation-ok', id });
  }

  rejectOperation(id: number, error: UnityPackageExtractionError): void {
    this.worker.postMessage({ kind: 'operation-error', id, code: error.code, detail: error.detail });
  }

  abort(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.failAll(extractionError('cancelled'));
    try {
      this.worker.postMessage({ kind: 'abort' });
    } catch {
      // 致命错误后 worker 可能已经被终止。
    }
  }

  dispose(): void {
    this.stopped = true;
    this.failAll(extractionError('cancelled'));
    this.worker.terminate();
  }

  private handleMessage(event: MessageEvent<WorkerMessage>): void {
    const message = event.data;
    if (message.kind === 'make-directory' || message.kind === 'file-open' || message.kind === 'file-data' || message.kind === 'file-close') {
      if (this.stopped) {
        this.rejectOperation(message.id, extractionError('cancelled'));
        return;
      }
      const handler = this.operationHandler;
      if (!handler) {
        this.rejectOperation(message.id, extractionError('write-failed', 'operation handler is not ready'));
        return;
      }
      const flight = handler(message).catch((error) => {
        this.rejectOperation(message.id, toOperationError(error));
      }).finally(() => {
        this.operationFlights.delete(flight);
      });
      this.operationFlights.add(flight);
      return;
    }
    if (message.kind === 'error') {
      this.failAll(new UnityPackageExtractionError(message.code, message.detail));
      return;
    }
    const waiterIndex = this.controlWaiters.findIndex((waiter) => waiter.kind === message.kind);
    if (waiterIndex >= 0) {
      const waiter = this.controlWaiters.splice(waiterIndex, 1)[0];
      waiter.resolve(message);
      return;
    }
    this.controlQueue.push(message);
  }

  private waitForControl(kind: WorkerControlMessage['kind']): Promise<WorkerControlMessage> {
    this.throwIfFailed();
    const queuedIndex = this.controlQueue.findIndex((message) => message.kind === kind);
    if (queuedIndex >= 0) return Promise.resolve(this.controlQueue.splice(queuedIndex, 1)[0]);
    return new Promise<WorkerControlMessage>((resolve, reject) => {
      this.controlWaiters.push({ kind, resolve, reject });
    });
  }

  private failAll(error: UnityPackageExtractionError): void {
    if (!this.fatalError) this.fatalError = error;
    while (this.controlWaiters.length > 0) this.controlWaiters.shift()?.reject(this.fatalError);
  }

  private throwIfFailed(): void {
    if (this.signal?.aborted) throw extractionError('cancelled');
    if (this.fatalError) throw this.fatalError;
  }
}

type ExtractControlResult =
  | { kind: 'scan-complete'; index: UnityPackageIndex }
  | { kind: 'extract-complete'; filesWritten: number; bytesWritten: number; warnings: string[] };

function assertDirectoryHandle(directory: DirectoryHandle): void {
  if (!directory || typeof directory.getDirectoryHandle !== 'function' || typeof directory.getFileHandle !== 'function') {
    throw extractionError('output-directory-failed', 'directory handle lacks File System Access methods');
  }
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw extractionError('cancelled');
}

async function createUniqueOutputDirectory(
  parent: DirectoryHandle,
  requestedName: string,
  signal: AbortSignal | undefined,
): Promise<{ handle: DirectoryHandle; name: string }> {
  for (let index = 1; index <= 10_000; index += 1) {
    assertNotAborted(signal);
    const name = index === 1 ? requestedName : `${requestedName}-${index}`;
    try {
      await parent.getDirectoryHandle(name, { create: false });
      continue;
    } catch (error) {
      if (!isMissingEntryError(error) && !isTypeMismatchError(error)) {
        throw extractionError('output-directory-failed', errorDetail(error));
      }
    }
    try {
      return { handle: await parent.getDirectoryHandle(name, { create: true }), name };
    } catch (error) {
      if (isMissingEntryError(error) || isTypeMismatchError(error)) continue;
      throw extractionError('output-directory-failed', errorDetail(error));
    }
  }
  throw extractionError('output-directory-failed', 'unable to allocate a fresh output directory');
}

async function ensureDirectoryPath(
  root: DirectoryHandle,
  parts: string[],
  cache: Map<string, DirectoryHandle>,
  signal: AbortSignal | undefined,
): Promise<DirectoryHandle> {
  let current = root;
  let key = '';
  for (const part of parts) {
    if (!part) continue;
    assertNotAborted(signal);
    key = key ? `${key}/${part}` : part;
    const cached = cache.get(key);
    if (cached) {
      current = cached;
      continue;
    }
    try {
      current = await current.getDirectoryHandle(part, { create: true });
    } catch (error) {
      throw extractionError(isTypeMismatchError(error) ? 'path-conflict' : 'output-directory-failed', errorDetail(error));
    }
    cache.set(key, current);
  }
  return current;
}

async function assertOutputEntryAbsent(parent: DirectoryHandle, name: string): Promise<void> {
  try {
    await parent.getFileHandle(name, { create: false });
    throw extractionError('file-exists', name);
  } catch (error) {
    if (error instanceof UnityPackageExtractionError) throw error;
    if (!isMissingEntryError(error) && !isTypeMismatchError(error)) throw extractionError('output-directory-failed', errorDetail(error));
    if (isTypeMismatchError(error)) throw extractionError('path-conflict', name);
  }
  try {
    await parent.getDirectoryHandle(name, { create: false });
    throw extractionError('path-conflict', name);
  } catch (error) {
    if (error instanceof UnityPackageExtractionError) throw error;
    if (!isMissingEntryError(error) && !isTypeMismatchError(error)) throw extractionError('output-directory-failed', errorDetail(error));
    if (isTypeMismatchError(error)) throw extractionError('path-conflict', name);
  }
}

async function abortWritable(writer: Writable | undefined): Promise<void> {
  if (!writer || typeof writer.abort !== 'function') return;
  try {
    await writer.abort();
  } catch {
    // 文件系统可能已经关闭 writer，保留原始解包错误。
  }
}

function outputDirectoryName(fileName: string): string {
  const stem = fileName.replace(/\.unitypackage$/i, '') || 'unitypackage-extracted';
  const safe = stem.replace(/[\\/:*?"<>|\0]/g, '_').trim().replace(/^\.+$/, 'unitypackage-extracted');
  const suffix = randomRunSuffix();
  const base = (safe || 'unitypackage-extracted').slice(0, Math.max(1, 96 - suffix.length - 1));
  return `${base}-${suffix}`;
}

function randomRunSuffix(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID().replace(/-/g, '').slice(0, 12);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const values = new Uint32Array(2);
    cryptoApi.getRandomValues(values);
    return `${values[0].toString(36)}${values[1].toString(36)}`.slice(0, 12);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 12);
}

function isMissingEntryError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError');
}

function isTypeMismatchError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error.name === 'TypeMismatchError' || error.name === 'InvalidModificationError'));
}

function isPermissionError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error.name === 'NotAllowedError' || error.name === 'SecurityError'));
}

function toOperationError(error: unknown): UnityPackageExtractionError {
  if (error instanceof UnityPackageExtractionError) return error;
  if (isAbortError(error)) return extractionError('cancelled');
  if (isPermissionError(error)) return extractionError('permission-denied', errorDetail(error));
  return extractionError('write-failed', errorDetail(error));
}
