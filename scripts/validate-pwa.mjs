import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const toolsDir = join(root, 'src', 'tools');
const locales = ['en', 'ja', 'zh-CN'];
const prefixedLocales = locales.filter((locale) => locale !== 'en');
const errors = [];

if (!existsSync(distDir)) {
  errors.push('Missing dist directory. Run astro build first.');
}

const toolSlugs = existsSync(toolsDir)
  ? readdirSync(toolsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .filter((slug) => existsSync(join(toolsDir, slug, 'manifest.ts')))
      .sort((left, right) => left.localeCompare(right))
  : [];

if (toolSlugs.length === 0) {
  errors.push('No tool manifests were found under src/tools.');
}

const manifests = [];

if (existsSync(distDir)) {
  for (const locale of locales) {
    const prefix = localePrefix(locale);
    const sitePath = `${prefix}manifest.webmanifest`;
    const siteStartUrl = locale === 'en' ? '/' : `/${locale}`;

    manifests.push({
      filePath: sitePath,
      expectedId: '/pwa/site',
      expectedStartUrl: siteStartUrl,
      label: `${locale} site manifest`,
    });

    for (const slug of toolSlugs) {
      manifests.push({
        filePath: `${prefix}tools/${slug}/manifest.webmanifest`,
        expectedId: `/pwa/tools/${slug}`,
        expectedStartUrl: `${siteStartUrl === '/' ? '' : siteStartUrl}/tools/${slug}`,
        label: `${locale} ${slug} tool manifest`,
      });
    }
  }

  for (const manifest of manifests) {
    validateManifest(manifest);
  }

  validateHtmlManifestLinks();
}

if (errors.length > 0) {
  console.error('PWA validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`PWA validation passed for ${manifests.length} manifests.`);

function validateManifest({ filePath, expectedId, expectedStartUrl, label }) {
  const absolutePath = join(distDir, filePath);

  if (!existsSync(absolutePath)) {
    errors.push(`Missing ${label}: dist/${filePath}`);
    return;
  }

  let manifest;

  try {
    manifest = JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${label}: ${error.message}`);
    return;
  }

  assertEqual(manifest.id, expectedId, `${label} must use stable app id "${expectedId}".`);
  assertString(manifest.name, `${label} must include name.`);
  assertString(manifest.short_name, `${label} must include short_name.`);
  assertString(manifest.description, `${label} must include description.`);
  assertEqual(
    manifest.start_url,
    expectedStartUrl,
    `${label} must start at "${expectedStartUrl}".`,
  );
  assertEqual(manifest.scope, '/', `${label} must use root scope.`);
  assertEqual(manifest.display, 'standalone', `${label} must use standalone display.`);
  assertString(manifest.theme_color, `${label} must include theme_color.`);
  assertString(manifest.background_color, `${label} must include background_color.`);
  assertString(manifest.lang, `${label} must include lang.`);

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    errors.push(`${label} must include at least one icon.`);
  } else {
    for (const icon of manifest.icons) {
      validateIcon(icon, label);
    }
  }
}

function validateIcon(icon, label) {
  assertString(icon.src, `${label} icon must include src.`);
  assertString(icon.sizes, `${label} icon must include sizes.`);
  assertString(icon.type, `${label} icon must include type.`);

  if (typeof icon.src !== 'string' || !icon.src.startsWith('/')) return;

  const iconPath = join(distDir, icon.src.slice(1));

  if (!existsSync(iconPath)) {
    errors.push(`${label} references missing icon: ${icon.src}`);
  }
}

function validateHtmlManifestLinks() {
  for (const file of walk(distDir)) {
    if (extname(file) !== '.html') continue;

    const relativePath = relative(distDir, file).split(sep).join('/');
    const route = toRouteUrl(relativePath);
    const html = readFileSync(file, 'utf8');
    const expectedHref = expectedManifestHrefForRoute(route);
    const expectedLink = `rel="manifest" href="${expectedHref}"`;

    if (!html.includes(expectedLink)) {
      errors.push(`dist/${relativePath} must link to ${expectedHref}.`);
    }
  }
}

function expectedManifestHrefForRoute(route) {
  const parts = route.split('/').filter(Boolean);
  const first = parts[0];
  const locale = prefixedLocales.includes(first) ? first : 'en';
  const offset = locale === 'en' ? 0 : 1;
  const prefix = locale === 'en' ? '' : `/${locale}`;

  if (parts[offset] === 'tools' && parts[offset + 1] && parts.length === offset + 2) {
    return `${prefix}/tools/${parts[offset + 1]}/manifest.webmanifest`;
  }

  return `${prefix}/manifest.webmanifest`;
}

function toRouteUrl(relativePath) {
  if (relativePath === 'index.html') return '/';
  if (relativePath.endsWith('/index.html')) {
    return `/${relativePath.slice(0, -'/index.html'.length)}`;
  }

  return `/${relativePath.slice(0, -'.html'.length)}`;
}

function localePrefix(locale) {
  return locale === 'en' ? '' : `${locale}/`;
}

function assertString(value, message) {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    errors.push(`${message} Got ${JSON.stringify(actual)}.`);
  }
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
