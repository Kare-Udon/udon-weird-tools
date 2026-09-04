const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i;

export function sanitizeFileStem(input: string, fallback = 'image'): string {
  const raw = typeof input === 'string' ? input.normalize('NFKC') : '';
  const baseName = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .at(-1) ?? '';
  const withoutExtension = baseName.replace(/\.[^.]*$/, '');
  const sanitized = sanitizeNamePart(withoutExtension);
  const safeFallback = sanitizeNamePart(fallback) || 'image';

  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : safeFallback;
}

export function sanitizeEntryName(input: string, fallback = 'slice.png'): string {
  const raw = typeof input === 'string' ? input.normalize('NFKC') : '';
  const baseName = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .at(-1) ?? '';
  const sanitized = sanitizeNamePart(baseName);
  const safeFallback = sanitizeNamePart(fallback) || 'slice.png';
  const result = sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : safeFallback;

  return WINDOWS_RESERVED_NAME.test(result) ? `_${result}` : result;
}

export function appendNumericSuffix(fileName: string, suffix: number): string {
  const safeSuffix = Number.isInteger(suffix) && suffix > 1 ? suffix : 2;
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName}-${safeSuffix}`;
  return `${fileName.slice(0, dot)}-${safeSuffix}${fileName.slice(dot)}`;
}

export function createSliceFileName(sourceName: string, index: number, count: number): string {
  const width = Math.max(2, String(Math.max(1, count)).length);
  return `${sanitizeFileStem(sourceName)}-${String(index + 1).padStart(width, '0')}.png`;
}

export function createZipFileName(sourceName: string): string {
  return `${sanitizeFileStem(sourceName)}-split.zip`;
}

function sanitizeNamePart(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();
}
