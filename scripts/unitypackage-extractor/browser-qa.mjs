#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { connectCdp, delay, fetchJson, waitForHttp, waitForJson } from './cdp-client.mjs';

const QA_ROOT = '/private/tmp/unitypackage-streaming-qa';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_BASE_URL = 'http://127.0.0.1:4322';
const DEFAULT_TOOL_PATH = '/tools/unitypackage-extractor';
const DEFAULT_MODULE_URL = '/src/lib/unitypackage-extractor/browser.ts';
const DEFAULT_TIMEOUT_MS = 120_000;

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const outputDir = options.outputDir
  ? resolve(options.outputDir)
  : await mkdtemp(join(QA_ROOT, 'browser-run-'));
await mkdir(outputDir, { recursive: true });

const summary = {
  schemaVersion: 1,
  mode: options.mode,
  outputDir,
  status: 'RUNNING',
  artifacts: [],
};

let serverRuntime;
let chromeRuntime;

try {
  const manifest = options.manifest ? await loadManifest(options.manifest) : undefined;

  if (options.startServer) {
    serverRuntime = await startDevServer(outputDir, options);
  }

  const baseUrl = serverRuntime?.url ?? options.baseUrl;
  const firstUrl = options.url ?? buildToolUrl(baseUrl, options.toolPath, options.locale);
  if (!firstUrl) throw new Error('缺少测试 URL；请提供 --url 或 --base-url。');
  if (!firstUrl.startsWith('about:')) await waitForHttp(firstUrl, { timeoutMs: options.timeoutMs });

  chromeRuntime = await launchChrome(outputDir, firstUrl, options);
  const { browser, page } = chromeRuntime;

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('DOM.enable');
  await page.send('Network.enable');
  await configureDownloads(browser, outputDir);
  await installTestInstrumentation(page, options);

  const result = await runMode({
    browser,
    page,
    manifest,
    outputDir,
    options,
    baseUrl,
  });

  summary.status = result.status ?? 'PASS';
  summary.result = result;
  summary.server = serverRuntime?.summary;
  summary.chrome = chromeRuntime.summary;
} catch (error) {
  summary.status = 'FAIL';
  summary.error = serializeError(error);
  process.exitCode = 1;
} finally {
  if (chromeRuntime) {
    try {
      await chromeRuntime.close();
    } catch (error) {
      summary.cleanupError = serializeError(error);
      process.exitCode = 1;
    }
  }
  if (serverRuntime) {
    try {
      await serverRuntime.close();
    } catch (error) {
      summary.cleanupError = serializeError(error);
      process.exitCode = 1;
    }
  }
}

await writeJson(join(outputDir, 'run-summary.json'), summary);
console.log(JSON.stringify(summary, null, 2));

function parseArgs(argv) {
  const parsed = {
    mode: 'capabilities',
    outputDir: undefined,
    url: undefined,
    baseUrl: DEFAULT_BASE_URL,
    toolPath: DEFAULT_TOOL_PATH,
    locale: 'en',
    locales: ['en', 'ja', 'zh-CN'],
    viewport: { width: 1440, height: 900, label: 'desktop' },
    chromePath: DEFAULT_CHROME,
    fixture: undefined,
    manifest: undefined,
    fileSelector: 'input[type="file"]',
    downloadSelector: 'a[download]',
    pickerSelector: undefined,
    cancelSelector: undefined,
    resetSelector: undefined,
    moduleUrl: DEFAULT_MODULE_URL,
    masks: [],
    startServer: false,
    serverPort: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cancelDelayMs: 250,
    resetDelayMs: 250,
    keepProfile: false,
    keepOpfs: false,
    dispatchFileChange: false,
    useOpfsDirectory: false,
    writerDelayMs: 0,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      parsed.help = true;
      continue;
    }
    if (argument === '--start-server') {
      parsed.startServer = true;
      continue;
    }
    if (argument === '--keep-profile') {
      parsed.keepProfile = true;
      continue;
    }
    if (argument === '--keep-opfs') {
      parsed.keepOpfs = true;
      continue;
    }
    if (argument === '--dispatch-file-change') {
      parsed.dispatchFileChange = true;
      continue;
    }
    if (argument === '--opfs-directory') {
      parsed.useOpfsDirectory = true;
      continue;
    }

    const [name, inlineValue] = argument.split('=', 2);
    const value = inlineValue ?? argv[++index];

    if (name === '--mode') parsed.mode = requiredValue(name, value);
    else if (name === '--output-dir') parsed.outputDir = requiredValue(name, value);
    else if (name === '--url') parsed.url = requiredValue(name, value);
    else if (name === '--base-url') parsed.baseUrl = requiredValue(name, value).replace(/\/$/u, '');
    else if (name === '--tool-path') parsed.toolPath = requiredValue(name, value);
    else if (name === '--locale') parsed.locale = requiredValue(name, value);
    else if (name === '--locales') parsed.locales = requiredValue(name, value).split(',').map((item) => item.trim()).filter(Boolean);
    else if (name === '--viewport') parsed.viewport = parseViewport(requiredValue(name, value));
    else if (name === '--chrome') parsed.chromePath = requiredValue(name, value);
    else if (name === '--fixture') parsed.fixture = requiredValue(name, value);
    else if (name === '--manifest') parsed.manifest = requiredValue(name, value);
    else if (name === '--file-selector') parsed.fileSelector = requiredValue(name, value);
    else if (name === '--download-selector') parsed.downloadSelector = requiredValue(name, value);
    else if (name === '--picker-selector') parsed.pickerSelector = requiredValue(name, value);
    else if (name === '--cancel-selector') parsed.cancelSelector = requiredValue(name, value);
    else if (name === '--reset-selector') parsed.resetSelector = requiredValue(name, value);
    else if (name === '--module-url') parsed.moduleUrl = requiredValue(name, value);
    else if (name === '--mask') parsed.masks.push(requiredValue(name, value));
    else if (name === '--server-port') parsed.serverPort = parseInteger(name, value, 1, 65535);
    else if (name === '--timeout-ms') parsed.timeoutMs = parseInteger(name, value, 1, 3_600_000);
    else if (name === '--cancel-delay-ms') parsed.cancelDelayMs = parseInteger(name, value, 0, 60_000);
    else if (name === '--reset-delay-ms') parsed.resetDelayMs = parseInteger(name, value, 0, 60_000);
    else if (name === '--writer-delay-ms') parsed.writerDelayMs = parseInteger(name, value, 0, 5000);
    else throw new Error(`未知参数：${argument}`);
  }

  const validModes = new Set(['capabilities', 'capture', 'matrix', 'hash-smoke', 'opfs', 'fallback', 'permission-rejection', 'race']);
  if (!validModes.has(parsed.mode)) throw new Error(`不支持的 --mode：${parsed.mode}`);
  if (parsed.mode === 'matrix' && parsed.url) throw new Error('--mode matrix 使用 --base-url，不与 --url 同时使用。');
  if (parsed.mode === 'opfs' || parsed.mode === 'fallback' || parsed.mode === 'race') {
    if (!parsed.fixture || !parsed.manifest) throw new Error(`${parsed.mode} 模式需要同时提供 --fixture 和 --manifest。`);
  }
  if (parsed.mode === 'permission-rejection' && !parsed.pickerSelector) {
    throw new Error('permission-rejection 模式需要 --picker-selector。');
  }
  if (parsed.mode === 'race' && !parsed.cancelSelector && !parsed.resetSelector) {
    throw new Error('race 模式至少需要 --cancel-selector 或 --reset-selector。');
  }
  if (parsed.mode === 'fallback' && parsed.masks.length === 0) parsed.masks.push('showDirectoryPicker');

  return parsed;
}

function requiredValue(name, value) {
  if (!value || value.startsWith('--')) throw new Error(`${name} 需要一个值。`);
  return value;
}

function parseInteger(name, value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} 必须是 ${minimum} 到 ${maximum} 之间的整数：${value}`);
  }
  return parsed;
}

function parseViewport(value) {
  const match = /^(\d+)x(\d+)$/u.exec(value);
  if (!match) throw new Error(`--viewport 必须是 WIDTHxHEIGHT：${value}`);
  const width = parseInteger('--viewport width', match[1], 200, 10_000);
  const height = parseInteger('--viewport height', match[2], 200, 10_000);
  return { width, height, label: `${width}x${height}` };
}

async function loadManifest(manifestPath) {
  const parsed = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  if (!Array.isArray(parsed.assets) || parsed.assets.length === 0) {
    throw new Error(`清单缺少 assets：${manifestPath}`);
  }
  for (const asset of parsed.assets) {
    if (typeof asset.pathname !== 'string' || typeof asset.sha256 !== 'string' || !Number.isSafeInteger(asset.size)) {
      throw new Error(`清单 asset 字段无效：${JSON.stringify(asset)}`);
    }
  }
  return parsed;
}

function buildToolUrl(baseUrl, toolPath, locale) {
  if (!baseUrl) return undefined;
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const path = `${prefix}${toolPath.startsWith('/') ? toolPath : `/${toolPath}`}`;
  return `${baseUrl.replace(/\/$/u, '')}${path}`;
}

async function startDevServer(outputDir, testOptions) {
  const port = testOptions.serverPort ?? await getFreePort();
  const url = `http://127.0.0.1:${port}`;
  const logPath = join(outputDir, 'dev-server.log');
  const logStream = createWriteStream(logPath, { flags: 'w' });
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);
  await waitForHttp(url, { timeoutMs: testOptions.timeoutMs });

  return {
    url,
    summary: { url, port, logPath },
    async close() {
      await stopChild(child);
      logStream.end();
    },
  };
}

async function launchChrome(outputDir, firstUrl, testOptions) {
  const profileDir = await mkdtemp(join(QA_ROOT, 'chrome-profile-'));
  const debugPort = await getFreePort();
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1440,900',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];
  const child = spawn(testOptions.chromePath, args, { stdio: 'ignore' });
  const endpoint = `http://127.0.0.1:${debugPort}`;
  const version = await waitForJson(`${endpoint}/json/version`, { timeoutMs: testOptions.timeoutMs });
  const browser = await connectCdp(version.webSocketDebuggerUrl, { commandTimeoutMs: testOptions.timeoutMs });
  const targets = await waitForJson(`${endpoint}/json/list`, { timeoutMs: testOptions.timeoutMs });
  const pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!pageTarget) throw new Error('独立 Chrome 没有可连接的 page target。');
  const page = await connectCdp(pageTarget.webSocketDebuggerUrl, { commandTimeoutMs: testOptions.timeoutMs });

  const runtime = {
    browser,
    page,
    summary: {
      executable: testOptions.chromePath,
      debugPort,
      profileDir,
      userDataIsolated: true,
      firstUrl,
    },
    async close() {
      await page.close();
      await browser.close();
      await stopChild(child);
      if (!testOptions.keepProfile && profileDir.startsWith(`${QA_ROOT}/`)) {
        await rm(profileDir, { recursive: true, force: true });
      }
    },
  };

  await page.send('Page.navigate', { url: 'about:blank' });
  return runtime;
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolvePromise, reject) => {
    server.close((error) => error ? reject(error) : resolvePromise());
  });
  if (!port) throw new Error('无法分配本地测试端口。');
  return port;
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    delay(3000),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function configureDownloads(browser, outputDir) {
  const downloadDir = join(outputDir, 'downloads');
  await mkdir(downloadDir, { recursive: true });
  try {
    await browser.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
  } catch {
    await browser.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });
  }
}

async function installTestInstrumentation(page, testOptions) {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: workerInstrumentationSource() });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: mutationInstrumentationSource() });
  if (testOptions.masks.length > 0) {
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: capabilityMaskSource(testOptions.masks),
    });
  }
  if (testOptions.mode === 'permission-rejection') {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: pickerPermissionDeniedSource() });
  }
  if (testOptions.useOpfsDirectory) {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: opfsPickerSource() });
  }
  if (testOptions.writerDelayMs > 0) {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: writerDelaySource(testOptions.writerDelayMs) });
  }
}

async function runMode({ browser, page, manifest, outputDir, options: testOptions, baseUrl }) {
  if (testOptions.mode === 'matrix') return runCaptureMatrix(page, outputDir, testOptions, baseUrl);
  if (testOptions.mode === 'hash-smoke') return runHashSmoke(page, outputDir, testOptions, baseUrl);
  if (testOptions.mode === 'opfs') return runOpfs(page, manifest, outputDir, testOptions, baseUrl);
  if (testOptions.mode === 'fallback') return runFallback(browser, page, manifest, outputDir, testOptions, baseUrl);
  if (testOptions.mode === 'permission-rejection') return runPermissionRejection(page, outputDir, testOptions, baseUrl);
  if (testOptions.mode === 'race') return runRace(page, manifest, outputDir, testOptions, baseUrl);

  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  await setViewport(page, testOptions.viewport);
  await goto(page, url, testOptions.timeoutMs);
  const capabilities = await readCapabilities(page, testOptions.timeoutMs);
  const artifacts = await capturePageArtifacts(page, outputDir, `${testOptions.viewport.label}-${testOptions.locale}`);
  return { status: 'PASS', url, capabilities, artifacts };
}

async function runCaptureMatrix(page, outputDir, testOptions, baseUrl) {
  const viewports = [
    { width: 1440, height: 900, label: 'desktop' },
    { width: 390, height: 844, label: 'mobile-390' },
  ];
  const captures = [];

  for (const locale of testOptions.locales) {
    const url = buildToolUrl(baseUrl, testOptions.toolPath, locale);
    for (const viewport of viewports) {
      await setViewport(page, viewport);
      await goto(page, url, testOptions.timeoutMs);
      const capabilities = await readCapabilities(page, testOptions.timeoutMs);
      const artifacts = await capturePageArtifacts(page, outputDir, `${viewport.label}-${locale}`);
      captures.push({ locale, viewport, url, capabilities, artifacts });
    }
  }

  return { status: 'PASS', captures };
}

async function runHashSmoke(page, outputDir, testOptions, baseUrl) {
  await setViewport(page, testOptions.viewport);
  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  if (!url || url.startsWith('about:')) throw new Error('hash-smoke 需要可信 loopback 页面；请提供 HTTP --url 或使用 --start-server。');
  await goto(page, url, testOptions.timeoutMs);
  const result = await evaluate(page, `(async () => {
    ${browserSha256Source()}
    const samples = [new Uint8Array(0), new TextEncoder().encode('abc'), new Uint8Array(129).fill(0x5a)];
    const actual = [];
    const expected = [];
    for (const sample of samples) {
      const hasher = new QaSha256();
      for (let offset = 0; offset < sample.byteLength; offset += 7) hasher.update(sample.subarray(offset, offset + 7));
      actual.push(hasher.digest());
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', sample));
      expected.push(Array.from(digest).map((value) => value.toString(16).padStart(2, '0')).join(''));
    }
    return { actual, expected, pass: actual.every((value, index) => value === expected[index]) };
  })()`, testOptions.timeoutMs);
  await writeJson(join(outputDir, 'browser-sha256-smoke.json'), result);
  if (!result.pass) throw new Error('浏览器增量 SHA-256 smoke 失败。');
  return { status: 'PASS', evidenceLayer: 'BROWSER_HASH_IMPLEMENTATION', url, result };
}

async function runOpfs(page, manifest, outputDir, testOptions, baseUrl) {
  if (testOptions.useOpfsDirectory) {
    return runUiOpfs(page, manifest, outputDir, testOptions, baseUrl);
  }

  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  await setViewport(page, testOptions.viewport);
  await goto(page, url, testOptions.timeoutMs);
  await waitForSelector(page, testOptions.fileSelector, testOptions.timeoutMs);
  await setFileInput(page, testOptions.fileSelector, testOptions.fixture, false, testOptions.timeoutMs);

  const parentName = `udon-qa-${randomUUID()}`;
  const extraction = await evaluate(page, buildOpfsExtractionExpression({
    fileSelector: testOptions.fileSelector,
    moduleUrl: testOptions.moduleUrl,
    parentName,
  }), testOptions.timeoutMs);
  await writeJson(join(outputDir, 'opfs-extraction.json'), extraction);

  let verification;
  try {
    if (!extraction.ok) throw new Error(extraction.error?.message ?? '浏览器抽取失败。');
    verification = await evaluate(page, buildOpfsVerificationExpression({
      parentName,
      directoryName: extraction.result.directoryName,
      expectedAssets: manifest.assets,
    }), testOptions.timeoutMs);
  } finally {
    if (!testOptions.keepOpfs) {
      await evaluate(page, buildOpfsCleanupExpression(parentName), testOptions.timeoutMs);
    }
  }

  await writeJson(join(outputDir, 'opfs-verification.json'), verification);
  const worker = await evaluate(page, 'globalThis.__unityQaWorker ?? null', testOptions.timeoutMs);
  const mutations = await evaluate(page, 'globalThis.__unityQaMutations ?? []', testOptions.timeoutMs);
  const artifacts = await capturePageArtifacts(page, outputDir, `${testOptions.viewport.label}-${testOptions.locale}`);
  const status = verification.pass ? 'PASS' : 'FAIL';
  if (status === 'FAIL') throw new Error('OPFS 输出逐文件校验失败；详情见 opfs-verification.json。');

  return {
    status,
    evidenceLayer: 'OPFS_DIRECT_API',
    url,
    extraction,
    verification,
    worker,
    mutations,
    artifacts,
  };
}

async function runUiOpfs(page, manifest, outputDir, testOptions, baseUrl) {
  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  await setViewport(page, testOptions.viewport);
  await goto(page, url, testOptions.timeoutMs);
  await waitForSelector(page, testOptions.fileSelector, testOptions.timeoutMs);
  await evaluate(page, browserRuntimeMetricsStartSource(), testOptions.timeoutMs);

  const pickerSelector = testOptions.pickerSelector ?? '.unitypackage-extractor-tool button.primary';
  await clickSelector(page, pickerSelector, testOptions.timeoutMs);
  await waitForCondition(page, `document.querySelector(${JSON.stringify(testOptions.fileSelector)})?.disabled === false`, testOptions.timeoutMs);
  await setFileInput(page, testOptions.fileSelector, testOptions.fixture, true, testOptions.timeoutMs);
  await waitForCondition(
    page,
    `/Extraction complete|展開が完了しました|解包完成/u.test(document.body?.innerText ?? '')`,
    testOptions.timeoutMs,
  );
  const runtimeMetrics = await evaluate(page, browserRuntimeMetricsFinishSource(), testOptions.timeoutMs);

  const pickerState = await evaluate(page, `(() => ({
    parentName: globalThis.__unityQaPickerDirectoryName ?? null,
    isOpfs: globalThis.__unityQaPickerIsOpfs === true,
  }))()`, testOptions.timeoutMs);
  if (!pickerState.parentName || !pickerState.isOpfs) throw new Error('未观察到 harness 的 OPFS picker 标记。');
  const outputDirectories = await evaluate(page, buildOpfsChildDirectoryExpression(pickerState.parentName), testOptions.timeoutMs);
  if (outputDirectories.length !== 1) {
    throw new Error(`UI 流式路径预期一个输出子目录，实际 ${outputDirectories.length} 个：${outputDirectories.join(', ')}`);
  }

  const verification = await evaluate(page, buildOpfsVerificationExpression({
    parentName: pickerState.parentName,
    directoryName: outputDirectories[0],
    expectedAssets: manifest.assets,
  }), testOptions.timeoutMs);
  const ui = await readUiSnapshot(page, testOptions.timeoutMs);
  const worker = await evaluate(page, 'globalThis.__unityQaWorker ?? null', testOptions.timeoutMs);
  const mutations = await evaluate(page, 'globalThis.__unityQaMutations ?? []', testOptions.timeoutMs);
  const artifacts = await capturePageArtifacts(page, outputDir, `${testOptions.viewport.label}-${testOptions.locale}-ui-success`);
  const successVisible = /Extraction complete|展開が完了しました|解包完成/u.test(ui.text);
  const fallbackVisible = /Download ZIP|ZIP をダウンロード|下载 ZIP/u.test(ui.text);
  const status = verification.pass && successVisible && !fallbackVisible ? 'PASS' : 'FAIL';

  await writeJson(join(outputDir, 'ui-opfs-verification.json'), {
    pickerState,
    outputDirectories,
    verification,
    ui,
    worker,
    runtimeMetrics,
  });
  if (!testOptions.keepOpfs) {
    await evaluate(page, buildOpfsCleanupExpression(pickerState.parentName), testOptions.timeoutMs);
  }
  if (status === 'FAIL') throw new Error('UI 流式 OPFS 输出或成功状态检查失败；详情见 ui-opfs-verification.json。');

  return {
    status,
    evidenceLayer: 'OPFS_SIMULATED_PICKER',
    nativePicker: false,
    url,
    pickerState,
    outputDirectories,
    verification,
    ui,
    worker,
    runtimeMetrics,
    mutations,
    artifacts,
  };
}

async function runFallback(browser, page, manifest, outputDir, testOptions, baseUrl) {
  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  await setViewport(page, testOptions.viewport);
  await goto(page, url, testOptions.timeoutMs);
  await waitForSelector(page, testOptions.fileSelector, testOptions.timeoutMs);
  await setFileInput(page, testOptions.fileSelector, testOptions.fixture, true, testOptions.timeoutMs);
  await waitForSelector(page, testOptions.downloadSelector, testOptions.timeoutMs);
  const download = waitForDownload(browser, page, testOptions.timeoutMs);
  await clickSelector(page, testOptions.downloadSelector, testOptions.timeoutMs);
  const downloadInfo = await download;
  const zipPath = join(outputDir, 'downloads', downloadInfo.suggestedFilename);
  const zipBytes = await readFile(zipPath);
  const verification = verifyZip(zipBytes, manifest.assets);
  await writeJson(join(outputDir, 'fallback-zip-verification.json'), verification);
  const ui = await readUiSnapshot(page, testOptions.timeoutMs);
  const artifacts = await capturePageArtifacts(page, outputDir, `${testOptions.viewport.label}-${testOptions.locale}`);
  const status = verification.pass && ui.hasLegacyLimit ? 'PASS' : 'FAIL';
  if (status === 'FAIL') throw new Error('兼容模式 ZIP 或 80 MiB 限额检查失败；详情见输出 JSON。');

  return {
    status,
    evidenceLayer: 'BROWSER_ZIP_FALLBACK',
    url,
    download: { ...downloadInfo, path: zipPath, bytes: zipBytes.byteLength },
    verification,
    ui,
    artifacts,
  };
}

async function runPermissionRejection(page, outputDir, testOptions, baseUrl) {
  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  await setViewport(page, testOptions.viewport);
  await goto(page, url, testOptions.timeoutMs);
  await waitForSelector(page, testOptions.pickerSelector, testOptions.timeoutMs);
  const before = await readUiSnapshot(page, testOptions.timeoutMs);
  await clickSelector(page, testOptions.pickerSelector, testOptions.timeoutMs);
  await waitForCondition(
    page,
    `/Directory access was denied|フォルダーへのアクセスが拒否されました|目录访问被拒绝/u.test(document.body?.innerText ?? '')`,
    testOptions.timeoutMs,
  );
  const after = await readUiSnapshot(page, testOptions.timeoutMs);
  const mutations = await evaluate(page, 'globalThis.__unityQaMutations ?? []', testOptions.timeoutMs);
  const artifacts = await capturePageArtifacts(page, outputDir, `${testOptions.viewport.label}-${testOptions.locale}`);
  const assertions = {
    streamingUiVisible: /Streaming mode|ストリーミングモード|流式模式/u.test(after.text),
    permissionErrorVisible: /Directory access was denied|フォルダーへのアクセスが拒否されました|目录访问被拒绝/u.test(after.text),
    fallbackNotVisible: !/Download ZIP|ZIP をダウンロード|下载 ZIP/u.test(after.text),
    legacyFallbackLimitNotVisible: !after.hasLegacyLimit,
  };
  const status = Object.values(assertions).every(Boolean) ? 'PASS' : 'FAIL';
  const result = {
    status,
    evidenceLayer: 'BROWSER_UI_SIMULATION',
    nativePickerOpened: false,
    url,
    before,
    after,
    assertions,
    mutations,
    artifacts,
  };
  await writeJson(join(outputDir, 'permission-rejection.json'), result);
  if (status === 'FAIL') throw new Error('模拟权限拒绝断言失败；详情见 permission-rejection.json。');

  return result;
}

async function runRace(page, manifest, outputDir, testOptions, baseUrl) {
  const url = testOptions.url ?? buildToolUrl(baseUrl, testOptions.toolPath, testOptions.locale);
  await setViewport(page, testOptions.viewport);
  await goto(page, url, testOptions.timeoutMs);
  if (testOptions.writerDelayMs > 0) {
    await evaluate(page, writerDelaySource(testOptions.writerDelayMs), testOptions.timeoutMs);
  }
  await waitForSelector(page, testOptions.fileSelector, testOptions.timeoutMs);
  if (testOptions.useOpfsDirectory) {
    const pickerSelector = testOptions.pickerSelector ?? '.unitypackage-extractor-tool button.primary';
    await clickSelector(page, pickerSelector, testOptions.timeoutMs);
    await waitForCondition(page, `document.querySelector(${JSON.stringify(testOptions.fileSelector)})?.disabled === false`, testOptions.timeoutMs);
  }
  await setFileInput(page, testOptions.fileSelector, testOptions.fixture, testOptions.dispatchFileChange, testOptions.timeoutMs);
  const actions = [];
  if (testOptions.useOpfsDirectory && testOptions.cancelSelector) {
    const readyCondition = testOptions.writerDelayMs > 0
      ? 'Boolean(globalThis.__unityQaWriterDelay?.wrapped > 0)'
      : 'Boolean(document.querySelector(\'.unitypackage-extractor-tool progress\'))';
    await waitForCondition(page, readyCondition, testOptions.timeoutMs);
  }

  if (testOptions.cancelSelector) {
    await delay(testOptions.cancelDelayMs);
    await clickSelector(page, testOptions.cancelSelector, testOptions.timeoutMs);
    await waitForCondition(
      page,
      `/The operation was cancelled|操作をキャンセルしました|操作已取消/u.test(document.body?.innerText ?? '')`,
      testOptions.timeoutMs,
    );
    actions.push({ action: 'cancel', selector: testOptions.cancelSelector, delayMs: testOptions.cancelDelayMs });
  }
  const afterCancelUi = testOptions.cancelSelector
    ? await readUiSnapshot(page, testOptions.timeoutMs)
    : null;
  const mutationCountBeforeReset = await evaluate(page, '(globalThis.__unityQaMutations ?? []).length', testOptions.timeoutMs);
  await evaluate(page, 'globalThis.__unityQaMutations?.splice(0); true', testOptions.timeoutMs);
  if (testOptions.resetSelector) {
    await delay(testOptions.resetDelayMs);
    await clickSelector(page, testOptions.resetSelector, testOptions.timeoutMs);
    actions.push({ action: 'reset', selector: testOptions.resetSelector, delayMs: testOptions.resetDelayMs });
  }
  await delay(Math.max(500, testOptions.writerDelayMs * 4));
  const ui = await readUiSnapshot(page, testOptions.timeoutMs);
  const resetMutations = await evaluate(page, 'globalThis.__unityQaMutations ?? []', testOptions.timeoutMs);
  const worker = await evaluate(page, 'globalThis.__unityQaWorker ?? null', testOptions.timeoutMs);
  const writerDelay = await evaluate(page, 'globalThis.__unityQaWriterDelay ?? null', testOptions.timeoutMs);
  const mutationObserver = await evaluate(page, `({
    installed: globalThis.__unityQaMutationObserverInstalled === true,
    runCount: ${mutationCountBeforeReset},
    resetCount: (globalThis.__unityQaMutations ?? []).length,
  })`, testOptions.timeoutMs);
  const mutations = await evaluate(page, 'globalThis.__unityQaMutations ?? []', testOptions.timeoutMs);
  const artifacts = await capturePageArtifacts(page, outputDir, `${testOptions.viewport.label}-${testOptions.locale}`);
  const cancelVisible = afterCancelUi?.text.includes('The operation was cancelled')
    || afterCancelUi?.text.includes('操作をキャンセルしました')
    || afterCancelUi?.text.includes('操作已取消');
  const cancelSuccessVisible = afterCancelUi?.text.includes('Extraction complete')
    || afterCancelUi?.text.includes('展開が完了しました')
    || afterCancelUi?.text.includes('解包完成');
  const successVisible = ui.text.includes('Extraction complete') || ui.text.includes('展開が完了しました') || ui.text.includes('解包完成');
  const progressVisible = Boolean(await evaluate(page, 'Boolean(document.querySelector(\'.unitypackage-extractor-tool progress\'))', testOptions.timeoutMs));
  const raceAssertions = {
    cancelMessageVisible: !testOptions.cancelSelector || Boolean(cancelVisible),
    successNotVisibleAfterCancel: !testOptions.cancelSelector || !cancelSuccessVisible,
    successNotVisibleAfterRace: !successVisible,
    progressNotVisibleAfterReset: !progressVisible,
    workerTerminated: !worker || worker.terminated >= worker.created,
    writerDelayInjected: testOptions.writerDelayMs === 0 || Boolean(writerDelay && writerDelay.wrapped > 0 && !writerDelay.error),
    mutationObserverInstalled: mutationObserver.installed,
    mutationObservedDuringRun: mutationObserver.runCount > 0,
    noPostResetStaleMutations: resetMutations.every((mutation) => !/Extraction complete|展開が完了しました|解包完成|Scanning package|Writing files|スキャン|書き込み|扫描|写入/u.test(mutation.text ?? '')),
  };
  const result = { status: Object.values(raceAssertions).every(Boolean) ? 'PASS' : 'FAIL', evidenceLayer: 'BROWSER_RACE_TRACE', url, actions, afterCancelUi, ui, worker, writerDelay, mutationObserver, mutations, resetMutations, raceAssertions, writerDelayMs: testOptions.writerDelayMs, expectedAssetCount: manifest.assets.length, artifacts };
  await writeJson(join(outputDir, 'race-trace.json'), result);
  if (testOptions.useOpfsDirectory) {
    await evaluate(page, `(() => {
      const name = globalThis.__unityQaPickerDirectoryName;
      if (!name) return false;
      return navigator.storage.getDirectory().then((root) => root.removeEntry(name, { recursive: true }).then(() => true));
    })()`, testOptions.timeoutMs);
  }
  if (result.status === 'FAIL') throw new Error('取消/Reset 竞态断言失败；详情见 race-trace.json。');
  return result;
}

async function setViewport(page, viewport) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width < 600,
  });
}

async function goto(page, url, timeoutMs) {
  const load = page.waitForEvent('Page.loadEventFired', { timeoutMs }).catch(() => undefined);
  const navigation = await page.send('Page.navigate', { url }, { timeoutMs });
  if (navigation.errorText) throw new Error(`页面导航失败：${navigation.errorText}`);
  await load;
  await waitForCondition(page, "document.readyState === 'complete'", timeoutMs);
  await evaluate(page, mutationInstrumentationSource(), timeoutMs);
}

async function waitForSelector(page, selector, timeoutMs) {
  await waitForCondition(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs);
}

async function waitForCondition(page, condition, timeoutMs) {
  const expression = `(async () => {
    const deadline = Date.now() + ${timeoutMs};
    while (Date.now() < deadline) {
      try {
        if (${condition}) return true;
      } catch {
        // 页面仍可能在导航或 React hydration 中。
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('页面条件等待超时');
  })()`;
  await evaluate(page, expression, timeoutMs + 1000);
}

async function setFileInput(page, selector, filePath, dispatchChange, timeoutMs) {
  const absolutePath = resolve(filePath);
  await stat(absolutePath);
  const documentResult = await page.send('DOM.getDocument', { depth: 0 }, { timeoutMs });
  const node = await page.send('DOM.querySelector', {
    nodeId: documentResult.root.nodeId,
    selector,
  }, { timeoutMs });
  if (!node.nodeId) throw new Error(`找不到文件 input：${selector}`);
  await page.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [absolutePath] }, { timeoutMs });
  if (dispatchChange) {
    await evaluate(page, `(function () {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error('file input disappeared');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { name: input.files?.[0]?.name ?? null, size: input.files?.[0]?.size ?? null };
    })()`, timeoutMs);
  }
}

async function clickSelector(page, selector, timeoutMs) {
  const rect = await evaluate(page, `(function () {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('selector not found: ' + ${JSON.stringify(selector)});
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`, timeoutMs);
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, { timeoutMs });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, { timeoutMs });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, { timeoutMs });
}

async function readCapabilities(page, timeoutMs) {
  return evaluate(page, `(() => ({
    isSecureContext: globalThis.isSecureContext,
    blobStream: typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function',
    decompressionStream: typeof globalThis.DecompressionStream === 'function',
    worker: typeof globalThis.Worker === 'function',
    fileSystemDirectoryHandle: typeof globalThis.FileSystemDirectoryHandle === 'function',
    fileSystemWritableFileStream: typeof globalThis.FileSystemWritableFileStream === 'function',
    showDirectoryPicker: typeof globalThis.showDirectoryPicker === 'function',
    opfsGetDirectory: typeof navigator.storage?.getDirectory === 'function',
    userAgent: navigator.userAgent,
    url: location.href,
  }))()`, timeoutMs);
}

async function readUiSnapshot(page, timeoutMs) {
  return evaluate(page, `(() => {
    const text = document.body?.innerText ?? '';
    return {
      text: text.slice(0, 6000),
      hasLegacyLimit: /80\\s*MiB/u.test(text),
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        text: (button.innerText ?? '').trim().slice(0, 200),
        disabled: button.disabled,
      })),
      url: location.href,
    };
  })()`, timeoutMs);
}

async function capturePageArtifacts(page, outputDir, stem) {
  const safeStem = stem.replace(/[^a-zA-Z0-9_-]+/gu, '_');
  const screenshotPath = join(outputDir, `${safeStem}.png`);
  const domPath = join(outputDir, `${safeStem}.html`);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const dom = await evaluate(page, 'document.documentElement?.outerHTML ?? ""', 30_000);
  await writeFile(domPath, dom, 'utf8');
  return { screenshotPath, domPath };
}

async function waitForDownload(browser, page, timeoutMs) {
  let started;
  const removeStartListener = page.on('Page.downloadWillBegin', (event) => {
    started = event;
  });
  try {
    const completed = await browser.waitForEvent('Browser.downloadProgress', {
      timeoutMs,
      predicate: (event) => event.state === 'completed',
    });
    return {
      guid: completed.guid,
      suggestedFilename: completed.suggestedFilename ?? started?.suggestedFilename,
      state: completed.state,
      url: started?.url,
    };
  } finally {
    removeStartListener();
  }
}

function verifyZip(bytes, expectedAssets) {
  const actual = [];
  let offset = 0;

  while (offset + 30 <= bytes.byteLength) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) throw new Error('ZIP local entry 越界。');
    const name = bytes.subarray(nameStart, dataStart - extraLength).toString('utf8');
    const compressed = bytes.subarray(dataStart, dataEnd);
    const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : undefined;
    if (!data) throw new Error(`ZIP 使用不支持的压缩方法：${method}`);
    if (data.byteLength !== uncompressedSize) throw new Error(`ZIP 未压缩长度不匹配：${name}`);
    actual.push({ path: name, size: data.byteLength, sha256: sha256Hex(data) });
    offset = dataEnd;
  }

  const expected = new Map(expectedAssets.map((asset) => [asset.pathname, asset]));
  const actualMap = new Map(actual.map((entry) => [entry.path, entry]));
  const missing = expectedAssets.filter((asset) => !actualMap.has(asset.pathname)).map((asset) => asset.pathname);
  const extra = actual.filter((entry) => !expected.has(entry.path)).map((entry) => entry.path);
  const mismatches = expectedAssets
    .filter((asset) => {
      const found = actualMap.get(asset.pathname);
      return found && (found.size !== asset.size || found.sha256 !== asset.sha256);
    })
    .map((asset) => ({
      path: asset.pathname,
      expected: { size: asset.size, sha256: asset.sha256 },
      actual: actualMap.get(asset.pathname),
    }));

  return {
    pass: missing.length === 0 && extra.length === 0 && mismatches.length === 0 && actual.length === expectedAssets.length,
    expectedCount: expectedAssets.length,
    actual,
    missing,
    extra,
    mismatches,
  };
}

function sha256Hex(bytes) {
  // 仅用于兼容模式的小 ZIP；OPFS/大文件校验在浏览器中使用增量 hash。
  const hash = createHash('sha256');
  hash.update(bytes);
  return hash.digest('hex');
}

function serializeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    stack: error?.stack,
  };
}

async function evaluate(page, expression, timeoutMs) {
  const response = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, { timeoutMs });
  if (response.exceptionDetails) {
    const description = response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text
      ?? 'Runtime.evaluate failed';
    throw new Error(description);
  }
  if (response.result?.subtype === 'error') {
    throw new Error(response.result.description ?? 'Runtime.evaluate returned an error.');
  }
  if (Object.hasOwn(response.result ?? {}, 'value')) return response.result.value;
  if (response.result?.unserializableValue !== undefined) return response.result.unserializableValue;
  return undefined;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function workerInstrumentationSource() {
  return `(() => {
    const state = { created: 0, terminated: 0, installed: false, error: null };
    globalThis.__unityQaWorker = state;
    try {
      const OriginalWorker = globalThis.Worker;
      if (typeof OriginalWorker !== 'function') return;
      const originalTerminate = OriginalWorker.prototype.terminate;
      if (typeof originalTerminate === 'function') {
        OriginalWorker.prototype.terminate = function () {
          state.terminated += 1;
          return originalTerminate.call(this);
        };
      }
      const InstrumentedWorker = new Proxy(OriginalWorker, {
        construct(target, args, newTarget) {
          state.created += 1;
          return Reflect.construct(target, args, newTarget);
        },
      });
      Object.defineProperty(globalThis, 'Worker', {
        configurable: true,
        writable: true,
        value: InstrumentedWorker,
      });
      state.installed = true;
    } catch (error) {
      state.error = String(error);
    }
  })();`;
}

function browserRuntimeMetricsStartSource() {
  return `(() => {
    const snapshot = () => {
      const memory = performance.memory;
      return memory && Number.isFinite(memory.usedJSHeapSize)
        ? {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          }
        : null;
    };
    const before = snapshot();
    const state = {
      startedAt: performance.now(),
      before,
      peakUsedJSHeapSize: before?.usedJSHeapSize ?? null,
      sampleCount: 0,
      memoryAvailable: before !== null,
    };
    state.timer = setInterval(() => {
      const current = snapshot();
      state.sampleCount += 1;
      if (current && (state.peakUsedJSHeapSize === null || current.usedJSHeapSize > state.peakUsedJSHeapSize)) {
        state.peakUsedJSHeapSize = current.usedJSHeapSize;
      }
    }, 100);
    globalThis.__unityQaRuntimeMetrics = state;
  })();`;
}

function browserRuntimeMetricsFinishSource() {
  return `(() => {
    const state = globalThis.__unityQaRuntimeMetrics;
    if (!state) return null;
    clearInterval(state.timer);
    const memory = performance.memory;
    const after = memory && Number.isFinite(memory.usedJSHeapSize)
      ? {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
        }
      : null;
    return {
      elapsedMs: Math.round(performance.now() - state.startedAt),
      before: state.before,
      after,
      peakUsedJSHeapSize: state.peakUsedJSHeapSize,
      sampleCount: state.sampleCount,
      memoryAvailable: state.memoryAvailable || after !== null,
    };
  })()`;
}

function mutationInstrumentationSource() {
  return `(() => {
    globalThis.__unityQaMutationObserver?.disconnect?.();
    const state = [];
    globalThis.__unityQaMutations = state;
    const install = () => {
      const panel = document.querySelector('.unitypackage-extractor-tool > .panel:nth-child(2)') ?? document.body;
      const observer = new MutationObserver(() => {
        if (state.length >= 200) return;
        state.push({
          at: Date.now(),
          text: (panel?.innerText ?? '').slice(0, 1200),
        });
      });
      observer.observe(panel ?? document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
      globalThis.__unityQaMutationObserver = observer;
      globalThis.__unityQaMutationObserverInstalled = true;
    };
    if (document.documentElement) install();
    else document.addEventListener('DOMContentLoaded', install, { once: true });
  })();`;
}

function capabilityMaskSource(names) {
  const serialized = JSON.stringify(names);
  return `(() => {
    const names = ${serialized};
    for (const name of names) {
      try {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: undefined });
      } catch {
        try { delete globalThis[name]; } catch {}
      }
    }
    globalThis.__unityQaMaskedCapabilities = names;
  })();`;
}

function pickerPermissionDeniedSource() {
  return `(() => {
    globalThis.showDirectoryPicker = async () => {
      throw new DOMException('QA simulated permission denial', 'NotAllowedError');
    };
    globalThis.__unityQaPickerPermissionDenied = true;
  })();`;
}

function opfsPickerSource() {
  return `(() => {
    globalThis.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const name = 'udon-qa-ui-' + crypto.randomUUID();
      globalThis.__unityQaPickerDirectoryName = name;
      return root.getDirectoryHandle(name, { create: true });
    };
    globalThis.__unityQaPickerIsOpfs = true;
  })();`;
}

function writerDelaySource(delayMs) {
  return `(() => {
    const state = { delayMs: ${delayMs}, wrapped: 0, error: null };
    globalThis.__unityQaWriterDelay = state;
    try {
      const prototype = globalThis.FileSystemFileHandle?.prototype;
      const originalCreateWritable = prototype?.createWritable;
      if (typeof originalCreateWritable !== 'function') return;
      prototype.createWritable = async function (...args) {
        const writer = await originalCreateWritable.apply(this, args);
        const originalWrite = writer.write.bind(writer);
        const originalClose = writer.close.bind(writer);
        const wait = () => new Promise((resolve) => setTimeout(resolve, state.delayMs));
        Object.defineProperty(writer, 'write', {
          configurable: true,
          value: async (chunk) => { await wait(); return originalWrite(chunk); },
        });
        Object.defineProperty(writer, 'close', {
          configurable: true,
          value: async () => { await wait(); return originalClose(); },
        });
        state.wrapped += 1;
        return writer;
      };
    } catch (error) {
      state.error = String(error);
    }
  })();`;
}

function buildOpfsExtractionExpression({ fileSelector, moduleUrl, parentName }) {
  return `(async () => {
    const output = { ok: false, parentName: ${JSON.stringify(parentName)}, progressCount: 0, progressSample: [], elapsedMs: null, memory: null };
    const startedAt = performance.now();
    const memorySnapshot = () => {
      const memory = performance.memory;
      return memory && Number.isFinite(memory.usedJSHeapSize)
        ? {
            usedJSHeapSize: memory.usedJSHeapSize,
            totalJSHeapSize: memory.totalJSHeapSize,
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
          }
        : null;
    };
    const memoryBefore = memorySnapshot();
    let peakUsedJSHeapSize = memoryBefore?.usedJSHeapSize ?? null;
    try {
      const module = await import(${JSON.stringify(moduleUrl)});
      const input = document.querySelector(${JSON.stringify(fileSelector)});
      const file = input?.files?.[0];
      if (!file) throw new Error('QA file input 没有可用 File。');
      const root = await navigator.storage.getDirectory();
      const parent = await root.getDirectoryHandle(${JSON.stringify(parentName)}, { create: true });
      let progressCount = 0;
      const progressSample = [];
      const result = await module.extractToDirectory(file, parent, {
        onProgress(progress) {
          progressCount += 1;
          if (progressSample.length < 80 || progressCount % 100 === 0) progressSample.push(progress);
          const memory = memorySnapshot();
          if (memory && (peakUsedJSHeapSize === null || memory.usedJSHeapSize > peakUsedJSHeapSize)) {
            peakUsedJSHeapSize = memory.usedJSHeapSize;
          }
        },
      });
      output.ok = true;
      output.streamingSupported = typeof module.isStreamingSupported === 'function' ? module.isStreamingSupported() : null;
      output.result = result;
      output.progressCount = progressCount;
      output.progressSample = progressSample;
      output.elapsedMs = Math.round(performance.now() - startedAt);
      output.memory = { before: memoryBefore, after: memorySnapshot(), peakUsedJSHeapSize };
      output.worker = globalThis.__unityQaWorker ?? null;
    } catch (error) {
      output.elapsedMs = Math.round(performance.now() - startedAt);
      output.memory = { before: memoryBefore, after: memorySnapshot(), peakUsedJSHeapSize };
      output.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error), stack: error?.stack };
      output.worker = globalThis.__unityQaWorker ?? null;
    }
    return output;
  })()`;
}

function buildOpfsVerificationExpression({ parentName, directoryName, expectedAssets }) {
  return `(async () => {
    ${browserSha256Source()}
    const expected = ${JSON.stringify(expectedAssets)};
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle(${JSON.stringify(parentName)});
    const output = await parent.getDirectoryHandle(${JSON.stringify(directoryName)});
    const files = [];
    let maxChunkBytes = 0;
    async function walk(directory, prefix) {
      for await (const [name, handle] of directory.entries()) {
        const relativePath = prefix ? prefix + '/' + name : name;
        if (handle.kind === 'directory') {
          await walk(handle, relativePath);
          continue;
        }
        const file = await handle.getFile();
        const hasher = new QaSha256();
        const reader = file.stream().getReader();
        let size = 0;
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
          maxChunkBytes = Math.max(maxChunkBytes, chunk.byteLength);
          size += chunk.byteLength;
          hasher.update(chunk);
        }
        files.push({ path: relativePath, size, sha256: hasher.digest() });
      }
    }
    await walk(output, '');
    const actual = new Map(files.map((entry) => [entry.path, entry]));
    const expectedMap = new Map(expected.map((entry) => [entry.pathname, entry]));
    const missing = expected.filter((entry) => !actual.has(entry.pathname)).map((entry) => entry.pathname);
    const extra = files.filter((entry) => !expectedMap.has(entry.path)).map((entry) => entry.path);
    const mismatches = expected.filter((entry) => {
      const found = actual.get(entry.pathname);
      return found && (found.size !== entry.size || found.sha256 !== entry.sha256);
    }).map((entry) => ({ path: entry.pathname, expected: entry, actual: actual.get(entry.pathname) }));
    return {
      pass: missing.length === 0 && extra.length === 0 && mismatches.length === 0 && files.length === expected.length,
      directoryName: ${JSON.stringify(directoryName)},
      expectedCount: expected.length,
      actual: files,
      missing,
      extra,
      mismatches,
      maxChunkBytes,
    };
  })()`;
}

function buildOpfsCleanupExpression(parentName) {
  return `(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(${JSON.stringify(parentName)}, { recursive: true });
    return true;
  })()`;
}

function buildOpfsChildDirectoryExpression(parentName) {
  return `(async () => {
    const root = await navigator.storage.getDirectory();
    const parent = await root.getDirectoryHandle(${JSON.stringify(parentName)});
    const directories = [];
    for await (const [name, handle] of parent.entries()) {
      if (handle.kind === 'directory') directories.push(name);
    }
    return directories;
  })()`;
}

function browserSha256Source() {
  return `class QaSha256 {
    constructor() {
      this.state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
      this.buffer = new Uint8Array(64);
      this.bufferLength = 0;
      this.length = 0n;
    }
    update(data) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      this.length += BigInt(bytes.byteLength);
      let offset = 0;
      if (this.bufferLength > 0) {
        const take = Math.min(64 - this.bufferLength, bytes.byteLength);
        this.buffer.set(bytes.subarray(0, take), this.bufferLength);
        this.bufferLength += take;
        offset += take;
        if (this.bufferLength === 64) {
          this.compress(this.buffer);
          this.bufferLength = 0;
        }
      }
      while (offset + 64 <= bytes.byteLength) {
        this.compress(bytes.subarray(offset, offset + 64));
        offset += 64;
      }
      if (offset < bytes.byteLength) {
        this.buffer.set(bytes.subarray(offset), 0);
        this.bufferLength = bytes.byteLength - offset;
      }
    }
    digest() {
      const bitLength = this.length * 8n;
      const tailLength = this.bufferLength + 1 + Number((56n - BigInt((this.bufferLength + 1) % 64) + 64n) % 64n) + 8;
      const tail = new Uint8Array(tailLength);
      tail.set(this.buffer.subarray(0, this.bufferLength), 0);
      tail[this.bufferLength] = 0x80;
      for (let index = 0; index < 8; index += 1) tail[tail.length - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
      let offset = 0;
      while (offset < tail.byteLength) {
        this.compress(tail.subarray(offset, offset + 64));
        offset += 64;
      }
      return Array.from(this.state).map((word) => word.toString(16).padStart(8, '0')).join('');
    }
    compress(block) {
      const words = new Uint32Array(64);
      for (let index = 0; index < 16; index += 1) {
        const offset = index * 4;
        words[index] = ((block[offset] << 24) | (block[offset + 1] << 16) | (block[offset + 2] << 8) | block[offset + 3]) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const value = words[index - 15];
        const small0 = rotr(value, 7) ^ rotr(value, 18) ^ (value >>> 3);
        const previous = words[index - 2];
        const small1 = rotr(previous, 17) ^ rotr(previous, 19) ^ (previous >>> 10);
        words[index] = (words[index - 16] + small0 + words[index - 7] + small1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = this.state;
      for (let index = 0; index < 64; index += 1) {
        const big1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const choice = (e & f) ^ (~e & g);
        const temp1 = (h + big1 + choice + QA_SHA256_K[index] + words[index]) >>> 0;
        const big0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (big0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      this.state[0] = (this.state[0] + a) >>> 0;
      this.state[1] = (this.state[1] + b) >>> 0;
      this.state[2] = (this.state[2] + c) >>> 0;
      this.state[3] = (this.state[3] + d) >>> 0;
      this.state[4] = (this.state[4] + e) >>> 0;
      this.state[5] = (this.state[5] + f) >>> 0;
      this.state[6] = (this.state[6] + g) >>> 0;
      this.state[7] = (this.state[7] + h) >>> 0;
    }
  }
  const QA_SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  function rotr(value, count) { return (value >>> count) | (value << (32 - count)); }`;
}

function printHelp() {
  console.log(`无依赖 Chrome CDP 验收 harness（Node 26 WebSocket）：

基础能力/截图：
  node scripts/unitypackage-extractor/browser-qa.mjs --mode capabilities --url http://127.0.0.1:4322/tools/unitypackage-extractor
  node scripts/unitypackage-extractor/browser-qa.mjs --mode matrix --start-server --server-port 4322
  node scripts/unitypackage-extractor/browser-qa.mjs --mode hash-smoke --url about:blank

OPFS 流式写盘与逐文件 hash：
  node scripts/unitypackage-extractor/browser-qa.mjs --mode opfs --url URL \\
    --fixture /private/tmp/unitypackage-streaming-qa/fixture-small.unitypackage \\
    --manifest /private/tmp/unitypackage-streaming-qa/fixture-small.json

UI 流式成功路径（仅 OPFS 模拟 picker，不是用户目录证据）：
  node scripts/unitypackage-extractor/browser-qa.mjs --mode opfs --start-server \\
    --fixture /private/tmp/unitypackage-streaming-qa/fixture-small.unitypackage \\
    --manifest /private/tmp/unitypackage-streaming-qa/fixture-small.json \\
    --opfs-directory --picker-selector '.unitypackage-extractor-tool button.primary'

兼容 ZIP 回退：
  node scripts/unitypackage-extractor/browser-qa.mjs --mode fallback --url URL \\
    --fixture /private/tmp/unitypackage-streaming-qa/fixture-small.unitypackage \\
    --manifest /private/tmp/unitypackage-streaming-qa/fixture-small.json

取消/Reset 竞态记录：
  node scripts/unitypackage-extractor/browser-qa.mjs --mode race --url URL \\
    --fixture PATH --manifest PATH --cancel-selector 'button[data-action="cancel"]' \\
    --reset-selector 'button[data-action="reset"]' --dispatch-file-change --opfs-directory

常用选项：
  --start-server              由 harness 启动并关闭独立 Astro dev 服务
  --output-dir PATH           保存 JSON、DOM、PNG、ZIP 下载和服务日志
  --viewport WIDTHxHEIGHT     单次截图尺寸，默认 1440x900
  --locales en,ja,zh-CN       matrix 模式的语言集合
  --mask NAME                 隔离页面中屏蔽能力，可重复
  --opfs-directory            仅为 UI 竞态测试提供 OPFS 模拟 picker；不是用户目录证据
  --writer-delay-ms N         仅为竞态测试给 OPFS writer.write/close 增加有界延迟
  --download-selector CSS     兼容 ZIP 下载链接选择器，默认 a[download]
  --module-url URL            browser.ts 模块 URL，默认 ${DEFAULT_MODULE_URL}
  --keep-profile              保留 harness 自己的 Chrome profile 供排查
  --keep-opfs                 不删除 harness 自己创建的 OPFS 子目录
  --timeout-ms N              单次 CDP/页面超时，默认 ${DEFAULT_TIMEOUT_MS}
`);
}
