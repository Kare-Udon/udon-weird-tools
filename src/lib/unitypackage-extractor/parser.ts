import { extractionError, type ExtractionWarningCode } from './errors.ts';

export const UNITYPACKAGE_STREAMING_LIMITS = Object.freeze({
  // 压缩输入上限高于接近 1 GiB 的产品目标，并保留可解释的资源边界。
  maxCompressedBytes: 2 * 1024 ** 3,
  maxTarBytes: 8 * 1024 ** 3,
  maxEntryBytes: 2 * 1024 ** 3,
  maxOutputBytes: 4 * 1024 ** 3,
  maxTarEntries: 500_000,
  maxGroups: 250_000,
  maxPathBytes: 8 * 1024,
  maxTotalPathBytes: 64 * 1024 * 1024,
});

export type UnityPackageStreamingLimits = typeof UNITYPACKAGE_STREAMING_LIMITS;

export type TarEntryHeader = {
  name: string;
  size: number;
  type: string;
};

export type UnityPackageIndexEntry = {
  groupId: string;
  kind: 'file' | 'directory';
  path: string;
  size: number;
};

export type UnityPackageIndex = {
  entries: UnityPackageIndexEntry[];
  warnings: ExtractionWarningCode[];
  outputBytes: number;
};

export type UnityPackageExtractionSink = {
  makeDirectory: (path: string) => void | Promise<void>;
  openFile: (entry: Pick<UnityPackageIndexEntry, 'path' | 'size'>) => void | Promise<void>;
  writeFileChunk: (chunk: Uint8Array) => void | Promise<void>;
  closeFile: () => void | Promise<void>;
};

export type UnityPackageExtractionStats = {
  filesWritten: number;
  bytesWritten: number;
};

type AsyncBytes = AsyncIterable<Uint8Array>;

type TarSink = {
  onEntryStart: (entry: TarEntryHeader) => void | Promise<void>;
  onEntryData: (chunk: Uint8Array) => void | Promise<void>;
  onEntryEnd: () => void | Promise<void>;
};

const TAR_BLOCK_SIZE = 512;
const TEXT_DECODER = new TextDecoder();

export async function scanUnityPackageTar(
  chunks: AsyncBytes,
  limits: UnityPackageStreamingLimits = UNITYPACKAGE_STREAMING_LIMITS,
): Promise<UnityPackageIndex> {
  const processor = new UnityPackagePassProcessor('scan', limits);
  const parser = new TarStreamParser(processor, limits);
  await consumeChunks(chunks, parser);
  parser.finish();
  return processor.finishScan();
}

export async function extractUnityPackageTar(
  chunks: AsyncBytes,
  index: UnityPackageIndex,
  sink: UnityPackageExtractionSink,
  limits: UnityPackageStreamingLimits = UNITYPACKAGE_STREAMING_LIMITS,
): Promise<UnityPackageExtractionStats> {
  const processor = new UnityPackagePassProcessor('extract', limits, index, sink);
  const parser = new TarStreamParser(processor, limits);
  await consumeChunks(chunks, parser);
  parser.finish();
  return processor.finishExtraction();
}

async function consumeChunks(chunks: AsyncBytes, parser: TarStreamParser): Promise<void> {
  for await (const chunk of chunks) {
    if (!(chunk instanceof Uint8Array)) throw extractionError('invalid-file', 'stream chunk is not Uint8Array');
    if (chunk.byteLength > 0) await parser.push(chunk);
  }
}

class TarStreamParser {
  private readonly sink: TarSink;
  private readonly limits: UnityPackageStreamingLimits;
  private readonly header = new Uint8Array(TAR_BLOCK_SIZE);
  private headerOffset = 0;
  private current: {
    dataRemaining: number;
    paddingRemaining: number;
    ended: boolean;
  } | null = null;
  private zeroBlocks = 0;
  private ended = false;
  private totalBytes = 0;
  private entries = 0;

  constructor(sink: TarSink, limits: UnityPackageStreamingLimits) {
    this.sink = sink;
    this.limits = limits;
  }

  async push(input: Uint8Array): Promise<void> {
    this.totalBytes += input.byteLength;
    if (this.totalBytes > this.limits.maxTarBytes) {
      throw extractionError('expanded-size-limit', String(this.limits.maxTarBytes));
    }

    let offset = 0;
    while (offset < input.byteLength) {
      if (this.ended) {
        if (input[offset] !== 0) throw extractionError('tar-invalid-boundary');
        offset += 1;
        continue;
      }

      if (this.current) {
        if (this.current.dataRemaining > 0) {
          const amount = Math.min(this.current.dataRemaining, input.byteLength - offset);
          const data = input.subarray(offset, offset + amount);
          await this.sink.onEntryData(data);
          offset += amount;
          this.current.dataRemaining -= amount;
          if (this.current.dataRemaining > 0) continue;
        }

        if (!this.current.ended) {
          this.current.ended = true;
          await this.sink.onEntryEnd();
        }
        if (this.current.paddingRemaining > 0) {
          const amount = Math.min(this.current.paddingRemaining, input.byteLength - offset);
          offset += amount;
          this.current.paddingRemaining -= amount;
          if (this.current.paddingRemaining > 0) continue;
        }
        this.current = null;
      }

      const amount = Math.min(TAR_BLOCK_SIZE - this.headerOffset, input.byteLength - offset);
      this.header.set(input.subarray(offset, offset + amount), this.headerOffset);
      this.headerOffset += amount;
      offset += amount;
      if (this.headerOffset < TAR_BLOCK_SIZE) continue;

      const header = parseTarHeader(this.header, this.limits);
      this.headerOffset = 0;
      if (!header) {
        if (this.zeroBlocks === 1) {
          this.zeroBlocks = 2;
          this.ended = true;
        } else {
          this.zeroBlocks = 1;
        }
        continue;
      }
      if (this.zeroBlocks > 0) throw extractionError('tar-invalid-boundary');
      this.zeroBlocks = 0;
      this.entries += 1;
      if (this.entries > this.limits.maxTarEntries) {
        throw extractionError('index-budget-exceeded', `tar entries exceed ${this.limits.maxTarEntries}`);
      }
      await this.sink.onEntryStart(header);
      this.current = {
        dataRemaining: header.size,
        paddingRemaining: (TAR_BLOCK_SIZE - (header.size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE,
        ended: false,
      };
      if (header.size === 0) {
        this.current.ended = true;
        await this.sink.onEntryEnd();
      }
    }
  }

  finish(): void {
    if (this.current && (this.current.dataRemaining > 0 || this.current.paddingRemaining > 0)) {
      throw extractionError('tar-truncated');
    }
    if (this.headerOffset !== 0 || this.zeroBlocks < 2 || !this.ended) {
      throw extractionError('tar-truncated');
    }
  }
}

function parseTarHeader(block: Uint8Array, limits: UnityPackageStreamingLimits): TarEntryHeader | null {
  if (isZeroBlock(block)) return null;
  const expectedChecksum = readTarNumber(block, 148, 8, 'tar-invalid-header');
  let actualChecksum = 0;
  for (let index = 0; index < block.byteLength; index += 1) {
    actualChecksum += index >= 148 && index < 156 ? 0x20 : block[index];
  }
  if (actualChecksum !== expectedChecksum) throw extractionError('tar-invalid-header', 'checksum mismatch');

  const name = readTarText(block, 0, 100);
  const prefix = readTarText(block, 345, 155);
  const typeByte = block[156];
  const type = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
  const memberName = normalizeTarMemberPath(prefix ? `${prefix}/${name}` : name, type === '5');
  const size = readTarNumber(block, 124, 12, 'tar-invalid-header');
  if (size > limits.maxEntryBytes) throw extractionError('entry-too-large', String(size));
  return { name: memberName, size, type };
}

function normalizeTarMemberPath(path: string, isDirectory: boolean): string {
  const replaced = path.replace(/\\/g, '/');
  if (!replaced || replaced.startsWith('/') || replaced.startsWith('//') || /^[A-Za-z]:\//.test(replaced)) {
    throw extractionError('path-unsafe', path.slice(0, 240));
  }
  const trailingSlash = replaced.endsWith('/');
  const parts = replaced.split('/');
  const normalizedParts: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part === '..') throw extractionError('path-unsafe', path.slice(0, 240));
    if (part === '.') continue;
    normalizedParts.push(part);
  }
  if (normalizedParts.length === 0) {
    // TAR 的 ./ 根目录条目不产生输出，普通文件仍不允许使用空路径。
    if (isDirectory) return '.';
    throw extractionError('path-unsafe', path.slice(0, 240));
  }
  return `${normalizedParts.join('/')}${trailingSlash ? '/' : ''}`;
}

function readTarText(bytes: Uint8Array, start: number, length: number): string {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return TEXT_DECODER.decode(end >= 0 ? slice.subarray(0, end) : slice);
}

function readTarNumber(bytes: Uint8Array, start: number, length: number, code: 'tar-invalid-header'): number {
  const raw = readTarText(bytes, start, length).trim();
  if (!raw) return 0;
  if (!/^[0-7]+$/.test(raw)) throw extractionError(code, `invalid octal number ${raw.slice(0, 80)}`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw extractionError(code, 'number is out of range');
  return value;
}

function isZeroBlock(block: Uint8Array): boolean {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}

type PassMode = 'scan' | 'extract';
type GroupState = {
  groupId: string;
  hasAsset: boolean;
  assetSize: number;
  pathname?: string;
};

class UnityPackagePassProcessor implements TarSink {
  private readonly mode: PassMode;
  private readonly limits: UnityPackageStreamingLimits;
  private readonly index?: UnityPackageIndex;
  private readonly sink?: UnityPackageExtractionSink;
  private readonly groups = new Map<string, GroupState>();
  private readonly warnings = new Set<ExtractionWarningCode>();
  private readonly indexByGroup = new Map<string, UnityPackageIndexEntry>();
  private readonly seenAssetGroups = new Set<string>();
  private readonly seenPathnameGroups = new Set<string>();
  private readonly current: { kind: 'pathname' | 'asset' | 'other'; group?: GroupState; entry?: UnityPackageIndexEntry } = { kind: 'other' };
  private currentPathBytes: Uint8Array[] = [];
  private currentPathLength = 0;
  private totalPathBytes = 0;
  private outputBytes = 0;
  private filesWritten = 0;
  private bytesWritten = 0;

  constructor(mode: PassMode, limits: UnityPackageStreamingLimits, index?: UnityPackageIndex, sink?: UnityPackageExtractionSink) {
    this.mode = mode;
    this.limits = limits;
    this.index = index;
    this.sink = sink;
    if (mode === 'extract') {
      if (!index || !sink) throw extractionError('invalid-file', 'extract pass requires index and sink');
      for (const entry of index.entries) this.indexByGroup.set(entry.groupId, entry);
    }
  }

  async onEntryStart(entry: TarEntryHeader): Promise<void> {
    this.current.kind = 'other';
    this.current.group = undefined;
    this.current.entry = undefined;
    this.currentPathBytes = [];
    this.currentPathLength = 0;
    if (entry.type !== '0') return;

    const parts = entry.name.split('/');
    if (parts.length !== 2 || (parts[1] !== 'pathname' && parts[1] !== 'asset')) {
      if (parts.length === 2 && parts[1] !== 'asset.meta') this.warnings.add('unknown-member-ignored');
      return;
    }

    const groupId = parts[0];
    if (!groupId) throw extractionError('path-unsafe', entry.name);
    const group = this.mode === 'scan' ? this.getOrCreateGroup(groupId) : undefined;
    if (parts[1] === 'pathname') {
      this.current.kind = 'pathname';
      this.current.group = group;
      this.currentPathBytes = [];
      this.currentPathLength = 0;
      if (this.mode === 'scan') {
        if (!group || group.pathname !== undefined) throw extractionError('duplicate-group-member', entry.name);
      } else {
        const selected = this.indexByGroup.get(groupId);
        if (!selected) throw extractionError('missing-pathname', groupId);
        this.current.entry = selected;
      }
      return;
    }

    this.current.kind = 'asset';
    this.current.group = group;
    if (this.mode === 'scan') {
      if (!group || group.hasAsset) throw extractionError('duplicate-group-member', entry.name);
      group.hasAsset = true;
      group.assetSize = entry.size;
      this.outputBytes += entry.size;
      if (this.outputBytes > this.limits.maxOutputBytes) throw extractionError('output-budget-exceeded', String(this.limits.maxOutputBytes));
      return;
    }

    const selected = this.indexByGroup.get(groupId);
    if (!selected) throw extractionError('missing-pathname', groupId);
    if (selected.kind !== 'file' || selected.size !== entry.size) throw extractionError('missing-asset', groupId);
    this.current.entry = selected;
    this.seenAssetGroups.add(groupId);
    await this.sink?.openFile({ path: selected.path, size: selected.size });
  }

  async onEntryData(chunk: Uint8Array): Promise<void> {
    if (this.current.kind === 'pathname') {
      this.currentPathLength += chunk.byteLength;
      if (this.currentPathLength > this.limits.maxPathBytes) throw extractionError('path-too-long', String(this.currentPathLength));
      this.currentPathBytes.push(new Uint8Array(chunk));
      return;
    }
    if (this.current.kind === 'asset' && this.mode === 'extract') {
      await this.sink?.writeFileChunk(chunk);
      this.bytesWritten += chunk.byteLength;
    }
  }

  async onEntryEnd(): Promise<void> {
    if (this.current.kind === 'pathname') {
      if (this.mode === 'scan') {
        const group = this.current.group;
        if (!group) throw extractionError('missing-pathname');
        const rawPath = decodePathname(this.currentPathBytes);
        this.totalPathBytes += new TextEncoder().encode(rawPath).byteLength;
        if (this.totalPathBytes > this.limits.maxTotalPathBytes) throw extractionError('index-budget-exceeded', String(this.limits.maxTotalPathBytes));
        group.pathname = rawPath;
      } else {
        const entry = this.current.entry;
        if (!entry) throw extractionError('missing-pathname');
        const rawPath = decodePathname(this.currentPathBytes);
        const pathInfo = normalizeOutputPath(rawPath, this.limits);
        if (pathInfo.path !== entry.path || (entry.kind === 'file' && pathInfo.directory)) {
          throw extractionError('path-conflict', `pathname changed for ${entry.groupId}`);
        }
        this.seenPathnameGroups.add(entry.groupId);
        if (entry.kind === 'directory') await this.sink?.makeDirectory(entry.path);
      }
      return;
    }
    if (this.current.kind === 'asset' && this.mode === 'extract') {
      if (!this.current.entry) throw extractionError('missing-asset');
      await this.sink?.closeFile();
      this.filesWritten += 1;
    }
  }

  finishScan(): UnityPackageIndex {
    if (this.mode !== 'scan') throw extractionError('invalid-file');
    const entries: UnityPackageIndexEntry[] = [];
    for (const group of this.groups.values()) {
      if (group.hasAsset && group.pathname === undefined) throw extractionError('missing-pathname', group.groupId);
      if (group.pathname === undefined) continue;
      const pathInfo = normalizeOutputPath(group.pathname, this.limits);
      const kind = group.hasAsset ? 'file' : 'directory';
      if (kind === 'file' && pathInfo.directory) throw extractionError('path-conflict', group.pathname);
      entries.push({ groupId: group.groupId, kind, path: pathInfo.path, size: kind === 'file' ? group.assetSize : 0 });
    }
    if (entries.length === 0) throw extractionError('empty-package');
    if (entries.length > this.limits.maxGroups) throw extractionError('index-budget-exceeded', String(this.limits.maxGroups));
    entries.sort((left, right) => left.path.localeCompare(right.path));
    validateOutputConflicts(entries);
    return { entries, warnings: [...this.warnings], outputBytes: this.outputBytes };
  }

  finishExtraction(): UnityPackageExtractionStats {
    if (this.mode !== 'extract' || !this.index) throw extractionError('invalid-file');
    for (const entry of this.index.entries) {
      if (!this.seenPathnameGroups.has(entry.groupId)) throw extractionError('missing-pathname', entry.groupId);
      if (entry.kind === 'file' && !this.seenAssetGroups.has(entry.groupId)) throw extractionError('missing-asset', entry.groupId);
    }
    return { filesWritten: this.filesWritten, bytesWritten: this.bytesWritten };
  }

  private getOrCreateGroup(groupId: string): GroupState {
    const existing = this.groups.get(groupId);
    if (existing) return existing;
    if (this.groups.size >= this.limits.maxGroups) throw extractionError('index-budget-exceeded', String(this.limits.maxGroups));
    const group: GroupState = {
      groupId,
      hasAsset: false,
      assetSize: 0,
    };
    this.groups.set(groupId, group);
    return group;
  }
}

function decodePathname(bytes: Uint8Array[]): string {
  const total = bytes.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of bytes) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodePathnameBytes(joined);
}

function decodePathnameBytes(bytes: Uint8Array): string {
  const decoded = TEXT_DECODER.decode(bytes).replace(/\0/g, '').trim();
  if (!decoded) throw extractionError('empty-path');
  return decoded;
}

function normalizeOutputPath(rawPath: string, limits: UnityPackageStreamingLimits): { path: string; directory: boolean } {
  if (new TextEncoder().encode(rawPath).byteLength > limits.maxPathBytes) throw extractionError('path-too-long', String(rawPath.length));
  if (rawPath.includes('\0')) throw extractionError('path-unsafe');
  const replaced = rawPath.replace(/\\/g, '/');
  if (replaced.startsWith('/') || replaced.startsWith('//') || /^[A-Za-z]:\//.test(replaced)) throw extractionError('path-unsafe', rawPath);
  const directory = replaced.endsWith('/');
  const parts = replaced.split('/').filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) throw extractionError('path-unsafe', rawPath);
  return { path: parts.join('/'), directory };
}

function validateOutputConflicts(entries: UnityPackageIndexEntry[]): void {
  const paths = new Set<string>();
  const filePaths = new Set<string>();
  for (const entry of entries) {
    if (paths.has(entry.path)) throw extractionError('duplicate-path', entry.path);
    paths.add(entry.path);
    if (entry.kind === 'file') filePaths.add(entry.path);
  }
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let ancestor = '';
    for (let index = 0; index < parts.length - 1; index += 1) {
      ancestor = ancestor ? `${ancestor}/${parts[index]}` : parts[index];
      if (filePaths.has(ancestor)) throw extractionError('path-conflict', `${ancestor} -> ${entry.path}`);
    }
  }
}
