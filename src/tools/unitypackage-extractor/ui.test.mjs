import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EXTRACTION_ERROR_CODES, EXTRACTION_WARNING_CODES } from '../../lib/unitypackage-extractor/errors.ts';
import { manifest } from './manifest.ts';
import { inputFields } from './schema.ts';
import {
  getUnityPackageExtractorErrorText,
  getUnityPackageExtractorWarningText,
  unityPackageExtractorUi,
} from './ui.ts';

const locales = ['en', 'ja', 'zh-CN'];
const component = readFileSync(new URL('../../components/UnityPackageExtractorTool.tsx', import.meta.url), 'utf8');
const playground = readFileSync(new URL('../../components/ToolPlayground.tsx', import.meta.url), 'utf8');

function sourceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label} source range is missing: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label} source range has no end marker: ${endMarker}`);
  return source.slice(start, end);
}

test('manifest, schema, and dedicated UI copy cover every supported locale', () => {
  for (const locale of locales) {
    assert.equal(typeof manifest.i18n.name[locale], 'string');
    assert.equal(typeof manifest.i18n.description[locale], 'string');
  }

  for (const field of inputFields) {
    for (const locale of locales) assert.equal(typeof field.label[locale], 'string');
    for (const locale of locales) assert.equal(typeof field.helperText?.[locale], 'string');
  }

  for (const [key, copy] of Object.entries(unityPackageExtractorUi)) {
    for (const locale of locales) {
      assert.equal(typeof copy[locale], 'string', `${key} is missing ${locale}`);
      assert.notEqual(copy[locale].trim(), '', `${key} is empty in ${locale}`);
    }
  }
});

test('fallback keeps the original ZIP path and its 80/160 MiB limits', () => {
  assert.equal(inputFields[0].maxSizeBytes, 80 * 1024 * 1024);
  assert.match(inputFields[0].helperText.en, /80 MiB/);
  assert.match(inputFields[0].helperText.en, /160 MiB/);
  assert.match(component, /return <DefaultToolPlayground slug="unitypackage-extractor" locale=\{locale\} \/>/);
  assert.match(playground, /lazy\(\(\) => import\('\.\/UnityPackageExtractorTool'\)\)/);
  assert.match(playground, /slug === 'unitypackage-extractor'/);
  assert.match(playground, /export function DefaultToolPlayground/);
});

test('streaming UI detects capabilities, requires directory confirmation, and auto-starts on file selection', () => {
  assert.match(component, /isStreamingSupported\(\)/);
  assert.match(component, /chooseOutputDirectory\(\)/);
  assert.match(component, /extractToDirectory\(file, selectedDirectory, \{/);
  assert.match(component, /onProgress: \(nextProgress\)/);
  assert.match(component, /signal: controller\.signal/);
  assert.match(component, /disabled=\{!directory \|\| choosingDirectory\}/);
  assert.match(component, /onChange=\{handleFileChange\}/);
  assert.doesNotMatch(component, /toolRun|handleRun/);

  const chooser = sourceBetween(component, 'async function handleChooseDirectory', 'function handleFileChange', 'directory chooser');
  assert.match(chooser, /getUnityPackageExtractorErrorText\(locale, directoryError\)/);
  assert.doesNotMatch(chooser, /setStreamingSupported\(false\)/);
});

test('streaming progress and results expose phase, byte/file stats, bounded preview, and warnings', () => {
  assert.match(component, /phase: 'scanning'/);
  assert.match(component, /phase: 'extracting'/);
  assert.match(component, /bytesRead/);
  assert.match(component, /totalBytes/);
  assert.match(component, /filesWritten/);
  assert.match(component, /outputSubdirectory/);
  assert.match(component, /getUnityPackageExtractorWarningText\(locale, warning\)/);
  assert.match(component, /candidate\.slice\(0, 12\)/);
  assert.match(component, /overflowWrap: 'anywhere'/);
});

test('cancel, replacement, reset, and unmount isolate old work from current UI state', () => {
  assert.match(component, /const controllerRef = useRef<AbortController \| null>\(null\)/);
  assert.match(component, /const runIdRef = useRef\(0\)/);
  assert.match(component, /controllerRef\.current\?\.abort\(\)/);
  assert.match(component, /if \(runIdRef\.current !== runId\) return;/);
  assert.match(component, /invalidateActiveRun\(runIdRef, controllerRef\)/);
  assert.match(component, /function handleCancel\(\)/);
  assert.match(component, /function handleReset\(\)/);
  assert.match(component, /pickerIdRef\.current \+= 1;[\s\S]*invalidateActiveRun\(runIdRef, controllerRef\);/);
  assert.match(component, /cancelRequestedRunIdRef\.current = runIdRef\.current;[\s\S]*activeController\.abort\(\);/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.userAgent/);
});

test('stable engine errors and warnings are localized while unknown errors keep bounded detail', () => {
  for (const code of EXTRACTION_ERROR_CODES) {
    for (const locale of locales) {
      const text = getUnityPackageExtractorErrorText(locale, { code });
      assert.notEqual(text, code, `${code} leaked as a raw error code in ${locale}`);
      assert.notEqual(text.trim(), '', `${code} has no localized error text in ${locale}`);
    }
  }

  for (const code of EXTRACTION_WARNING_CODES) {
    for (const locale of locales) {
      const text = getUnityPackageExtractorWarningText(locale, code);
      assert.notEqual(text, code, `${code} leaked as a raw warning code in ${locale}`);
      assert.notEqual(text.trim(), '', `${code} has no localized warning text in ${locale}`);
    }
  }

  for (const locale of locales) {
    const permission = getUnityPackageExtractorErrorText(locale, { code: 'directory-permission-denied' });
    assert.notEqual(permission, 'directory-permission-denied');
    assert.notEqual(permission.trim(), '');

    const warning = getUnityPackageExtractorWarningText(locale, 'unsafe-path: Assets/../outside');
    assert.match(warning, /Assets\/\.\.\/outside/);
  }

  const detail = getUnityPackageExtractorErrorText('en', {
    detail: `${'unexpected detail '.repeat(40)}tail`,
  });
  assert.ok(detail.length <= 240);
  assert.match(detail, /^unexpected detail/);
});
