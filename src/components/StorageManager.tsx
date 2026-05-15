import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/i18n/config';
import { localize } from '@/i18n/utils';
import {
  FALLBACK_GROUP,
  estimateSerializedSize,
  formatStorageBytes,
  inferModelName,
  inferStorageGroup,
  inferStorageToolSlug,
  isInternalRuntimeDatabaseEntry,
  previewStorageValue,
  stableKeyText,
} from '@/lib/storage-manager';
import { parseToolFileStoragePath, parseToolLocalStorageKey } from '@/lib/local/storage-contract';
import { storageText } from '@/lib/storage-manager-copy';
import { tools } from '@/tools/registry';

type StorageManagerProps = {
  locale: Locale;
};

type DatabaseEntry = {
  id: string;
  source: 'localStorage' | 'indexedDB';
  databaseName: string;
  storeName: string;
  keyText: string;
  key: IDBValidKey | string;
  size: number;
  preview: string;
  toolKey: string;
};

type FileGroup = {
  id: string;
  source: 'cache' | 'opfs';
  group: string;
  label: string;
  modelName: string;
  toolKey: string;
  size: number;
  count: number;
  samplePaths: string[];
  cacheName?: string;
  urls?: string[];
  opfsNames?: string[];
};

type ToolStorageGroup = {
  id: string;
  label: string;
  databaseEntries: DatabaseEntry[];
  fileGroups: FileGroup[];
  totalSize: number;
};

type StorageSnapshot = {
  usage: number | null;
  quota: number | null;
  databaseEntries: DatabaseEntry[];
  fileGroups: FileGroup[];
  databaseSupported: boolean;
  fileStorageSupported: boolean;
};

type OpfsFileHandle = {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
};

type OpfsDirectoryHandle = {
  kind: 'directory';
  name: string;
  values: () => AsyncIterable<OpfsHandle>;
  getDirectoryHandle: (name: string) => Promise<OpfsDirectoryHandle>;
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

type OpfsHandle = OpfsFileHandle | OpfsDirectoryHandle;

export default function StorageManager({ locale }: StorageManagerProps) {
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setSnapshot(await scanStorage());
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDeleteEntry(entry: DatabaseEntry) {
    if (confirmingId !== entry.id) {
      setConfirmingId(entry.id);
      return;
    }

    setPendingId(entry.id);
    try {
      if (entry.source === 'localStorage') {
        window.localStorage.removeItem(String(entry.key));
      } else {
        await deleteIndexedDbEntry(entry);
      }
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setPendingId(null);
      setConfirmingId(null);
    }
  }

  async function handleDeleteFileGroup(group: FileGroup) {
    if (confirmingId !== group.id) {
      setConfirmingId(group.id);
      return;
    }

    setPendingId(group.id);
    try {
      await deleteFileGroup(group);
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setPendingId(null);
      setConfirmingId(null);
    }
  }

  function toggleStorageGroup(groupId: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  const databaseBytes = snapshot?.databaseEntries.reduce((total, entry) => total + entry.size, 0) ?? 0;
  const fileBytes = snapshot?.fileGroups.reduce((total, group) => total + group.size, 0) ?? 0;
  const databaseGroups = useMemo(() => buildDatabaseStorageGroups(snapshot, locale), [locale, snapshot]);
  const fileStorageGroups = useMemo(() => buildFileStorageGroups(snapshot, locale), [locale, snapshot]);
  const visibleStorageCount = databaseGroups.length + fileStorageGroups.length;

  return (
    <div className="storage-manager">
      <section className="panel storage-summary-panel">
        <div className="section-heading output-heading">
          <div>
            <h2>{storageText(locale, 'used')}</h2>
          </div>
          <button type="button" onClick={refresh} disabled={loading || Boolean(pendingId)}>
            {loading ? storageText(locale, 'scanning') : storageText(locale, 'refresh')}
          </button>
        </div>

        {error && (
          <div className="error-panel" role="alert">
            <strong>{storageText(locale, 'storageError')}</strong>
            <p>{error}</p>
          </div>
        )}

        <div className="storage-stat-grid">
          <StorageStat label={storageText(locale, 'used')} value={!snapshot || snapshot.usage === null ? storageText(locale, 'unknownQuota') : formatStorageBytes(snapshot.usage)} />
          <StorageStat label={storageText(locale, 'quota')} value={!snapshot || snapshot.quota === null ? storageText(locale, 'unknownQuota') : formatStorageBytes(snapshot.quota)} />
          <StorageStat label={storageText(locale, 'databases')} value={formatStorageBytes(databaseBytes)} />
          <StorageStat label={storageText(locale, 'fileStorage')} value={formatStorageBytes(fileBytes)} />
        </div>
      </section>

      <section className="panel storage-tool-panel">
        {!snapshot && <div className="empty-result storage-empty">{storageText(locale, 'scanning')}</div>}

        {snapshot && !snapshot.databaseSupported && !snapshot.fileStorageSupported && <div className="empty-result storage-empty">{storageText(locale, 'unsupported')}</div>}

        {snapshot && visibleStorageCount === 0 && <div className="empty-result storage-empty">{loading ? storageText(locale, 'scanning') : storageText(locale, 'noToolStorage')}</div>}

        {visibleStorageCount > 0 && (
          <div className="storage-manager-grid">
            <section className="storage-column">
              <div className="storage-column-heading">
                <h3>{storageText(locale, 'databaseEntries')}</h3>
                <span>{formatStorageBytes(databaseBytes)}</span>
              </div>

              {databaseGroups.length === 0 ? (
                <div className="empty-result storage-empty">{storageText(locale, 'noDatabaseEntries')}</div>
              ) : (
                <div className="storage-tool-list">
                  {databaseGroups.map((group) => (
                    <StorageDatabaseGroup
                      group={group}
                      locale={locale}
                      pendingId={pendingId}
                      confirmingId={confirmingId}
                      isExpanded={expandedGroups.has(`database:${group.id}`)}
                      onToggle={() => toggleStorageGroup(`database:${group.id}`)}
                      onDelete={(entry) => void handleDeleteEntry(entry)}
                      key={group.id}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="storage-column">
              <div className="storage-column-heading">
                <h3>{storageText(locale, 'fileGroups')}</h3>
                <span>{formatStorageBytes(fileBytes)}</span>
              </div>

              {fileStorageGroups.length === 0 ? (
                <div className="empty-result storage-empty">{storageText(locale, 'noFileGroups')}</div>
              ) : (
                <div className="storage-tool-list">
                  {fileStorageGroups.map((group) => (
                    <StorageFileGroup
                      group={group}
                      locale={locale}
                      pendingId={pendingId}
                      confirmingId={confirmingId}
                      isExpanded={expandedGroups.has(`files:${group.id}`)}
                      onToggle={() => toggleStorageGroup(`files:${group.id}`)}
                      onDelete={(fileGroup) => void handleDeleteFileGroup(fileGroup)}
                      key={group.id}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>

    </div>
  );
}

function StorageDatabaseGroup({
  group,
  locale,
  pendingId,
  confirmingId,
  isExpanded,
  onToggle,
  onDelete,
}: {
  group: ToolStorageGroup;
  locale: Locale;
  pendingId: string | null;
  confirmingId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (entry: DatabaseEntry) => void;
}) {
  return (
    <section className={`storage-tool-section${isExpanded ? ' is-open' : ''}`}>
      <button type="button" className="storage-tool-heading" aria-expanded={isExpanded} onClick={onToggle}>
        <span className="storage-disclosure" aria-hidden="true">
          ▸
        </span>
        <div>
          <h3>{group.label}</h3>
          <p>
            {group.databaseEntries.length} {storageText(locale, 'entries')}
          </p>
        </div>
        <strong>{formatStorageBytes(group.totalSize)}</strong>
      </button>

      {isExpanded && (
        <div className="storage-entry-list">
          <div className="storage-entry storage-entry--compact storage-entry--header">
            <span>{storageText(locale, 'item')}</span>
            <span>{storageText(locale, 'size')}</span>
            <span>{storageText(locale, 'action')}</span>
          </div>
          {group.databaseEntries.map((entry) => (
            <article className="storage-entry storage-entry--compact" key={entry.id}>
              <div className="storage-entry-main">
                <div className="storage-entry-heading">
                  <h3>{getDatabaseEntryLabel(entry, locale)}</h3>
                </div>
                <span className="storage-entry-meta">{getDatabaseEntrySource(entry, locale)}</span>
                <details className="storage-preview">
                  <summary>{storageText(locale, 'valuePreview')}</summary>
                  <pre>{entry.preview}</pre>
                </details>
              </div>
              <span className="storage-entry-size">{formatStorageBytes(entry.size)}</span>
              <button type="button" onClick={() => onDelete(entry)} disabled={pendingId === entry.id}>
                {confirmingId === entry.id ? storageText(locale, 'confirm') : storageText(locale, 'delete')}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StorageFileGroup({
  group,
  locale,
  pendingId,
  confirmingId,
  isExpanded,
  onToggle,
  onDelete,
}: {
  group: ToolStorageGroup;
  locale: Locale;
  pendingId: string | null;
  confirmingId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (fileGroup: FileGroup) => void;
}) {
  return (
    <section className={`storage-tool-section${isExpanded ? ' is-open' : ''}`}>
      <button type="button" className="storage-tool-heading" aria-expanded={isExpanded} onClick={onToggle}>
        <span className="storage-disclosure" aria-hidden="true">
          ▸
        </span>
        <div>
          <h3>{group.label}</h3>
          <p>
            {group.fileGroups.length} {storageText(locale, 'model')}
          </p>
        </div>
        <strong>{formatStorageBytes(group.totalSize)}</strong>
      </button>

      {isExpanded && (
        <div className="storage-entry-list">
          <div className="storage-entry storage-entry--compact storage-entry--header">
            <span>{storageText(locale, 'model')}</span>
            <span>{storageText(locale, 'size')}</span>
            <span>{storageText(locale, 'action')}</span>
          </div>
          {group.fileGroups.map((fileGroup) => (
            <article className="storage-entry storage-entry--compact" key={fileGroup.id}>
              <div className="storage-entry-main">
                <div className="storage-entry-heading">
                  <h3>{getFileGroupLabel(fileGroup, locale)}</h3>
                </div>
                <span className="storage-entry-meta">
                  {getFileGroupSource(fileGroup, locale)} · {fileGroup.count} {storageText(locale, 'files')}
                </span>
                {fileGroup.samplePaths.length > 0 && (
                  <details className="storage-samples">
                    <summary>{storageText(locale, 'samplePaths')}</summary>
                    <ul>
                      {fileGroup.samplePaths.map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <span className="storage-entry-size">{fileGroup.size > 0 ? formatStorageBytes(fileGroup.size) : storageText(locale, 'unavailableSize')}</span>
              <button type="button" onClick={() => onDelete(fileGroup)} disabled={pendingId === fileGroup.id}>
                {confirmingId === fileGroup.id ? storageText(locale, 'confirm') : storageText(locale, 'deleteGroup')}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StorageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="storage-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildDatabaseStorageGroups(snapshot: StorageSnapshot | null, locale: Locale): ToolStorageGroup[] {
  if (!snapshot) return [];

  const groups = new Map<string, ToolStorageGroup>();

  for (const entry of snapshot.databaseEntries) {
    const group = ensureToolStorageGroup(groups, entry.toolKey, locale);
    group.databaseEntries.push(entry);
    group.totalSize += entry.size;
  }

  return [...groups.values()].sort((left, right) => right.totalSize - left.totalSize || left.label.localeCompare(right.label));
}

function buildFileStorageGroups(snapshot: StorageSnapshot | null, locale: Locale): ToolStorageGroup[] {
  if (!snapshot) return [];

  const groups = new Map<string, ToolStorageGroup>();

  for (const fileGroup of snapshot.fileGroups) {
    const group = ensureToolStorageGroup(groups, fileGroup.toolKey, locale);
    group.fileGroups.push(fileGroup);
    group.totalSize += fileGroup.size;
  }

  return [...groups.values()].sort((left, right) => right.totalSize - left.totalSize || left.label.localeCompare(right.label));
}

function ensureToolStorageGroup(groups: Map<string, ToolStorageGroup>, toolKey: string, locale: Locale): ToolStorageGroup {
  const existing = groups.get(toolKey);
  if (existing) return existing;

  const created: ToolStorageGroup = {
    id: toolKey,
    label: getToolGroupLabel(toolKey, locale),
    databaseEntries: [],
    fileGroups: [],
    totalSize: 0,
  };

  groups.set(toolKey, created);
  return created;
}

function getToolGroupLabel(toolKey: string, locale: Locale): string {
  if (toolKey === 'site') return storageText(locale, 'siteSettings');
  if (toolKey === 'unassigned-models') return storageText(locale, 'unassignedModels');

  const tool = tools.find((candidate) => candidate.slug === toolKey);
  return tool ? localize(tool.i18n.name, locale) : toolKey;
}

function getDatabaseEntryLabel(entry: DatabaseEntry, locale: Locale): string {
  const parsed = typeof entry.key === 'string' ? parseToolLocalStorageKey(entry.key) : null;
  if (!parsed) return entry.keyText;

  if (parsed.kind === 'settings') {
    return parsed.entryId;
  }

  return `${storageText(locale, 'data')}: ${parsed.entryId}`;
}

function getDatabaseEntrySource(entry: DatabaseEntry, locale: Locale): string {
  const source = entry.source === 'localStorage' ? storageText(locale, 'localStorage') : storageText(locale, 'indexedDb');
  return entry.storeName ? `${source} · ${entry.databaseName} / ${entry.storeName}` : `${source} · ${entry.databaseName}`;
}

function getFileGroupLabel(group: FileGroup, _locale: Locale): string {
  return group.modelName;
}

function getFileGroupSource(group: FileGroup, locale: Locale): string {
  return group.source === 'cache' ? storageText(locale, 'cacheStorage') : storageText(locale, 'opfs');
}

function inferStorageToolKey(candidates: readonly string[]): string {
  return inferStorageToolSlug(candidates) ?? (candidates.some((candidate) => inferModelName(candidate)) ? 'unassigned-models' : 'site');
}

async function scanStorage(): Promise<StorageSnapshot> {
  const estimate = await navigator.storage?.estimate?.();
  const databaseEntries = await collectDatabaseEntries();
  const fileGroups = await collectFileGroups();

  return {
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    databaseEntries,
    fileGroups,
    databaseSupported: typeof window.localStorage !== 'undefined' || typeof window.indexedDB !== 'undefined',
    fileStorageSupported: typeof window.caches !== 'undefined' || Boolean(getOpfsDirectory()),
  };
}

async function collectDatabaseEntries(): Promise<DatabaseEntry[]> {
  const entries: DatabaseEntry[] = [];

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      const value = window.localStorage.getItem(key) ?? '';
      const toolKey = inferStorageToolKey([key, value]);
      entries.push({
        id: `localStorage:${key}`,
        source: 'localStorage',
        databaseName: 'origin',
        storeName: 'localStorage',
        key,
        keyText: key,
        size: estimateSerializedSize(key) + estimateSerializedSize(value),
        preview: previewStorageValue(value),
        toolKey,
      });
    }
  } catch {
    // Some privacy modes expose the API but throw on access.
  }

  if (typeof window.indexedDB?.databases !== 'function') {
    return entries.sort(sortDatabaseEntries);
  }

  const databases = await window.indexedDB.databases();

  for (const databaseInfo of databases) {
    if (!databaseInfo.name) continue;
    const db = await openIndexedDb(databaseInfo.name);

    try {
      for (const storeName of Array.from(db.objectStoreNames)) {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const keys = await requestToPromise<IDBValidKey[]>(store.getAllKeys());

        for (const key of keys) {
          const keyText = stableKeyText(key);
          if (isInternalRuntimeDatabaseEntry(databaseInfo.name, storeName, keyText)) continue;

          const value = await requestToPromise<unknown>(store.get(key));
          const preview = previewStorageValue(value, 1200);
          const toolKey = inferStorageToolKey([databaseInfo.name, storeName, keyText, preview]);
          entries.push({
            id: `indexedDB:${databaseInfo.name}:${storeName}:${keyText}`,
            source: 'indexedDB',
            databaseName: databaseInfo.name,
            storeName,
            key,
            keyText,
            size: estimateSerializedSize(keyText) + estimateSerializedSize(value),
            preview,
            toolKey,
          });
        }
      }
    } finally {
      db.close();
    }
  }

  return entries.sort(sortDatabaseEntries);
}

async function collectFileGroups(): Promise<FileGroup[]> {
  const groups = new Map<string, FileGroup>();

  await collectCacheGroups(groups);
  await collectOpfsGroups(groups);

  return [...groups.values()].sort((left, right) => right.size - left.size || left.label.localeCompare(right.label));
}

async function collectCacheGroups(groups: Map<string, FileGroup>): Promise<void> {
  if (typeof window.caches === 'undefined') return;

  for (const cacheName of await window.caches.keys()) {
    const cache = await window.caches.open(cacheName);
    const requests = await cache.keys();

    for (const request of requests) {
      const response = await cache.match(request);
      const size = response ? await getResponseSize(response) : 0;
      const group = inferStorageGroup(request.url);
      if (group === FALLBACK_GROUP) continue;
      const modelName = inferModelName(request.url) ?? group;
      const toolKey = inferStorageToolKey([cacheName, request.url, modelName]);
      const id = `cache:${cacheName}:${toolKey}:${modelName}`;
      const existing = groups.get(id);

      if (existing) {
        existing.size += size;
        existing.count += 1;
        existing.urls?.push(request.url);
        if (existing.samplePaths.length < 4) existing.samplePaths.push(request.url);
        continue;
      }

      groups.set(id, {
        id,
        source: 'cache',
        group,
        label: modelName,
        modelName,
        toolKey,
        size,
        count: 1,
        samplePaths: [request.url],
        cacheName,
        urls: [request.url],
      });
    }
  }
}

async function collectOpfsGroups(groups: Map<string, FileGroup>): Promise<void> {
  const getDirectory = getOpfsDirectory();
  if (!getDirectory) return;

  const root = await getDirectory();
  let toolsDirectory: OpfsDirectoryHandle;

  try {
    toolsDirectory = await root.getDirectoryHandle('tools');
  } catch {
    return;
  }

  await collectOpfsContractFiles(toolsDirectory, 'tools', groups);
}

async function collectOpfsContractFiles(directory: OpfsDirectoryHandle, basePath: string, groups: Map<string, FileGroup>): Promise<void> {
  for await (const handle of directory.values()) {
    const path = basePath ? `${basePath}/${handle.name}` : handle.name;

    if (handle.kind === 'directory') {
      await collectOpfsContractFiles(handle, path, groups);
      continue;
    }

    const parsed = parseToolFileStoragePath(path);
    if (!parsed) continue;

    const file = await handle.getFile();
    const modelName = parsed.modelId;
    const toolKey = parsed.toolSlug;
    const id = `opfs:${toolKey}:${modelName}`;
    const existing = groups.get(id);

    if (existing) {
      existing.size += file.size;
      existing.count += 1;
      if (!existing.opfsNames?.includes(parsed.modelRootPath)) {
        existing.opfsNames?.push(parsed.modelRootPath);
      }
      if (existing.samplePaths.length < 4) existing.samplePaths.push(path);
      continue;
    }

    groups.set(id, {
      id,
      source: 'opfs',
      group: modelName,
      label: modelName,
      modelName,
      toolKey,
      size: file.size,
      count: 1,
      samplePaths: [path],
      opfsNames: [parsed.modelRootPath],
    });
  }
}

async function deleteIndexedDbEntry(entry: DatabaseEntry): Promise<void> {
  const db = await openIndexedDb(entry.databaseName);

  try {
    const transaction = db.transaction(entry.storeName, 'readwrite');
    transaction.objectStore(entry.storeName).delete(entry.key as IDBValidKey);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

async function deleteFileGroup(group: FileGroup): Promise<void> {
  if (group.source === 'cache' && group.cacheName && group.urls) {
    const cache = await window.caches.open(group.cacheName);
    await Promise.all(group.urls.map((url) => cache.delete(url)));
    return;
  }

  const getDirectory = getOpfsDirectory();
  if (group.source === 'opfs' && getDirectory && group.opfsNames) {
    const root = await getDirectory();
    await Promise.all(group.opfsNames.map((name) => removeOpfsPath(root, name)));
  }
}

async function removeOpfsPath(root: OpfsDirectoryHandle, path: string): Promise<void> {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return;

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment);
  }

  await directory.removeEntry(segments.at(-1) as string, { recursive: true });
}

function openIndexedDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(name);
    request.onerror = () => reject(request.error ?? new Error(`Cannot open IndexedDB database: ${name}`));
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

async function getResponseSize(response: Response): Promise<number> {
  const length = response.headers.get('content-length');
  if (length && Number.isFinite(Number(length))) return Number(length);
  return (await response.clone().blob()).size;
}

function sortDatabaseEntries(left: DatabaseEntry, right: DatabaseEntry): number {
  return (
    left.source.localeCompare(right.source) ||
    left.databaseName.localeCompare(right.databaseName) ||
    left.storeName.localeCompare(right.storeName) ||
    left.keyText.localeCompare(right.keyText)
  );
}

function getOpfsDirectory(): (() => Promise<OpfsDirectoryHandle>) | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<OpfsDirectoryHandle> };
  return storage.getDirectory?.bind(navigator.storage);
}
