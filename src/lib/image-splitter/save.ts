import { errorDetail, imageSplitterError, isAbortError, type ImageSplitterErrorCode, ImageSplitterError } from './errors.ts';
import { appendNumericSuffix, sanitizeEntryName } from './names.ts';
import { assertTaskActive, normalizeTaskControl, type TaskControl } from './task.ts';

export type SavePreference = 'auto' | 'mobile' | 'desktop';
export type SaveAction = 'auto' | 'share' | 'directory' | 'file-picker' | 'zip' | 'download';
export type SaveMethod = 'share' | 'directory' | 'file-picker' | 'zip-download' | 'download' | 'none';

export type SharePayload = {
  files: File[];
  title?: string;
};

export type WritableFileLike = {
  write: (data: Blob) => void | Promise<void>;
  close: () => void | Promise<void>;
  abort?: () => void | Promise<void>;
};

export type FileHandleLike = {
  kind?: 'file';
  createWritable: () => Promise<WritableFileLike>;
};

export type DirectoryHandleLike = {
  kind?: 'directory';
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandleLike>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<'granted' | 'denied'>;
};

export type SaveFilePickerOptionsLike = {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
};

export type SavePlatform = {
  canShare?: (data: SharePayload) => boolean;
  share?: (data: SharePayload) => Promise<void>;
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike>;
  showSaveFilePicker?: (options: SaveFilePickerOptionsLike) => Promise<FileHandleLike>;
  download?: (file: File) => void;
};

export type SaveCapabilities = {
  canShareFiles: boolean;
  canPickDirectory: boolean;
  canPickFile: boolean;
  canDownload: boolean;
  hasPreparedZip: boolean;
};

export type SaveLock = {
  readonly busy: boolean;
  tryAcquire: () => boolean;
  release: () => void;
};

export type SaveOptions = TaskControl & {
  platform?: SavePlatform;
  preference?: SavePreference;
  action?: SaveAction;
  zip?: File;
  title?: string;
  lock?: SaveLock;
};

export type SaveFailure = {
  index: number;
  fileName: string;
  errorCode: 'permission-denied' | 'directory-write-failed' | 'file-write-failed';
  detail?: string;
};

export type SaveResult =
  | {
    status: 'cancelled';
    method: SaveMethod;
    attempted: number;
    written: 0;
    confirmedWritten: false;
    errorCode: 'save-cancelled';
    canUsePreparedZip: boolean;
  }
  | {
    status: 'failed';
    method: SaveMethod;
    attempted: number;
    written: 0;
    confirmedWritten: false;
    errorCode: ImageSplitterErrorCode;
    canUsePreparedZip: boolean;
    detail?: string;
  }
  | {
    status: 'partial';
    method: 'directory';
    attempted: number;
    written: number;
    confirmedWritten: false;
    errorCode: 'directory-partial';
    canUsePreparedZip: boolean;
    writtenNames: string[];
    failures: SaveFailure[];
  }
  | {
    status: 'handed-to-system';
    method: 'share' | 'zip-download' | 'download';
    attempted: number;
    written: 0;
    confirmedWritten: false;
    errorCode: null;
    canUsePreparedZip: boolean;
  }
  | {
    status: 'written';
    method: 'directory' | 'file-picker';
    attempted: number;
    written: number;
    confirmedWritten: true;
    errorCode: null;
    canUsePreparedZip: boolean;
    writtenNames: string[];
  };

export function createSaveLock(): SaveLock {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    tryAcquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
  };
}

export function detectSaveCapabilities(
  files: readonly File[],
  options: { platform?: SavePlatform; zip?: File } = {},
): SaveCapabilities {
  const platform = options.platform ?? createDefaultSavePlatform();
  const actualFiles = Array.from(files ?? []);
  let canShareFiles = false;
  if (actualFiles.length > 0 && platform.canShare && platform.share) {
    try {
      canShareFiles = platform.canShare({ files: actualFiles });
    } catch {
      canShareFiles = false;
    }
  }
  return {
    canShareFiles,
    canPickDirectory: typeof platform.showDirectoryPicker === 'function',
    canPickFile: typeof platform.showSaveFilePicker === 'function',
    canDownload: typeof platform.download === 'function',
    hasPreparedZip: isPreparedZip(options.zip),
  };
}

export async function saveOneImage(file: File, options: SaveOptions = {}): Promise<SaveResult> {
  const attempted = 1;
  const hasZip = isPreparedZip(options.zip);
  if (!isUsableFile(file)) return failed('none', attempted, 'invalid-save-file', hasZip);
  const control = normalizeTaskControl(options);
  if (isInactive(control)) return cancelled('none', attempted, hasZip);
  if (options.lock && !options.lock.tryAcquire()) return failed('none', attempted, 'save-busy', hasZip);

  try {
    const platform = options.platform ?? createDefaultSavePlatform();
    const action = options.action ?? 'auto';
    const preference = options.preference ?? 'auto';
    const title = options.title ?? file.name;

    if (action === 'share') return await shareFiles([file], platform, title, false, hasZip);
    if (action === 'file-picker') return await saveWithFilePicker(file, platform, hasZip, control);
    if (action === 'zip' || action === 'directory') return failed(action === 'zip' ? 'none' : 'directory', attempted, 'invalid-save-file', hasZip);
    if (action === 'download') return deliverDownload(file, platform, attempted, hasZip, 'download');

    if (preference === 'mobile') {
      if (canShareFiles([file], platform)) return await shareFiles([file], platform, title, false, hasZip);
      return deliverDownload(file, platform, attempted, hasZip, 'download');
    }
    if (typeof platform.showSaveFilePicker === 'function') {
      return await saveWithFilePicker(file, platform, hasZip, control);
    }
    return deliverDownload(file, platform, attempted, hasZip, 'download');
  } finally {
    options.lock?.release();
  }
}

export async function saveAllImages(files: readonly File[], options: SaveOptions = {}): Promise<SaveResult> {
  const actualFiles = Array.from(files ?? []);
  const attempted = actualFiles.length;
  const hasZip = isPreparedZip(options.zip);
  if (actualFiles.length === 0) return failed('none', 0, 'empty-file-set', hasZip);
  if (actualFiles.some((file) => !isUsableFile(file))) return failed('none', attempted, 'invalid-save-file', hasZip);

  const control = normalizeTaskControl(options);
  if (isInactive(control)) return cancelled('none', attempted, hasZip);
  if (options.lock && !options.lock.tryAcquire()) return failed('none', attempted, 'save-busy', hasZip);

  try {
    const platform = options.platform ?? createDefaultSavePlatform();
    const action = options.action ?? 'auto';
    const preference = options.preference ?? 'auto';
    const title = options.title ?? actualFiles[0].name;

    if (action === 'share') return await shareFiles(actualFiles, platform, title, true, hasZip);
    if (action === 'directory') return await saveWithDirectory(actualFiles, platform, hasZip, control);
    if (action === 'zip') return deliverPreparedZip(options.zip, platform, attempted, hasZip);
    if (action === 'download') return deliverPreparedZip(options.zip, platform, attempted, hasZip, 'download');
    if (action === 'file-picker') return failed('file-picker', attempted, 'invalid-save-file', hasZip);

    if (preference === 'mobile') {
      if (canShareFiles(actualFiles, platform)) return await shareFiles(actualFiles, platform, title, true, hasZip);
      return failed('share', attempted, 'batch-share-unavailable', hasZip);
    }
    if (typeof platform.showDirectoryPicker === 'function') {
      return await saveWithDirectory(actualFiles, platform, hasZip, control);
    }
    return deliverPreparedZip(options.zip, platform, attempted, hasZip);
  } finally {
    options.lock?.release();
  }
}

async function shareFiles(
  files: File[],
  platform: SavePlatform,
  title: string,
  batch: boolean,
  hasZip: boolean,
): Promise<SaveResult> {
  if (!canShareFiles(files, platform) || !platform.share) {
    return failed('share', files.length, batch ? 'batch-share-unavailable' : 'share-unavailable', hasZip);
  }
  try {
    await platform.share({ files, title });
    return handed('share', files.length, hasZip);
  } catch (error) {
    if (isAbortError(error)) return cancelled('share', files.length, hasZip);
    return failed('share', files.length, 'share-failed', hasZip, errorDetail(error));
  }
}

async function saveWithFilePicker(
  file: File,
  platform: SavePlatform,
  hasZip: boolean,
  control: TaskControl | undefined,
): Promise<SaveResult> {
  if (!platform.showSaveFilePicker) return failed('file-picker', 1, 'file-picker-unavailable', hasZip);
  let handle: FileHandleLike;
  try {
    handle = await platform.showSaveFilePicker({
      suggestedName: sanitizeEntryName(file.name, 'slice.png'),
      types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
    });
  } catch (error) {
    if (isAbortError(error)) return cancelled('file-picker', 1, hasZip);
    return failed('file-picker', 1, mapPickerError(error), hasZip, errorDetail(error));
  }
  try {
    assertTaskActive(control);
    const writable = await handle.createWritable();
    try {
      await writable.write(file);
      await writable.close();
      assertTaskActive(control);
    } catch (error) {
      await abortWritable(writable);
      if (error instanceof ImageSplitterError && (error.code === 'cancelled' || error.code === 'stale-task')) {
        return cancelled('file-picker', 1, hasZip);
      }
      if (isAbortError(error)) return failed('file-picker', 1, 'file-write-failed', hasZip, errorDetail(error));
      return failed('file-picker', 1, isPermissionError(error) ? 'permission-denied' : 'file-write-failed', hasZip, errorDetail(error));
    }
    return written('file-picker', 1, [sanitizeEntryName(file.name, 'slice.png')], hasZip);
  } catch (error) {
    if (isAbortError(error)) return cancelled('file-picker', 1, hasZip);
    if (error instanceof ImageSplitterError && (error.code === 'cancelled' || error.code === 'stale-task')) {
      return cancelled('file-picker', 1, hasZip);
    }
    return failed('file-picker', 1, isPermissionError(error) ? 'permission-denied' : 'file-write-failed', hasZip, errorDetail(error));
  }
}

async function saveWithDirectory(
  files: File[],
  platform: SavePlatform,
  hasZip: boolean,
  control: TaskControl | undefined,
): Promise<SaveResult> {
  if (!platform.showDirectoryPicker) return failed('directory', files.length, 'directory-picker-unavailable', hasZip);

  let directory: DirectoryHandleLike;
  try {
    // 这次调用必须发生在点击处理的同步前缀内；之后才等待用户选择结果。
    const pickerPromise = platform.showDirectoryPicker({ mode: 'readwrite' });
    directory = await pickerPromise;
    assertTaskActive(control);
    if (directory.requestPermission) {
      const permission = await directory.requestPermission({ mode: 'readwrite' });
      assertTaskActive(control);
      if (permission !== 'granted') return failed('directory', files.length, 'permission-denied', hasZip);
    }
  } catch (error) {
    if (isAbortError(error)) return cancelled('directory', files.length, hasZip);
    if (error instanceof ImageSplitterError && (error.code === 'cancelled' || error.code === 'stale-task')) {
      return cancelled('directory', files.length, hasZip);
    }
    return failed('directory', files.length, mapPickerError(error), hasZip, errorDetail(error));
  }

  const writtenNames: string[] = [];
  const failures: SaveFailure[] = [];
  for (let index = 0; index < files.length; index += 1) {
    try {
      assertTaskActive(control);
    } catch (error) {
      if (writtenNames.length > 0) {
        return partial(files.length, writtenNames, failures, hasZip);
      }
      return cancelled('directory', files.length, hasZip);
    }

    const desiredName = sanitizeEntryName(files[index].name, `slice-${String(index + 1).padStart(2, '0')}.png`);
    try {
      const availableName = await findAvailableName(directory, desiredName);
      const handle = await directory.getFileHandle(availableName, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(files[index]);
        await writable.close();
        assertTaskActive(control);
      } catch (error) {
        await abortWritable(writable);
        if (error instanceof ImageSplitterError && (error.code === 'cancelled' || error.code === 'stale-task')) throw error;
        throw imageSplitterError(isPermissionError(error) ? 'permission-denied' : 'directory-write-failed', errorDetail(error));
      }
      writtenNames.push(availableName);
    } catch (error) {
      if (error instanceof ImageSplitterError && (error.code === 'cancelled' || error.code === 'stale-task')) {
        if (writtenNames.length > 0) return partial(files.length, writtenNames, failures, hasZip);
        return cancelled('directory', files.length, hasZip);
      }
      const errorCode = isPermissionError(error) ? 'permission-denied' : 'directory-write-failed';
      failures.push({
        index,
        fileName: desiredName,
        errorCode,
        detail: errorDetail(error),
      });
    }
  }

  if (failures.length === 0) return written('directory', files.length, writtenNames, hasZip);
  if (writtenNames.length > 0) return partial(files.length, writtenNames, failures, hasZip);
  return failed('directory', files.length, failures[0].errorCode, hasZip, failures[0].detail);
}

async function findAvailableName(directory: DirectoryHandleLike, desiredName: string): Promise<string> {
  let candidate = desiredName;
  for (let suffix = 2; suffix <= 10000; suffix += 1) {
    try {
      await directory.getFileHandle(candidate);
      candidate = appendNumericSuffix(desiredName, suffix);
    } catch (error) {
      if (isNotFoundError(error)) return candidate;
      if (isOccupiedEntryError(error)) {
        candidate = appendNumericSuffix(desiredName, suffix);
        continue;
      }
      throw error;
    }
  }
  throw imageSplitterError('directory-write-failed', 'no available file name');
}

function deliverPreparedZip(
  zip: File | undefined,
  platform: SavePlatform,
  attempted: number,
  hasZip: boolean,
  method: 'zip-download' | 'download' = 'zip-download',
): SaveResult {
  if (!isPreparedZip(zip)) return failed(method === 'download' ? 'download' : 'none', attempted, 'zip-not-prepared', hasZip);
  return deliverDownload(zip, platform, attempted, hasZip, method);
}

function deliverDownload(
  file: File,
  platform: SavePlatform,
  attempted: number,
  hasZip: boolean,
  method: 'zip-download' | 'download',
): SaveResult {
  if (!platform.download) return failed(method === 'zip-download' ? 'none' : 'download', attempted, 'download-unavailable', hasZip);
  try {
    platform.download(file);
    return handed(method, attempted, hasZip);
  } catch (error) {
    return failed(method === 'zip-download' ? 'none' : 'download', attempted, 'download-failed', hasZip, errorDetail(error));
  }
}

function canShareFiles(files: File[], platform: SavePlatform): boolean {
  if (!platform.canShare || !platform.share || files.length === 0) return false;
  try {
    return platform.canShare({ files });
  } catch {
    return false;
  }
}

function createDefaultSavePlatform(): SavePlatform {
  const browserNavigator = typeof navigator !== 'undefined' ? navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  } : undefined;
  const browserWindow = typeof window !== 'undefined' ? window as Window & {
    showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<DirectoryHandleLike>;
    showSaveFilePicker?: (options: SaveFilePickerOptionsLike) => Promise<FileHandleLike>;
  } : undefined;
  const browserDocument = typeof document !== 'undefined' ? document : undefined;
  const urlApi = globalThis.URL;

  return {
    canShare: browserNavigator?.canShare
      ? (data) => browserNavigator.canShare?.(data as ShareData) ?? false
      : undefined,
    share: browserNavigator?.share
      ? (data) => browserNavigator.share?.(data as ShareData) ?? Promise.resolve()
      : undefined,
    showDirectoryPicker: browserWindow?.showDirectoryPicker
      ? (options) => browserWindow.showDirectoryPicker?.(options) as Promise<DirectoryHandleLike>
      : undefined,
    showSaveFilePicker: browserWindow?.showSaveFilePicker
      ? (options) => browserWindow.showSaveFilePicker?.(options) as Promise<FileHandleLike>
      : undefined,
    download: browserDocument && typeof urlApi?.createObjectURL === 'function' && typeof urlApi?.revokeObjectURL === 'function'
      ? (file) => {
        const url = urlApi.createObjectURL(file);
        try {
          const anchor = browserDocument.createElement('a');
          anchor.href = url;
          anchor.download = file.name;
          anchor.rel = 'noopener';
          anchor.click();
        } finally {
          queueMicrotask(() => urlApi.revokeObjectURL(url));
        }
      }
      : undefined,
  };
}

function isUsableFile(file: File | undefined): file is File {
  return Boolean(file && typeof file.size === 'number' && file.size > 0 && typeof file.name === 'string');
}

function isPreparedZip(file: File | undefined): file is File {
  return Boolean(isUsableFile(file) && file.type.toLowerCase() === 'application/zip');
}

function isInactive(control: TaskControl | undefined): boolean {
  if (!control) return false;
  if (control.signal?.aborted) return true;
  return Boolean(control.isCurrent && !control.isCurrent());
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError');
}

function isOccupiedEntryError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'TypeMismatchError');
}

function isPermissionError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error.name === 'NotAllowedError' || error.name === 'SecurityError'));
}

function mapPickerError(error: unknown): 'permission-denied' | 'picker-failed' {
  return isPermissionError(error) ? 'permission-denied' : 'picker-failed';
}

async function abortWritable(writable: WritableFileLike): Promise<void> {
  if (!writable.abort) return;
  try {
    await writable.abort();
  } catch {
    // 原始写入错误更重要，清理失败不改变结果分类。
  }
}

function failed(
  method: SaveMethod,
  attempted: number,
  errorCode: ImageSplitterErrorCode,
  canUsePreparedZip: boolean,
  detail?: string,
): SaveResult {
  return {
    status: 'failed',
    method,
    attempted,
    written: 0,
    confirmedWritten: false,
    errorCode,
    canUsePreparedZip,
    ...(detail ? { detail } : {}),
  };
}

function cancelled(method: SaveMethod, attempted: number, canUsePreparedZip: boolean): SaveResult {
  return {
    status: 'cancelled',
    method,
    attempted,
    written: 0,
    confirmedWritten: false,
    errorCode: 'save-cancelled',
    canUsePreparedZip,
  };
}

function handed(method: 'share' | 'zip-download' | 'download', attempted: number, canUsePreparedZip: boolean): SaveResult {
  return {
    status: 'handed-to-system',
    method,
    attempted,
    written: 0,
    confirmedWritten: false,
    errorCode: null,
    canUsePreparedZip,
  };
}

function written(method: 'directory' | 'file-picker', attempted: number, writtenNames: string[], canUsePreparedZip: boolean): SaveResult {
  return {
    status: 'written',
    method,
    attempted,
    written: writtenNames.length,
    confirmedWritten: true,
    errorCode: null,
    canUsePreparedZip,
    writtenNames,
  };
}

function partial(attempted: number, writtenNames: string[], failures: SaveFailure[], canUsePreparedZip: boolean): SaveResult {
  return {
    status: 'partial',
    method: 'directory',
    attempted,
    written: writtenNames.length,
    confirmedWritten: false,
    errorCode: 'directory-partial',
    canUsePreparedZip,
    writtenNames,
    failures,
  };
}
