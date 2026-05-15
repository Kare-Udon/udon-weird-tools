export type VoskArchiveFormat = 'tar.gz' | 'zip';

type ZipEntry = {
  path: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

type TarEntry = {
  path: string;
  data: Uint8Array;
  type: 'file' | 'directory';
};

const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER = 0x02014b50;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const TAR_BLOCK_SIZE = 512;

export async function normalizeVoskModelArchive(blob: Blob, format: VoskArchiveFormat): Promise<Blob> {
  if (format === 'tar.gz') return blob;
  const zipBytes = new Uint8Array(await blob.arrayBuffer());
  const zipEntries = parseZipEntries(zipBytes);
  const tarEntries = await Promise.all(zipEntries.map((entry) => inflateZipEntry(zipBytes, entry)));
  const tarBytes = createTar(tarEntries);
  const gzippedTar = await gzipBytes(tarBytes);
  return new Blob([gzippedTar], { type: 'application/gzip' });
}

function parseZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, eocdOffset + 10);
  let cursor = readUint32(view, eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, cursor) !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER) {
      throw new Error('Invalid Vosk ZIP archive: missing central directory header.');
    }

    const method = readUint16(view, cursor + 10);
    const compressedSize = readUint32(view, cursor + 20);
    const uncompressedSize = readUint32(view, cursor + 24);
    const fileNameLength = readUint16(view, cursor + 28);
    const extraLength = readUint16(view, cursor + 30);
    const commentLength = readUint16(view, cursor + 32);
    const localHeaderOffset = readUint32(view, cursor + 42);
    const rawPath = decodeAscii(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
    cursor += 46 + fileNameLength + extraLength + commentLength;

    if (!rawPath || rawPath.endsWith('/')) continue;
    if (readUint32(view, localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) {
      throw new Error('Invalid Vosk ZIP archive: missing local file header.');
    }

    const localFileNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraLength;

    entries.push({
      path: normalizeVoskZipPath(rawPath),
      method,
      compressedSize,
      uncompressedSize,
      dataOffset,
    });
  }

  if (entries.length === 0) {
    throw new Error('Invalid Vosk ZIP archive: no model files found.');
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('Invalid Vosk ZIP archive: missing end of central directory.');
}

async function inflateZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<TarEntry> {
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  let data: Uint8Array;

  if (entry.method === 0) {
    data = copyBytes(compressed);
  } else if (entry.method === 8) {
    data = await inflateRaw(compressed);
  } else {
    throw new Error(`Unsupported Vosk ZIP compression method: ${entry.method}.`);
  }

  if (entry.uncompressedSize !== data.byteLength) {
    throw new Error(`Invalid Vosk ZIP archive: unexpected size for ${entry.path}.`);
  }

  return {
    path: entry.path,
    data,
    type: 'file',
  };
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot unpack official Vosk ZIP models.');
  }

  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipBytes(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('This browser cannot prepare official Vosk ZIP models.');
  }

  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

function createTar(fileEntries: TarEntry[]): Uint8Array {
  const directoryEntries = collectDirectoryEntries(fileEntries);
  const entries = [...directoryEntries, ...fileEntries];
  const chunks: Uint8Array[] = [];

  for (const entry of entries) {
    const normalizedPath = entry.type === 'directory' && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path;
    chunks.push(createTarHeader(normalizedPath, entry.data.byteLength, entry.type));
    if (entry.data.byteLength > 0) {
      chunks.push(entry.data);
      const padding = entry.data.byteLength % TAR_BLOCK_SIZE;
      if (padding > 0) chunks.push(new Uint8Array(TAR_BLOCK_SIZE - padding));
    }
  }

  chunks.push(new Uint8Array(TAR_BLOCK_SIZE * 2));
  return concatBytes(chunks);
}

function collectDirectoryEntries(fileEntries: TarEntry[]): TarEntry[] {
  const directories = new Set<string>();
  for (const entry of fileEntries) {
    const parts = entry.path.split('/').slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) {
      directories.add(parts.slice(0, index).join('/'));
    }
  }

  return [...directories].sort().map((path) => ({
    path,
    data: new Uint8Array(),
    type: 'directory',
  }));
}

function createTarHeader(path: string, size: number, type: TarEntry['type']): Uint8Array {
  const header = new Uint8Array(TAR_BLOCK_SIZE);
  writeAscii(header, 0, 100, path);
  writeOctal(header, 100, 8, type === 'directory' ? 0o755 : 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = type === 'directory' ? 0x35 : 0x30;
  writeAscii(header, 257, 6, 'ustar');
  writeAscii(header, 263, 2, '00');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeOctal(header, 148, 8, checksum);
  return header;
}

function normalizeVoskZipPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return `model/${parts.at(-1) ?? path}`;
  return ['model', ...parts.slice(1)].join('/');
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeAscii(bytes: Uint8Array, offset: number, length: number, value: string) {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength > length) {
    throw new Error(`Vosk archive path is too long: ${value}`);
  }
  bytes.set(encoded, offset);
}

function writeOctal(bytes: Uint8Array, offset: number, length: number, value: number) {
  const encoded = new TextEncoder().encode(value.toString(8).padStart(length - 2, '0'));
  bytes.set(encoded, offset);
  bytes[offset + length - 2] = 0;
  bytes[offset + length - 1] = 0x20;
}

function decodeAscii(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
