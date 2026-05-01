import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const toolsDir = join(root, 'src', 'tools');
const forbiddenProjectPaths = ['functions'];
const requiredToolFiles = ['manifest.ts', 'schema.ts', 'run.ts', 'examples.ts', 'index.ts'];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const forbiddenPatterns = [
  { pattern: /\beval\s*\(/, label: 'eval(' },
  { pattern: /\bnew\s+Function\b/, label: 'new Function' },
  { pattern: /\bdocument\.write\b/, label: 'document.write' },
  { pattern: /\.innerHTML\s*=/, label: 'innerHTML assignment' },
  { pattern: /\bfetch\s*\(/, label: 'fetch(' },
  { pattern: /\bXMLHttpRequest\b/, label: 'XMLHttpRequest' },
  { pattern: /\blocalStorage\b/, label: 'localStorage inside tool module' },
  { pattern: /\bsessionStorage\b/, label: 'sessionStorage inside tool module' },
  { pattern: /\bindexedDB\b/, label: 'indexedDB inside tool module' },
];

const errors = [];

for (const projectPath of forbiddenProjectPaths) {
  const absolute = join(root, projectPath);
  if (existsSync(absolute)) {
    errors.push(`Forbidden project path exists: ${projectPath}`);
  }
}

if (!existsSync(toolsDir)) {
  errors.push('Missing src/tools directory.');
} else {
  const toolDirs = readdirSync(toolsDir)
    .filter((name) => !name.startsWith('_') && !name.endsWith('.ts'))
    .map((name) => join(toolsDir, name))
    .filter((path) => statSync(path).isDirectory());

  if (toolDirs.length === 0) {
    errors.push('No tools found under src/tools.');
  }

  const seenSlugs = new Set();

  for (const dir of toolDirs) {
    const slug = dir.split('/').at(-1);
    const displayDir = relative(root, dir);

    if (!slugPattern.test(slug)) {
      errors.push(`${displayDir}: directory name must be a kebab-case slug.`);
    }

    for (const file of requiredToolFiles) {
      const filePath = join(dir, file);
      if (!existsSync(filePath)) {
        errors.push(`${displayDir}: missing ${file}.`);
      }
    }

    const manifestPath = join(dir, 'manifest.ts');
    if (existsSync(manifestPath)) {
      const manifest = readFileSync(manifestPath, 'utf8');
      const slugMatch = manifest.match(/slug:\s*['"]([^'"]+)['"]/);
      const manifestSlug = slugMatch?.[1];

      if (!manifestSlug) {
        errors.push(`${displayDir}/manifest.ts: missing slug field.`);
      } else {
        if (manifestSlug !== slug) {
          errors.push(`${displayDir}/manifest.ts: slug "${manifestSlug}" does not match directory "${slug}".`);
        }
        if (seenSlugs.has(manifestSlug)) {
          errors.push(`${displayDir}/manifest.ts: duplicate slug "${manifestSlug}".`);
        }
        seenSlugs.add(manifestSlug);
      }

      if (!/runtime:\s*['"]client['"]/.test(manifest)) {
        errors.push(`${displayDir}/manifest.ts: runtime must be "client".`);
      }

      if (!/pure:\s*true/.test(manifest)) {
        errors.push(`${displayDir}/manifest.ts: execution.pure must be true.`);
      }

      if (!/['"]zh-CN['"]\s*:/.test(manifest) || !/\ben\s*:/.test(manifest)) {
        errors.push(`${displayDir}/manifest.ts: localized text must include zh-CN and en.`);
      }
    }

    for (const file of walk(dir)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const content = readFileSync(file, 'utf8');
      const displayFile = relative(root, file);

      for (const { pattern, label } of forbiddenPatterns) {
        if (pattern.test(content)) {
          errors.push(`${displayFile}: forbidden pattern: ${label}.`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Tool validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Tool validation passed.');

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
