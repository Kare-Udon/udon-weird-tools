import type { Locale } from '@/i18n/config';
import type { ToolRunContext } from '../_types';

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_ZIP_BYTES = 160 * 1024 * 1024;
const TAR_BLOCK_SIZE = 512;
const ZIP_MIME_TYPE = 'application/zip';

export type UnityPackageExtractorInput = {
  packageFile: File | null;
};

export type UnityPackageExtractorOutput = {
  kind: 'download';
  fileName: string;
  mimeType: typeof ZIP_MIME_TYPE;
  base64: string;
  size: number;
  summary: {
    text: string;
    entries: Array<{ path: string; size: number }>;
  };
  warnings: string[];
};

type TarEntry = {
  path: string;
  data: Uint8Array;
  type: string;
};

type UnityPackageGroup = {
  pathname?: Uint8Array;
  asset?: Uint8Array;
};

type ZipEntry = {
  path: string;
  data: Uint8Array;
};

export async function run(input: UnityPackageExtractorInput, context?: ToolRunContext): Promise<UnityPackageExtractorOutput> {
  const locale = context?.locale ?? 'en';
  const file = input.packageFile;

  if (!file) {
    throw new Error(message(locale, 'missingFile'));
  }

  if (file.size > MAX_PACKAGE_BYTES) {
    throw new Error(message(locale, 'packageTooLarge', formatBytes(MAX_PACKAGE_BYTES)));
  }

  const warnings: string[] = [];

  if (!file.name.toLowerCase().endsWith('.unitypackage')) {
    warnings.push(message(locale, 'unexpectedExtension'));
  }

  const tarBytes = await decompressGzip(file, locale);
  const tarEntries = parseTar(tarBytes);
  const files = restoreUnityPackageEntries(tarEntries, warnings, locale);

  if (files.length === 0) {
    throw new Error(message(locale, 'emptyPackage'));
  }

  const zipBytes = createZip(files);

  if (zipBytes.byteLength > MAX_ZIP_BYTES) {
    throw new Error(message(locale, 'zipTooLarge', formatBytes(MAX_ZIP_BYTES)));
  }

  const fileName = `${stripUnityPackageExtension(file.name)}.zip`;
  const totalAssetFiles = files.filter((entry) => !entry.path.endsWith('/')).length;
  const summaryEntries = files
    .filter((entry) => !entry.path.endsWith('/'))
    .map((entry) => ({ path: entry.path, size: entry.data.byteLength }));

  return {
    kind: 'download',
    fileName,
    mimeType: ZIP_MIME_TYPE,
    base64: bytesToBase64(zipBytes),
    size: zipBytes.byteLength,
    summary: {
      text: message(locale, 'summary', String(totalAssetFiles), formatBytes(zipBytes.byteLength), fileName),
      entries: summaryEntries,
    },
    warnings,
  };
}

async function decompressGzip(file: File, locale: Locale): Promise<Uint8Array> {
  if (!('DecompressionStream' in globalThis)) {
    throw new Error(message(locale, 'unsupportedBrowser'));
  }

  try {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${message(locale, 'gzipFailed')} ${detail}`);
  }
}

function parseTar(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (isZeroBlock(header)) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const path = normalizeTarPath(prefix ? `${prefix}/${name}` : name);
    const size = readTarOctal(header, 124, 12);
    const type = readTarString(header, 156, 1) || '0';

    offset += TAR_BLOCK_SIZE;

    if (offset + size > bytes.byteLength) {
      throw new Error('Invalid tar archive: entry exceeds archive size.');
    }

    if (type === '0' || type === '\0') {
      entries.push({
        path,
        data: bytes.subarray(offset, offset + size),
        type,
      });
    }

    offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return entries;
}

function restoreUnityPackageEntries(entries: TarEntry[], warnings: string[], locale: Locale): ZipEntry[] {
  const groups = new Map<string, UnityPackageGroup>();
  const decoder = new TextDecoder();

  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    if (parts.length < 2) continue;

    const groupId = parts[0];
    const itemName = parts.slice(1).join('/');
    const group = groups.get(groupId) ?? {};

    if (itemName === 'pathname') group.pathname = entry.data;
    if (itemName === 'asset') group.asset = entry.data;

    groups.set(groupId, group);
  }

  const output = new Map<string, Uint8Array>();

  for (const group of groups.values()) {
    if (!group.pathname) continue;

    const rawPath = decoder.decode(group.pathname).replace(/\0/g, '').trim();
    const safePath = sanitizePackagePath(rawPath);

    if (!safePath) {
      warnings.push(message(locale, 'skippedPath', rawPath || '(empty)'));
      continue;
    }

    if (group.asset) {
      addZipEntry(output, safePath, group.asset, warnings, locale);
    } else {
      addZipEntry(output, `${safePath}/`, new Uint8Array(), warnings, locale);
    }
  }

  return [...output.entries()]
    .map(([path, data]) => ({ path, data }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function addZipEntry(output: Map<string, Uint8Array>, path: string, data: Uint8Array, warnings: string[], locale: Locale): void {
  if (output.has(path)) {
    warnings.push(message(locale, 'duplicatePath', path));
    return;
  }

  output.set(path, data);
}

function createZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.path);
    const crc = crc32(entry.data);
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);

    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralDirectory.push(centralHeader);
    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectorySize = centralDirectory.reduce((total, chunk) => total + chunk.byteLength, 0);
  const centralDirectoryOffset = offset;
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  chunks.push(...centralDirectory, endRecord);

  const zipSize = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const zip = new Uint8Array(zipSize);
  let cursor = 0;

  for (const chunk of chunks) {
    zip.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  return zip;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  }),
);

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function readTarString(bytes: Uint8Array, start: number, length: number): string {
  const slice = bytes.subarray(start, start + length);
  const end = slice.findIndex((byte) => byte === 0);
  const value = end >= 0 ? slice.subarray(0, end) : slice;
  return new TextDecoder().decode(value).trim();
}

function readTarOctal(bytes: Uint8Array, start: number, length: number): number {
  const raw = readTarString(bytes, start, length).replace(/\0/g, '').trim();
  if (!raw) return 0;

  const value = Number.parseInt(raw, 8);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid tar archive: bad octal size "${raw}".`);
  }

  return value;
}

function normalizeTarPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

function sanitizePackagePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length === 0) return null;
  if (/^[a-zA-Z]:/.test(normalized)) return null;
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\0'))) return null;

  return parts.join('/');
}

function stripUnityPackageExtension(name: string): string {
  return name.replace(/\.unitypackage$/i, '') || 'unitypackage-extracted';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function message(locale: Locale, key: string, ...values: string[]): string {
  const messages: Record<Locale, Record<string, string>> = {
    en: {
      missingFile: 'Choose a .unitypackage file first.',
      packageTooLarge: `The selected file is too large. Limit: ${values[0]}.`,
      unexpectedExtension: 'The file name does not end with .unitypackage; attempting to read it as gzip tar anyway.',
      unsupportedBrowser: 'This browser does not support gzip DecompressionStream. Try a current Chromium, Safari, or Firefox build.',
      gzipFailed: 'Cannot decompress the package as gzip:',
      emptyPackage: 'No restorable Unity assets were found in this package.',
      zipTooLarge: `The generated ZIP is too large for the browser download path. Limit: ${values[0]}.`,
      skippedPath: `Skipped unsafe package path: ${values[0]}.`,
      duplicatePath: `Skipped duplicate output path: ${values[0]}.`,
      summary: `Restored ${values[0]} files into ${values[2]} (${values[1]}).`,
    },
    ja: {
      missingFile: '.unitypackage ファイルを選択してください。',
      packageTooLarge: `選択したファイルが大きすぎます。上限: ${values[0]}。`,
      unexpectedExtension: 'ファイル名が .unitypackage で終わっていません。gzip tar として読み取りを試みます。',
      unsupportedBrowser: 'このブラウザは gzip DecompressionStream に対応していません。最新の Chromium、Safari、Firefox を試してください。',
      gzipFailed: 'パッケージを gzip として展開できません:',
      emptyPackage: '復元できる Unity アセットがこのパッケージに見つかりません。',
      zipTooLarge: `生成された ZIP がブラウザダウンロード経路には大きすぎます。上限: ${values[0]}。`,
      skippedPath: `安全でないパッケージパスをスキップしました: ${values[0]}。`,
      duplicatePath: `重複した出力パスをスキップしました: ${values[0]}。`,
      summary: `${values[0]} 件のファイルを ${values[2]} (${values[1]}) に復元しました。`,
    },
    'zh-CN': {
      missingFile: '请先选择一个 .unitypackage 文件。',
      packageTooLarge: `选择的文件过大。限制：${values[0]}。`,
      unexpectedExtension: '文件名不是 .unitypackage 结尾；仍会尝试按 gzip tar 读取。',
      unsupportedBrowser: '当前浏览器不支持 gzip DecompressionStream。请使用较新的 Chromium、Safari 或 Firefox。',
      gzipFailed: '无法按 gzip 解压这个包：',
      emptyPackage: '这个包里没有找到可还原的 Unity 资源。',
      zipTooLarge: `生成的 ZIP 对浏览器下载路径来说过大。限制：${values[0]}。`,
      skippedPath: `已跳过不安全的包内路径：${values[0]}。`,
      duplicatePath: `已跳过重复输出路径：${values[0]}。`,
      summary: `已还原 ${values[0]} 个文件到 ${values[2]}（${values[1]}）。`,
    },
  };

  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}
