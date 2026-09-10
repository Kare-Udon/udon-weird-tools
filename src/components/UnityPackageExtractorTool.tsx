import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Locale } from '@/i18n/config';
import {
  chooseOutputDirectory,
  extractToDirectory,
  isStreamingSupported,
  type ExtractionProgress,
  type ExtractionResult,
} from '@/lib/unitypackage-extractor/browser';
import { DefaultToolPlayground } from './ToolPlayground';
import {
  getUnityPackageExtractorErrorText,
  getUnityPackageExtractorWarningText,
  type UnityPackageExtractorUiKey,
  unityPackageExtractorText,
} from '@/tools/unitypackage-extractor/ui';

type UnityPackageExtractorToolProps = {
  locale: Locale;
};

type EntryPreview = {
  path: string;
  size: number | null;
};

type ExtractionResultWithDiagnostics = ExtractionResult & {
  entries?: unknown;
  preview?: unknown;
  diagnostics?: unknown;
};

const INITIAL_PROGRESS: ExtractionProgress = {
  phase: 'scanning',
  bytesRead: 0,
  totalBytes: 0,
  filesWritten: 0,
};

export default function UnityPackageExtractorTool({ locale }: UnityPackageExtractorToolProps) {
  const [streamingSupported, setStreamingSupported] = useState<boolean | null>(null);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ExtractionProgress>(INITIAL_PROGRESS);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partialDirectoryName, setPartialDirectoryName] = useState<string | null>(null);
  const [partialOutputNotice, setPartialOutputNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);

  const directoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const pickerIdRef = useRef(0);
  const cancelRequestedRunIdRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    try {
      const supported = isStreamingSupported();
      if (active) setStreamingSupported(supported);
    } catch {
      if (active) setStreamingSupported(false);
    }

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      pickerIdRef.current += 1;
      cancelRequestedRunIdRef.current = null;
      invalidateActiveRun(runIdRef, controllerRef);
    };
  }, []);

  function copy(key: UnityPackageExtractorUiKey, values?: Record<string, string | number>): string {
    return unityPackageExtractorText(locale, key, values);
  }

  async function handleChooseDirectory(): Promise<void> {
    if (busy || choosingDirectory) return;

    const pickerId = pickerIdRef.current + 1;
    pickerIdRef.current = pickerId;
    setChoosingDirectory(true);
    try {
      const nextDirectory = await chooseOutputDirectory();
      if (pickerIdRef.current !== pickerId) return;

      invalidateActiveRun(runIdRef, controllerRef);
      cancelRequestedRunIdRef.current = null;
      directoryRef.current = nextDirectory;
      setDirectory(nextDirectory);
      setSelectedFile(null);
      setProgress(INITIAL_PROGRESS);
      setResult(null);
      setError(null);
      setPartialDirectoryName(null);
      setPartialOutputNotice(false);
      setCancelling(false);
      setResetVersion((current) => current + 1);
    } catch (directoryError) {
      if (pickerIdRef.current !== pickerId) return;
      // 取消或拒绝目录选择属于本次操作结果，不代表浏览器缺少能力。
      setError(getUnityPackageExtractorErrorText(locale, directoryError));
      setPartialOutputNotice(false);
    } finally {
      if (pickerIdRef.current === pickerId) setChoosingDirectory(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) return;

    const selectedDirectory = directoryRef.current;
    setSelectedFile(file);

    if (!selectedDirectory) {
      setError(getUnityPackageExtractorErrorText(locale, { code: 'directory-required' }));
      return;
    }

    startExtraction(file, selectedDirectory);
  }

  function startExtraction(file: File, selectedDirectory: FileSystemDirectoryHandle): void {
    const runId = invalidateActiveRun(runIdRef, controllerRef);
    cancelRequestedRunIdRef.current = null;
    const controller = new AbortController();
    controllerRef.current = controller;

    setBusy(true);
    setCancelling(false);
    setError(null);
    setResult(null);
    setPartialDirectoryName(null);
    setPartialOutputNotice(false);
    setProgress({
      phase: 'scanning',
      bytesRead: 0,
      totalBytes: file.size,
      filesWritten: 0,
    });

    void extractToDirectory(file, selectedDirectory, {
      signal: controller.signal,
      onProgress: (nextProgress) => {
        if (runIdRef.current !== runId) return;
        setProgress(normalizeProgress(nextProgress, file.size));
      },
    })
      .then((nextResult) => {
        if (runIdRef.current !== runId) return;

        if (cancelRequestedRunIdRef.current === runId || controller.signal.aborted) {
          setResult(null);
          setError(getUnityPackageExtractorErrorText(locale, { code: 'cancelled' }));
          setPartialDirectoryName(readPartialDirectoryName(nextResult));
          setPartialOutputNotice(true);
          return;
        }

        setResult(nextResult);
        setProgress({
          phase: 'extracting',
          bytesRead: file.size,
          totalBytes: file.size,
          filesWritten: nextResult.filesWritten,
        });
      })
      .catch((runError: unknown) => {
        if (runIdRef.current !== runId) return;
        const cancellationRequested = cancelRequestedRunIdRef.current === runId || controller.signal.aborted;
        setError(
          getUnityPackageExtractorErrorText(
            locale,
            cancellationRequested ? { code: 'cancelled' } : runError,
          ),
        );
        setPartialDirectoryName(readPartialDirectoryName(runError));
        setPartialOutputNotice(true);
      })
      .finally(() => {
        if (runIdRef.current !== runId) return;
        cancelRequestedRunIdRef.current = null;
        controllerRef.current = null;
        setBusy(false);
        setCancelling(false);
      });
  }

  function handleCancel(): void {
    if (!busy || cancelling) return;

    const activeController = controllerRef.current;
    if (!activeController) return;

    cancelRequestedRunIdRef.current = runIdRef.current;
    activeController.abort();
    setCancelling(true);
  }

  function handleReset(): void {
    pickerIdRef.current += 1;
    cancelRequestedRunIdRef.current = null;
    invalidateActiveRun(runIdRef, controllerRef);
    directoryRef.current = null;
    setDirectory(null);
    setSelectedFile(null);
    setProgress(INITIAL_PROGRESS);
    setResult(null);
    setError(null);
    setPartialDirectoryName(null);
    setPartialOutputNotice(false);
    setBusy(false);
    setCancelling(false);
    setResetVersion((current) => current + 1);
  }

  if (streamingSupported === null) {
    return <div className="panel muted-panel">{copy('streamingModeTitle')}…</div>;
  }

  if (!streamingSupported) {
    return <DefaultToolPlayground slug="unitypackage-extractor" locale={locale} />;
  }

  const progressPercent = getProgressPercent(progress);
  const previewEntries = result ? getEntryPreview(result) : [];

  return (
    <div className="tool-playground unitypackage-extractor-tool">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{copy('streamingModeTitle')}</h2>
            <p>{copy('streamingModeDescription')}</p>
          </div>
        </div>

        <div className="form-stack">
          <div className="field">
            <span className="field-label">{copy('directoryLabel')}</span>
            <button
              type="button"
              className="primary"
              onClick={() => void handleChooseDirectory()}
              disabled={busy || choosingDirectory}
            >
              {directory ? copy('changeDirectory') : copy('chooseDirectory')}
            </button>
            <span className="field-help" style={{ overflowWrap: 'anywhere' }}>
              {directory
                ? copy('directorySelected', { directory: directory.name })
                : copy('directoryNotSelected')}
            </span>
          </div>

          <label className="field" htmlFor="unitypackage-file">
            <span className="field-label">{copy('packageLabel')}</span>
            <input
              key={resetVersion}
              id="unitypackage-file"
              type="file"
              accept=".unitypackage,application/gzip,application/x-gzip,application/octet-stream"
              disabled={!directory || choosingDirectory}
              onChange={handleFileChange}
            />
            <span className="sr-only">{copy('packageHelper')}</span>
          </label>
        </div>

        <div className="button-row">
          {busy && (
            <button type="button" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? copy('cancelling') : copy('cancel')}
            </button>
          )}
          <button type="button" onClick={handleReset} disabled={choosingDirectory}>
            {copy('reset')}
          </button>
        </div>

      </section>

      <section className="panel">
        <div className="section-heading output-heading">
          <div>
            <h2>{copy('outputTitle')}</h2>
            {selectedFile && (
              <p style={{ overflowWrap: 'anywhere' }}>
                {selectedFile.name}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="error-panel" role="alert">
            <strong>{copy('errorTitle')}</strong>
            <p>{error}</p>
            {partialOutputNotice && (
              <p>
                {partialDirectoryName
                  ? `${copy('partialOutput')} ${copy('outputSubdirectory')}: ${partialDirectoryName}`
                  : copy('partialOutput')}
              </p>
            )}
          </div>
        )}

        {busy && <StreamingProgress progress={progress} progressPercent={progressPercent} locale={locale} />}

        {!busy && result && (
          <StreamingResult result={result} previewEntries={previewEntries} locale={locale} />
        )}

        {!busy && !result && !error && (
          <div className="empty-result">
            {directory ? copy('readyForPackage') : copy('waitingForDirectory')}
          </div>
        )}
      </section>
    </div>
  );
}

function StreamingProgress({
  progress,
  progressPercent,
  locale,
}: {
  progress: ExtractionProgress;
  progressPercent: number | null;
  locale: Locale;
}) {
  const phaseLabel = unityPackageExtractorText(
    locale,
    progress.phase === 'scanning' ? 'scanning' : 'extracting',
  );
  const progressLabel = progressPercent === null
    ? phaseLabel
    : `${phaseLabel} ${unityPackageExtractorText(locale, 'percentage', { value: progressPercent })}`;

  return (
    <div className="download-result" aria-live="polite">
      <div className="download-result-summary">
        <strong>{unityPackageExtractorText(locale, 'progressTitle')}</strong>
        <span>{progressLabel}</span>
        <progress
          max={100}
          value={progressPercent ?? undefined}
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent ?? undefined}
        />
        <div className="base64-status-strip">
          <span>
            <strong>{unityPackageExtractorText(locale, 'bytesRead')}:</strong>{' '}
            {formatBytes(progress.bytesRead)} / {formatBytes(progress.totalBytes)}
          </span>
          <span>
            <strong>{unityPackageExtractorText(locale, 'filesWritten')}:</strong> {progress.filesWritten}
          </span>
          <span>
            <strong>{unityPackageExtractorText(locale, 'progressPercentLabel')}:</strong>{' '}
            {progressPercent === null ? '—' : `${progressPercent}%`}
          </span>
        </div>
      </div>
    </div>
  );
}

function StreamingResult({
  result,
  previewEntries,
  locale,
}: {
  result: ExtractionResult;
  previewEntries: EntryPreview[];
  locale: Locale;
}) {
  const warnings = result.warnings.map((warning) => getUnityPackageExtractorWarningText(locale, warning));

  return (
    <div className="download-result">
      <div className="download-result-summary">
        <strong>{unityPackageExtractorText(locale, 'complete')}</strong>
        <p style={{ margin: 0, overflowWrap: 'anywhere' }}>
          {unityPackageExtractorText(locale, 'outputSubdirectory')}: {result.directoryName}
        </p>
      </div>

      <div className="storage-stat-grid">
        <div className="storage-stat">
          <span>{unityPackageExtractorText(locale, 'statistics')}</span>
          <strong>{unityPackageExtractorText(locale, 'writtenFiles')}: {result.filesWritten}</strong>
        </div>
        <div className="storage-stat">
          <span>{unityPackageExtractorText(locale, 'writtenBytes')}</span>
          <strong>{formatBytes(result.bytesWritten)}</strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="download-warning-list">
          <strong>{unityPackageExtractorText(locale, 'warnings')}</strong>
          <ul>
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`} style={{ overflowWrap: 'anywhere' }}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {previewEntries.length > 0 && (
        <details className="download-file-list">
          <summary className="result-collection-summary">
            {unityPackageExtractorText(locale, 'entryPreview')}
          </summary>
          <div className="download-file-scroll">
            <div className="result-list">
              {previewEntries.map((entry) => (
                <article className="result-item" key={entry.path}>
                  <div className="result-item-heading">
                    <h3 style={{ overflowWrap: 'anywhere' }}>{entry.path}</h3>
                    {entry.size !== null && <p>{formatBytes(entry.size)}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function invalidateActiveRun(
  runIdRef: { current: number },
  controllerRef: { current: AbortController | null },
): number {
  runIdRef.current += 1;
  controllerRef.current?.abort();
  controllerRef.current = null;
  return runIdRef.current;
}

function normalizeProgress(progress: ExtractionProgress, fallbackTotalBytes: number): ExtractionProgress {
  const totalBytes = Number.isFinite(progress.totalBytes) && progress.totalBytes > 0
    ? progress.totalBytes
    : fallbackTotalBytes;
  const bytesRead = Number.isFinite(progress.bytesRead)
    ? Math.min(Math.max(progress.bytesRead, 0), totalBytes)
    : 0;
  const filesWritten = Number.isFinite(progress.filesWritten) ? Math.max(0, progress.filesWritten) : 0;

  return {
    phase: progress.phase === 'extracting' ? 'extracting' : 'scanning',
    bytesRead,
    totalBytes,
    filesWritten,
  };
}

function getProgressPercent(progress: ExtractionProgress): number | null {
  if (!Number.isFinite(progress.totalBytes) || progress.totalBytes <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((progress.bytesRead / progress.totalBytes) * 100)));
}

function getEntryPreview(result: ExtractionResult): EntryPreview[] {
  const diagnostics = result as ExtractionResultWithDiagnostics;
  const candidate = diagnostics.entries ?? diagnostics.preview ?? diagnostics.diagnostics;
  if (!Array.isArray(candidate)) return [];

  return candidate.slice(0, 12).flatMap((entry): EntryPreview[] => {
    if (typeof entry === 'string') return [{ path: entry, size: null }];
    if (!entry || typeof entry !== 'object') return [];

    const record = entry as Record<string, unknown>;
    if (typeof record.path !== 'string' || !record.path) return [];
    return [{
      path: record.path,
      size: typeof record.size === 'number' && Number.isFinite(record.size) ? Math.max(0, record.size) : null,
    }];
  });
}

function readPartialDirectoryName(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  for (const key of ['partialDirectoryName', 'directoryName']) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
  }

  return null;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
