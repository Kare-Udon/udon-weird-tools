const STORAGE_PREFIX = 'weird-tools:tool:';
const FILE_STORAGE_PREFIX = '__tool-storage';
const OPFS_STORAGE_PREFIX = 'tools';

export type ToolStorageKind = 'data' | 'settings';

export type ParsedToolDataStorage = {
  toolSlug: string;
  kind: ToolStorageKind;
  entryId: string;
};

export type ParsedToolModelStorage = {
  toolSlug: string;
  modelId: string;
  relativePath: string;
  modelRootPath: string;
};

export function toolLocalStorageKey(toolSlug: string, kind: ToolStorageKind, entryId: string): string {
  return `${STORAGE_PREFIX}${assertStorageSegment(toolSlug)}:${kind}:${assertStorageSegment(entryId)}`;
}

export function toolIndexedDbName(toolSlug: string): string {
  return `${STORAGE_PREFIX}${assertStorageSegment(toolSlug)}`;
}

export function toolCacheName(toolSlug: string): string {
  return `${STORAGE_PREFIX}${assertStorageSegment(toolSlug)}:files`;
}

export function toolModelCachePath(toolSlug: string, modelId: string, relativePath: string): string {
  return `/${FILE_STORAGE_PREFIX}/${assertStorageSegment(toolSlug)}/models/${encodeURIComponent(assertStorageSegment(modelId))}/${encodeRelativePath(relativePath)}`;
}

export function toolOpfsModelPath(toolSlug: string, modelId: string, relativePath: string): string {
  return `${OPFS_STORAGE_PREFIX}/${assertStorageSegment(toolSlug)}/models/${encodeURIComponent(assertStorageSegment(modelId))}/${encodeRelativePath(relativePath)}`;
}

export function parseToolLocalStorageKey(key: string): ParsedToolDataStorage | null {
  if (!key.startsWith(STORAGE_PREFIX)) return null;

  const segments = key.slice(STORAGE_PREFIX.length).split(':');
  const [toolSlug, kind, entryId] = segments;
  if (!toolSlug || !isToolStorageKind(kind) || !entryId || segments.length !== 3) return null;

  return { toolSlug, kind, entryId };
}

export function parseToolIndexedDbName(name: string): { toolSlug: string } | null {
  if (!name.startsWith(STORAGE_PREFIX)) return null;

  const toolSlug = name.slice(STORAGE_PREFIX.length);
  return toolSlug && !toolSlug.includes(':') ? { toolSlug } : null;
}

export function parseToolFileStoragePath(rawPath: string): ParsedToolModelStorage | null {
  const pathname = parsePathname(rawPath);
  const segments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const cacheMatch = parseModelSegments(segments, FILE_STORAGE_PREFIX);
  if (cacheMatch) return cacheMatch;

  return parseModelSegments(segments, OPFS_STORAGE_PREFIX);
}

function parseModelSegments(segments: string[], prefix: string): ParsedToolModelStorage | null {
  const [storagePrefix, toolSlug, modelsSegment, modelId, ...relativeSegments] = segments;
  if (storagePrefix !== prefix || !toolSlug || modelsSegment !== 'models' || !modelId) return null;

  const decodedModelId = decodeURIComponent(modelId);
  const relativePath = relativeSegments.map((segment) => decodeURIComponent(segment)).join('/');
  const modelRootPath = `${prefix}/${toolSlug}/models/${modelId}`;

  return {
    toolSlug,
    modelId: decodedModelId,
    relativePath,
    modelRootPath,
  };
}

function parsePathname(rawPath: string): string {
  try {
    return new URL(rawPath, 'https://local.invalid').pathname;
  } catch {
    return `/${rawPath.replace(/^\/+/, '')}`;
  }
}

function encodeRelativePath(relativePath: string): string {
  return relativePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function assertStorageSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes(':')) {
    throw new Error(`Invalid storage segment: ${value}`);
  }
  return trimmed;
}

function isToolStorageKind(value: string | undefined): value is ToolStorageKind {
  return value === 'data' || value === 'settings';
}
