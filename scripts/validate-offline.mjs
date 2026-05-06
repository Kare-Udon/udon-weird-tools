import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];

const layoutPath = join(root, 'src', 'layouts', 'BaseLayout.astro');
const serviceWorkerPath = join(root, 'public', 'service-worker.js');
const generatedServiceWorkerPath = join(root, 'dist', 'service-worker.js');

assertFile(layoutPath);
assertFile(serviceWorkerPath);

if (errors.length === 0) {
  const layout = readFileSync(layoutPath, 'utf8');
  const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');
  const generatedServiceWorker = existsSync(generatedServiceWorkerPath)
    ? readFileSync(generatedServiceWorkerPath, 'utf8')
    : '';

  assertMatches(
    layout,
    /navigator\.serviceWorker\s*\.\s*register/,
    'BaseLayout must register the service worker.',
  );
  assertNotIncludes(layout, 'registration.unregister', 'BaseLayout must not unregister service workers.');
  assertNotIncludes(layout, 'window.caches.delete', 'BaseLayout must not delete offline caches.');

  assertIncludes(serviceWorker, 'CACHE_PREFIX', 'Service worker must define a cache prefix.');
  assertIncludes(serviceWorker, 'PRECACHE_URLS', 'Service worker must define a precache list.');
  assertIncludes(serviceWorker, "request.mode === 'navigate'", 'Service worker must handle navigation requests.');
  assertIncludes(serviceWorker, 'caches.open', 'Service worker must use Cache Storage.');
  assertNotIncludes(serviceWorker, 'registration.unregister', 'Service worker must not unregister itself.');

  if (existsSync(generatedServiceWorkerPath)) {
    assertIncludes(
      generatedServiceWorker,
      "const CACHE_VERSION = '",
      'Generated service worker must include a concrete cache version.',
    );
    assertNotIncludes(
      generatedServiceWorker,
      "const CACHE_VERSION = 'dev'",
      'Generated service worker must replace the development cache version.',
    );
    assertIncludes(generatedServiceWorker, "'/'", 'Generated service worker must precache the English home route.');
    assertIncludes(generatedServiceWorker, "'/tools'", 'Generated service worker must precache the English tools route.');
    assertIncludes(
      generatedServiceWorker,
      "'/zh-CN/tools'",
      'Generated service worker must precache localized tool routes.',
    );
    assertIncludes(
      generatedServiceWorker,
      "'/service-worker.js'",
      'Generated service worker must include its own URL for update checks.',
    );
  }
}

if (errors.length > 0) {
  console.error('Offline validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Offline validation passed.');

function assertFile(path) {
  if (!existsSync(path)) {
    errors.push(`Missing file: ${path}`);
  }
}

function assertIncludes(content, needle, message) {
  if (!content.includes(needle)) {
    errors.push(message);
  }
}

function assertMatches(content, pattern, message) {
  if (!pattern.test(content)) {
    errors.push(message);
  }
}

function assertNotIncludes(content, needle, message) {
  if (content.includes(needle)) {
    errors.push(message);
  }
}
