#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const MIB = 1024 * 1024;
const TAR_BLOCK_SIZE = 512;
const DEFAULT_CHUNK_BYTES = 256 * 1024;
const DEFAULT_PAYLOAD_MIB = 1;
const DEFAULT_SEED = 0x20260910;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.output) {
  throw new Error('缺少 --output；使用 --help 查看用法。');
}

const outputPath = resolve(args.output);
const manifestPath = resolve(args.manifest ?? `${outputPath}.json`);
await assertWritableTarget(outputPath, args.force);
await assertWritableTarget(manifestPath, args.force);
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(manifestPath), { recursive: true });

const fixture = createFixture(args.payloadBytes, args.seed);
const expandedHash = createHash('sha256');
const compressedHash = createHash('sha256');
const expandedTracker = createHashingCounter(expandedHash);
const compressedTracker = createHashingCounter(compressedHash);

const startedAt = performance.now();
await pipeline(
  Readable.from(tarChunks(fixture.tarEntries, args.chunkBytes)),
  expandedTracker,
  createGzip({ level: args.compressionLevel, mtime: 0 }),
  compressedTracker,
  createWriteStream(outputPath, { flags: args.force ? 'w' : 'wx' }),
);

const manifest = {
  schemaVersion: 1,
  format: 'unitypackage-fixture',
  reproducibility: {
    seed: args.seed,
    payloadBytes: args.payloadBytes,
    chunkBytes: args.chunkBytes,
    compressionLevel: args.compressionLevel,
  },
  package: {
    fileName: basename(outputPath),
    compressedBytes: compressedTracker.bytes,
    compressedSha256: compressedHash.digest('hex'),
    expandedTarBytes: expandedTracker.bytes,
    expandedTarSha256: expandedHash.digest('hex'),
    extractedAssetBytes: fixture.assets.reduce((total, asset) => total + asset.size, 0),
  },
  coverage: {
    assetBeforePathname: fixture.coverage.assetBeforePathname,
    pathnameBeforeAsset: fixture.coverage.pathnameBeforeAsset,
    unicodePath: fixture.assets.some((asset) => /[^\x00-\x7f]/u.test(asset.pathname)),
    zeroByteAssets: fixture.assets.filter((asset) => asset.size === 0).length,
    interleavedGroups: fixture.coverage.interleavedGroups,
  },
  assets: fixture.assets.map((asset) => ({
    guid: asset.guid,
    pathname: asset.pathname,
    size: asset.size,
    sha256: asset.sha256,
  })),
  tarEntries: fixture.tarEntries.map((entry) => ({
    path: entry.path,
    guid: entry.guid,
    member: entry.member,
    size: entry.size,
    sha256: entry.sha256,
  })),
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: args.force ? 'w' : 'wx',
});

console.log(JSON.stringify({
  output: outputPath,
  manifest: manifestPath,
  compressedBytes: manifest.package.compressedBytes,
  compressedSha256: manifest.package.compressedSha256,
  expandedTarBytes: manifest.package.expandedTarBytes,
  expandedTarSha256: manifest.package.expandedTarSha256,
  extractedAssetBytes: manifest.package.extractedAssetBytes,
  assetCount: manifest.assets.length,
  zeroByteAssets: manifest.coverage.zeroByteAssets,
  elapsedMs: Math.round(performance.now() - startedAt),
}, null, 2));

function parseArgs(argv) {
  const parsed = {
    output: undefined,
    manifest: undefined,
    payloadBytes: DEFAULT_PAYLOAD_MIB * MIB,
    chunkBytes: DEFAULT_CHUNK_BYTES,
    compressionLevel: 0,
    seed: DEFAULT_SEED,
    force: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.help = true;
      continue;
    }
    if (argument === '--force') {
      parsed.force = true;
      continue;
    }

    const [name, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? argv[++index];

    if (name === '--output') parsed.output = requiredValue(name, value);
    else if (name === '--manifest') parsed.manifest = requiredValue(name, value);
    else if (name === '--payload-mib') parsed.payloadBytes = parsePositiveInteger(name, value) * MIB;
    else if (name === '--chunk-kib') parsed.chunkBytes = parseRange(name, value, 4, 8192) * 1024;
    else if (name === '--compression-level') parsed.compressionLevel = parseRange(name, value, 0, 9);
    else if (name === '--seed') parsed.seed = parseSeed(value);
    else throw new Error(`未知参数：${argument}`);
  }

  return parsed;
}

function requiredValue(name, value) {
  if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个值。`);
  return value;
}

function parsePositiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} 必须是非负整数：${value}`);
  }
  return parsed;
}

function parseRange(name, value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} 必须是 ${minimum} 到 ${maximum} 之间的整数：${value}`);
  }
  return parsed;
}

function parseSeed(value) {
  if (!value || value.startsWith('--')) throw new Error('--seed 需要一个值。');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    throw new Error(`--seed 必须是 32 位非负整数：${value}`);
  }
  return parsed >>> 0;
}

async function assertWritableTarget(filePath, force) {
  try {
    await stat(filePath);
    if (!force) {
      throw new Error(`目标已存在：${filePath}（如需覆盖请显式使用 --force）`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function createFixture(payloadBytes, seed) {
  const assets = [
    {
      guid: '11111111111111111111111111111111',
      pathname: 'Assets/Streaming QA/文本/fixture-note.txt',
      source: bufferSource(Buffer.from('streaming fixture: text asset\n', 'utf8')),
    },
    {
      guid: '22222222222222222222222222222222',
      pathname: 'Assets/Streaming QA/空文件/zero-byte.asset',
      source: bufferSource(Buffer.alloc(0)),
    },
    {
      guid: '33333333333333333333333333333333',
      pathname: 'Assets/Streaming QA/日本語と中文/零字节.bin',
      source: bufferSource(Buffer.alloc(0)),
    },
    {
      guid: '44444444444444444444444444444444',
      pathname: 'Assets/Streaming QA/大型/分块随机内容.bin',
      source: randomSource(payloadBytes, seed ^ 0x44444444),
    },
  ];

  for (const asset of assets) attachSourceForMember(asset);

  const order = [
    [assets[3], 'asset'],
    [assets[0], 'pathname'],
    [assets[1], 'asset'],
    [assets[2], 'pathname'],
    [assets[3], 'pathname'],
    [assets[2], 'asset'],
    [assets[0], 'asset'],
    [assets[1], 'pathname'],
  ];

  const tarEntries = order.map(([asset, member]) => {
    const source = asset.sourceFor(member);
    return {
      path: `${asset.guid}/${member}`,
      guid: asset.guid,
      member,
      source,
      size: source.size,
      sha256: undefined,
      asset,
    };
  });

  return {
    assets,
    tarEntries,
    coverage: {
      assetBeforePathname: order.some(([asset, member], index) => member === 'asset' && order.slice(index + 1).some(([nextAsset, nextMember]) => nextAsset === asset && nextMember === 'pathname')),
      pathnameBeforeAsset: order.some(([asset, member], index) => member === 'pathname' && order.slice(index + 1).some(([nextAsset, nextMember]) => nextAsset === asset && nextMember === 'asset')),
      interleavedGroups: new Set(order.map(([asset]) => asset.guid)).size > 1,
    },
  };
}

function bufferSource(buffer) {
  return {
    type: 'buffer',
    size: buffer.byteLength,
    chunks() {
      return [buffer];
    },
  };
}

function randomSource(size, seed) {
  return {
    type: 'random',
    size,
    seed: seed >>> 0,
    chunks(chunkBytes) {
      return randomChunks(size, seed, chunkBytes);
    },
  };
}

function attachSourceForMember(asset) {
  asset.sourceFor = (member) => member === 'pathname'
    ? bufferSource(Buffer.from(asset.pathname, 'utf8'))
    : asset.source;
  asset.size = asset.source.size;
  asset.sha256 = undefined;
  return asset;
}

function* tarChunks(entries, chunkBytes) {
  for (const entry of entries) {
    const hash = createHash('sha256');
    let actualSize = 0;
    yield createTarHeader(entry.path, entry.size);

    for (const chunk of entry.source.chunks(chunkBytes)) {
      hash.update(chunk);
      actualSize += chunk.byteLength;
      yield chunk;
    }

    if (actualSize !== entry.size) {
      throw new Error(`夹具成员长度错误：${entry.path}，期望 ${entry.size}，实际 ${actualSize}`);
    }

    const padding = (TAR_BLOCK_SIZE - (actualSize % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE;
    if (padding > 0) yield Buffer.alloc(padding);

    entry.sha256 = hash.digest('hex');
    if (entry.member === 'asset') entry.asset.sha256 = entry.sha256;
  }

  yield Buffer.alloc(TAR_BLOCK_SIZE * 2);
}

function* randomChunks(size, seed, chunkBytes) {
  let remaining = size;
  let state = seed >>> 0;

  while (remaining > 0) {
    const currentSize = Math.min(remaining, chunkBytes);
    const chunk = Buffer.allocUnsafe(currentSize);

    for (let index = 0; index < currentSize; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      chunk[index] = state & 0xff;
    }

    remaining -= currentSize;
    yield chunk;
  }
}

function createTarHeader(path, size) {
  const header = Buffer.alloc(TAR_BLOCK_SIZE, 0);
  writeStringField(header, 0, 100, path);
  writeOctalField(header, 100, 8, 0o100644);
  writeOctalField(header, 108, 8, 0);
  writeOctalField(header, 116, 8, 0);
  writeOctalField(header, 124, 12, size);
  writeOctalField(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeStringField(header, 257, 6, 'ustar');
  writeStringField(header, 263, 2, '00');
  writeStringField(header, 265, 32, 'udon-qa');
  writeStringField(header, 297, 32, 'udon-qa');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  writeChecksumField(header, checksum);
  return header;
}

function writeStringField(buffer, offset, length, value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > length) {
    throw new Error(`TAR 字段过长：${value}`);
  }
  bytes.copy(buffer, offset);
}

function writeOctalField(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, '0');
  if (text.length > length - 1) throw new Error(`TAR 八进制字段溢出：${value}`);
  buffer.write(text, offset, length - 1, 'ascii');
  buffer[offset + length - 1] = 0;
}

function writeChecksumField(buffer, value) {
  const text = value.toString(8).padStart(6, '0');
  buffer.write(text, 148, 6, 'ascii');
  buffer[154] = 0;
  buffer[155] = 0x20;
}

function createHashingCounter(hash) {
  const tracker = new Transform({
    transform(chunk, encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      hash.update(bytes);
      tracker.bytes += bytes.byteLength;
      callback(null, bytes);
    },
  });
  tracker.bytes = 0;
  return tracker;
}

function printHelp() {
  console.log(`用法：
  node scripts/unitypackage-extractor/generate-fixture.mjs \\
    --output /private/tmp/unitypackage-streaming-qa/fixture-small.unitypackage \\
    --manifest /private/tmp/unitypackage-streaming-qa/fixture-small.json \\
    --payload-mib 1

选项：
  --output PATH              gzip+TAR 输出文件（必填）
  --manifest PATH            夹具清单；默认是 PATH.json
  --payload-mib N             随机 asset 的展开字节数（默认 1 MiB）
  --chunk-kib N               生成块大小（4..8192 KiB，默认 256 KiB）
  --compression-level N       gzip 等级（0..9，默认 0；0 适合低压缩率大包）
  --seed N                    确定性 32 位种子（默认 0x20260910）
  --force                     允许覆盖明确指定的两个输出文件
  --help                      显示帮助

接近 1 GiB 的低压缩率包示例（仅准备命令，不会自动执行）：
  node scripts/unitypackage-extractor/generate-fixture.mjs \\
    --output /private/tmp/unitypackage-streaming-qa/fixture-896m.unitypackage \\
    --payload-mib 896 --compression-level 0 --chunk-kib 1024
`);
}
