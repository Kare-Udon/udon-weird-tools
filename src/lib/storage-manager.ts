import { parseToolFileStoragePath, parseToolIndexedDbName, parseToolLocalStorageKey } from './local/storage-contract.ts';

export const FALLBACK_GROUP = 'site-files';

export function inferStorageGroup(rawPath: string): string {
  return inferModelName(rawPath) ?? FALLBACK_GROUP;
}

export function inferModelName(rawPath: string): string | null {
  return parseToolFileStoragePath(rawPath)?.modelId ?? null;
}

export function inferStorageToolSlug(candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    const localStorageMatch = parseToolLocalStorageKey(candidate);
    if (localStorageMatch) return localStorageMatch.toolSlug;

    const indexedDbMatch = parseToolIndexedDbName(candidate);
    if (indexedDbMatch) return indexedDbMatch.toolSlug;

    const fileMatch = parseToolFileStoragePath(candidate);
    if (fileMatch) return fileMatch.toolSlug;
  }

  return null;
}

export function inferKnownToolKey(candidates: readonly string[], toolSlugs: readonly string[]): string | null {
  const toolSlug = inferStorageToolSlug(candidates);
  return toolSlug && toolSlugs.includes(toolSlug) ? toolSlug : null;
}

export function formatStorageBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function estimateSerializedSize(value: unknown): number {
  if (value instanceof Blob) return value.size;
  if (typeof value === 'string') return byteLength(value);

  try {
    return byteLength(JSON.stringify(value));
  } catch {
    return byteLength(String(value));
  }
}

export function previewStorageValue(value: unknown, maxLength = 160): string {
  const raw = typeof value === 'string' ? value : safeStringify(value);
  return raw.length > maxLength ? `${raw.slice(0, maxLength - 1)}…` : raw;
}

export function stableKeyText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return safeStringify(value);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
