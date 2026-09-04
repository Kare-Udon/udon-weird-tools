import { errorDetail, imageSplitterError, isAbortError } from './errors.ts';
import { appendNumericSuffix, createZipFileName, sanitizeEntryName } from './names.ts';
import { IMAGE_SPLITTER_LIMITS } from './browser.ts';
import { assertTaskActive, normalizeTaskControl, type TaskControl } from './task.ts';

export type StoreZipOptions = TaskControl & {
  sourceName?: string;
  fileName?: string;
  maxBytes?: number;
  maxInputBytes?: number;
};

type ZipEntry = {
  name: string;
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
};

const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION = 20;
const ZIP_MAX_ENTRIES = 0xffff;
const ZIP_MAX_FIELD = 0xffffffff;

export async function createStoreZip(files: readonly File[], options?: StoreZipOptions | AbortSignal): Promise<File> {
  const resolvedOptions = isAbortSignal(options) ? { signal: options } : (options ?? {});
  const control = normalizeTaskControl(resolvedOptions);
  assertTaskActive(control);

  const actualFiles = Array.from(files ?? []);
  if (!Array.isArray(files) || actualFiles.length === 0) throw imageSplitterError('zip-input-empty');
  if (actualFiles.length > ZIP_MAX_ENTRIES) throw imageSplitterError('zip-too-many-entries');
  if (typeof File !== 'function') throw imageSplitterError('file-constructor-unavailable');

  const maxInputBytes = lowerLimit(resolvedOptions.maxInputBytes, IMAGE_SPLITTER_LIMITS.maxOutputBytes);
  const maxZipBytes = lowerLimit(resolvedOptions.maxBytes, IMAGE_SPLITTER_LIMITS.maxZipBytes);
  const entries: ZipEntry[] = [];
  const usedNames = new Set<string>();
  let inputBytes = 0;
  let offset = 0;

  for (let index = 0; index < actualFiles.length; index += 1) {
    assertTaskActive(control);
    const file = actualFiles[index];
    if (!file || typeof file.size !== 'number') throw imageSplitterError('zip-entry-empty');
    if (file.size <= 0) throw imageSplitterError('zip-entry-empty');
    inputBytes += file.size;
    if (inputBytes > maxInputBytes) throw imageSplitterError('zip-input-too-large', String(maxInputBytes));

    let data: Uint8Array;
    try {
      data = new Uint8Array(await file.arrayBuffer());
      assertTaskActive(control);
    } catch (error) {
      if (error instanceof Error && error.name === 'ImageSplitterError') throw error;
      if (isAbortError(error)) throw imageSplitterError('cancelled');
      throw imageSplitterError('zip-read-failed', errorDetail(error));
    }
    if (data.byteLength === 0) throw imageSplitterError('zip-entry-empty');
    if (data.byteLength > ZIP_MAX_FIELD) throw imageSplitterError('zip-too-large');

    const name = uniqueEntryName(sanitizeEntryName(file.name, `slice-${String(index + 1).padStart(2, '0')}.png`), usedNames);
    const nameBytes = new TextEncoder().encode(name);
    if (nameBytes.byteLength === 0) throw imageSplitterError('zip-entry-name-invalid');
    if (nameBytes.byteLength > 0xffff) throw imageSplitterError('zip-entry-name-too-long');
    const crc = crc32(data);
    const localHeaderLength = 30 + nameBytes.byteLength;
    if (offset + localHeaderLength + data.byteLength > ZIP_MAX_FIELD) throw imageSplitterError('zip-too-large');
    entries.push({ name, nameBytes, data, crc, offset });
    offset += localHeaderLength + data.byteLength;
  }

  assertTaskActive(control);
  const localChunks: Uint8Array[] = [];
  for (const entry of entries) {
    localChunks.push(createLocalHeader(entry), entry.data);
  }

  const centralChunks = entries.map(createCentralHeader);
  const centralDirectorySize = sumBytes(centralChunks);
  const centralDirectoryOffset = offset;
  const endRecord = createEndRecord(entries.length, centralDirectorySize, centralDirectoryOffset);
  const zipSize = sumBytes(localChunks) + centralDirectorySize + endRecord.byteLength;
  if (zipSize <= 0 || zipSize > maxZipBytes || zipSize > ZIP_MAX_FIELD) {
    throw imageSplitterError('zip-too-large', String(maxZipBytes));
  }

  let bytes: Uint8Array;
  try {
    bytes = concat([...localChunks, ...centralChunks, endRecord], zipSize);
  } catch (error) {
    throw imageSplitterError('zip-encode-failed', errorDetail(error));
  }
  assertTaskActive(control);

  const outputName = normalizeZipFileName(resolvedOptions.fileName ?? createZipFileName(resolvedOptions.sourceName ?? actualFiles[0]?.name ?? 'image'));
  const zip = new File([bytes.buffer as ArrayBuffer], outputName, { type: 'application/zip', lastModified: 0 });
  if (zip.size <= 0) throw imageSplitterError('zip-encode-failed');
  if (zip.type.toLowerCase() !== 'application/zip') throw imageSplitterError('zip-encode-failed');
  return zip;
}

function createLocalHeader(entry: ZipEntry): Uint8Array {
  const header = new Uint8Array(30 + entry.nameBytes.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, ZIP_VERSION, true);
  view.setUint16(6, ZIP_UTF8_FLAG, true);
  view.setUint16(8, ZIP_STORE_METHOD, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.data.byteLength, true);
  view.setUint32(22, entry.data.byteLength, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(entry.nameBytes, 30);
  return header;
}

function createCentralHeader(entry: ZipEntry): Uint8Array {
  const header = new Uint8Array(46 + entry.nameBytes.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, ZIP_VERSION, true);
  view.setUint16(6, ZIP_VERSION, true);
  view.setUint16(8, ZIP_UTF8_FLAG, true);
  view.setUint16(10, ZIP_STORE_METHOD, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.data.byteLength, true);
  view.setUint32(24, entry.data.byteLength, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.offset, true);
  header.set(entry.nameBytes, 46);
  return header;
}

function createEndRecord(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function uniqueEntryName(baseName: string, usedNames: Set<string>): string {
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = appendNumericSuffix(baseName, suffix);
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function normalizeZipFileName(value: string): string {
  const safe = sanitizeEntryName(value, 'image-split.zip');
  return safe.toLowerCase().endsWith('.zip') ? safe : `${safe}.zip`;
}

function lowerLimit(value: number | undefined, hardLimit: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return hardLimit;
  return Math.min(hardLimit, Math.floor(value as number));
}

function isAbortSignal(value: StoreZipOptions | AbortSignal | undefined): value is AbortSignal {
  return Boolean(value && 'aborted' in value && typeof value.aborted === 'boolean' && !('signal' in value));
}

function sumBytes(chunks: readonly Uint8Array[]): number {
  return chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
}

function concat(chunks: readonly Uint8Array[], expectedSize: number): Uint8Array {
  const output = new Uint8Array(expectedSize);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== expectedSize) throw new Error('ZIP size accounting mismatch');
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
}));
