import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const serviceWorkerPath = join(distDir, 'service-worker.js');
const cacheableAssetExtensions = new Set([
  '.css',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.png',
  '.svg',
  '.webmanifest',
  '.webp',
  '.woff',
  '.woff2',
]);

if (!existsSync(distDir)) {
  console.error('Missing dist directory. Run astro build before generating the service worker.');
  process.exit(1);
}

if (!existsSync(serviceWorkerPath)) {
  console.error('Missing dist/service-worker.js. Ensure public/service-worker.js exists before build.');
  process.exit(1);
}

const files = [...walk(distDir)];
const urls = new Map();
const hash = createHash('sha256');

for (const file of files) {
  const relativePath = relative(distDir, file).split(sep).join('/');

  if (relativePath === '_headers') continue;

  const routeUrl = toRouteUrl(relativePath);
  const assetUrl = toAssetUrl(relativePath);
  const url = routeUrl ?? assetUrl;

  if (!url) continue;

  urls.set(url, file);
}

urls.set('/service-worker.js', serviceWorkerPath);

for (const [url, file] of [...urls.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  hash.update(url);
  hash.update('\0');
  hash.update(readFileSync(file));
  hash.update('\0');
}

const cacheVersion = hash.digest('hex').slice(0, 12);
const precacheUrls = [...urls.keys()].sort((left, right) => left.localeCompare(right));
const precacheSource = precacheUrls.map((url) => `  '${url}',`).join('\n');
const original = readFileSync(serviceWorkerPath, 'utf8');
const generated = original
  .replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${cacheVersion}';`)
  .replace(/const PRECACHE_URLS = \[[\s\S]*?\];/, `const PRECACHE_URLS = [\n${precacheSource}\n];`);

writeFileSync(serviceWorkerPath, generated);
console.log(`Generated service worker with ${precacheUrls.length} precache entries.`);

function toRouteUrl(relativePath) {
  if (!relativePath.endsWith('.html')) return undefined;

  if (relativePath === 'index.html') return '/';
  if (relativePath.endsWith('/index.html')) {
    return `/${relativePath.slice(0, -'/index.html'.length)}`;
  }

  return `/${relativePath.slice(0, -'.html'.length)}`;
}

function toAssetUrl(relativePath) {
  if (relativePath === 'service-worker.js') return undefined;
  if (cacheableAssetExtensions.has(extname(relativePath))) {
    return `/${relativePath}`;
  }

  return undefined;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}
