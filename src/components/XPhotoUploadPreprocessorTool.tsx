import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { type Locale } from '@/i18n/config';
import { t } from '@/i18n/ui';
import { localize } from '@/i18n/utils';
import { toolLocalStorageKey } from '@/lib/local/storage-contract';
import {
  X_PHOTO_DEFAULT_SETTINGS,
  X_PHOTO_TOOL_SLUG,
  formatBytes,
  formatQuality,
  normalizeXPhotoSettings,
  processXPhotoToBlob,
  type XPhotoBlobResult,
  type XPhotoProcessingSettings,
  type XPhotoProcessProgress,
  type XPhotoResizeMode,
} from '@/tools/x-photo-upload-preprocessor/run';
import { xPhotoUi } from '@/tools/x-photo-upload-preprocessor/ui';

type XPhotoUploadPreprocessorToolProps = {
  locale: Locale;
};

type DownloadableResult = XPhotoBlobResult & {
  id: string;
};

const SETTINGS_STORAGE_KEY = toolLocalStorageKey(X_PHOTO_TOOL_SLUG, 'settings', 'compression');
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif';
const PHASE_LABEL_KEYS = {
  decoding: 'phaseDecoding',
  resizing: 'phaseResizing',
  encoding: 'phaseEncoding',
  finalizing: 'phaseFinalizing',
} as const satisfies Record<XPhotoProcessProgress['phase'], keyof typeof xPhotoUi>;

export default function XPhotoUploadPreprocessorTool({ locale }: XPhotoUploadPreprocessorToolProps) {
  const [settings, setSettings] = useState<XPhotoProcessingSettings>(X_PHOTO_DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<DownloadableResult | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<XPhotoProcessProgress | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runIdRef = useRef(0);
  const autoDownloadedResultIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        setSettings(normalizeXPhotoSettings(JSON.parse(raw) as Partial<XPhotoProcessingSettings>));
      }
    } catch {
      setSettings(X_PHOTO_DEFAULT_SETTINGS);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings, settingsLoaded]);

  useEffect(() => {
    if (!result) {
      setObjectUrl('');
      return;
    }

    const nextUrl = URL.createObjectURL(result.blob);
    setObjectUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [result]);

  useEffect(() => {
    if (!result || !objectUrl || !settings.autoDownload) return;
    if (autoDownloadedResultIdRef.current === result.id) return;

    autoDownloadedResultIdRef.current = result.id;
    triggerDownload(objectUrl, result.fileName);
  }, [objectUrl, result, settings.autoDownload]);

  const copy = (key: keyof typeof xPhotoUi) => localize(xPhotoUi[key], locale);
  const outputNoteKey = settings.autoDownload ? 'outputNoteAuto' : 'outputNoteManual';
  const waitingKey = settings.autoDownload ? 'waitingAuto' : 'waitingManual';
  const progressPercent = Math.max(0, Math.min(100, Math.round((progress?.progress ?? 0) * 100)));
  const progressLabel = progress ? copy(PHASE_LABEL_KEYS[progress.phase]) : copy('processing');

  function updateSettings(patch: Partial<XPhotoProcessingSettings>) {
    setSettings((current) => normalizeXPhotoSettings({ ...current, ...patch }));
  }

  function resetSettings() {
    setSettings(X_PHOTO_DEFAULT_SETTINGS);
  }

  async function processFile(file: File | null = selectedFile) {
    if (!file) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setSelectedFile(file);
    setResult(null);
    setError('');
    setProcessing(true);
    setProgress({ phase: 'decoding', progress: 0 });

    try {
      const processed = await processXPhotoToBlob(file, settings, locale, (nextProgress) => {
        if (runIdRef.current === runId) {
          setProgress(nextProgress);
        }
      });

      if (runIdRef.current !== runId) return;
      setResult({ ...processed, id: `${runId}-${processed.output.sizeBytes}` });
      setProgress({ phase: 'finalizing', progress: 1 });
    } catch (processError) {
      if (runIdRef.current !== runId) return;
      setError(processError instanceof Error ? processError.message : String(processError));
      setProgress(null);
    } finally {
      if (runIdRef.current === runId) {
        setProcessing(false);
      }
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    if (file) void processFile(file);
    event.currentTarget.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);

    const file = findFirstImageFile(event.dataTransfer.files);
    if (file) {
      void processFile(file);
      return;
    }

    setError(copy('dropHint'));
  }

  async function saveResultImage() {
    if (!result || !objectUrl) return;

    const imageFile = new File([result.blob], result.fileName, { type: result.mimeType });
    const shareData: ShareData = {
      files: [imageFile],
      title: result.fileName,
    };

    try {
      if (typeof navigator.canShare === 'function' && navigator.canShare(shareData) && typeof navigator.share === 'function') {
        await navigator.share(shareData);
        return;
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') {
        return;
      }
    }

    triggerDownload(objectUrl, result.fileName);
  }

  return (
    <div className="x-photo-tool">
      <section className="panel x-photo-panel">
        <div className="section-heading x-photo-heading">
          <div>
            <h2>{t(locale, 'toolInput')}</h2>
          </div>
        </div>

        <div
          className={dragActive ? 'x-photo-drop-zone x-photo-drop-zone--active' : 'x-photo-drop-zone'}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} className="sr-only" type="file" accept={ACCEPTED_IMAGE_TYPES} onChange={handleFileInputChange} />
          <div className="x-photo-drop-content">
            <strong>{copy('dropTitle')}</strong>
            <span>{copy('dropHint')}</span>
            <button type="button" className="primary" onClick={() => fileInputRef.current?.click()} disabled={processing}>
              {copy('selectPhoto')}
            </button>
          </div>
        </div>

        {selectedFile && (
          <div className="x-photo-selected-file">
            <div>
              <strong>{selectedFile.name}</strong>
              <span>
                {formatBytes(selectedFile.size)} · {selectedFile.type || 'image'}
              </span>
            </div>
          </div>
        )}

        <details className="x-photo-advanced">
          <summary>{copy('advanced')}</summary>
          <p>{copy('settingsSaved')}</p>
          <div className="x-photo-options-grid">
            <label className="x-photo-option-row">
              <span>{copy('targetSizeMb')}</span>
              <input type="number" min="0.5" max="20" step="0.1" value={settings.targetSizeMb} onChange={(event) => updateSettings({ targetSizeMb: Number(event.currentTarget.value) })} />
            </label>

            <label className="x-photo-option-row">
              <span>{copy('toleranceMb')}</span>
              <input type="number" min="0.01" max="1" step="0.01" value={settings.toleranceMb} onChange={(event) => updateSettings({ toleranceMb: Number(event.currentTarget.value) })} />
            </label>

            <label className="x-photo-option-row">
              <span>{copy('resizeMode')}</span>
              <select value={settings.resizeMode} onChange={(event) => updateSettings({ resizeMode: event.currentTarget.value as XPhotoResizeMode })}>
                <option value="x-friendly-4k">{copy('resizeXFriendly4k')}</option>
                <option value="keep-original">{copy('resizeKeepOriginal')}</option>
                <option value="custom-long-edge">{copy('resizeCustomLongEdge')}</option>
              </select>
            </label>

            <label className="x-photo-option-row">
              <span>{copy('customLongEdge')}</span>
              <input
                type="number"
                min="512"
                max="8192"
                step="128"
                value={settings.customLongEdge}
                disabled={settings.resizeMode !== 'custom-long-edge'}
                onChange={(event) => updateSettings({ customLongEdge: Number(event.currentTarget.value) })}
              />
            </label>

            <label className="x-photo-option-row">
              <span>{copy('minQuality')}</span>
              <input type="number" min="0.4" max="0.99" step="0.01" value={settings.minQuality} onChange={(event) => updateSettings({ minQuality: Number(event.currentTarget.value) })} />
            </label>

            <label className="x-photo-option-row">
              <span>{copy('maxQuality')}</span>
              <input type="number" min="0.4" max="0.99" step="0.01" value={settings.maxQuality} onChange={(event) => updateSettings({ maxQuality: Number(event.currentTarget.value) })} />
            </label>

            <label className="x-photo-option-row">
              <span>{copy('backgroundColor')}</span>
              <input type="color" value={settings.backgroundColor} onChange={(event) => updateSettings({ backgroundColor: event.currentTarget.value })} />
            </label>

            <label className="x-photo-switch-row">
              <span>{copy('allowDimensionFallback')}</span>
              <input type="checkbox" checked={settings.allowDimensionFallback} onChange={(event) => updateSettings({ allowDimensionFallback: event.currentTarget.checked })} />
            </label>

            <label className="x-photo-switch-row">
              <span>{copy('autoDownload')}</span>
              <input type="checkbox" checked={settings.autoDownload} onChange={(event) => updateSettings({ autoDownload: event.currentTarget.checked })} />
            </label>
          </div>
          <div className="x-photo-advanced-actions">
            <button type="button" onClick={resetSettings} disabled={processing}>
              {copy('resetSettings')}
            </button>
          </div>
        </details>

        <p className="x-photo-privacy-note">{copy('privacyNote')}</p>
      </section>

      <section className="panel x-photo-panel x-photo-output-panel">
        <div className="section-heading output-heading x-photo-heading">
          <div>
            <h2>{t(locale, 'toolOutput')}</h2>
            <p>{copy(outputNoteKey)}</p>
          </div>
          {result && objectUrl && (
            <button type="button" className="button primary" onClick={() => void saveResultImage()}>
              {copy('downloadJpeg')}
            </button>
          )}
        </div>

        {error ? (
          <div className="error-panel x-photo-output-state" role="alert">
            <strong>{t(locale, 'toolError')}</strong>
            <p>{error}</p>
          </div>
        ) : processing ? (
          <div className="empty-result x-photo-output-state x-photo-progress-state">
            <strong>{copy('processing')}</strong>
            <span>{progressLabel}</span>
            <div className="x-photo-progress-track" aria-hidden="true">
              <span style={{ inlineSize: `${progressPercent}%` }} />
            </div>
            <small>{progressPercent}%</small>
          </div>
        ) : result ? (
          <ResultSummary result={result} locale={locale} />
        ) : (
          <div className="empty-result x-photo-output-state">{copy(waitingKey)}</div>
        )}
      </section>
    </div>
  );
}

function ResultSummary({ result, locale }: { result: DownloadableResult; locale: Locale }) {
  const copy = (key: keyof typeof xPhotoUi) => localize(xPhotoUi[key], locale);
  const lowerBound = Math.max(0, result.target.sizeBytes - result.target.toleranceBytes);
  const upperBound = result.target.sizeBytes + result.target.toleranceBytes;

  return (
    <div className="x-photo-result x-photo-output-state">
      <div className="x-photo-result-status">
        <strong>{copy('completed')}</strong>
        <span>{result.fileName}</span>
      </div>

      <div className="x-photo-summary-grid">
        <span>{copy('original')}</span>
        <strong>
          {formatBytes(result.original.sizeBytes)} · {result.original.width}×{result.original.height}
        </strong>
        <span>{copy('output')}</span>
        <strong>
          {formatBytes(result.output.sizeBytes)} · {result.output.width}×{result.output.height}
        </strong>
        <span>{copy('jpegQuality')}</span>
        <strong>{formatQuality(result.output.quality)}</strong>
        <span>{copy('target')}</span>
        <strong>
          {formatBytes(result.target.sizeBytes)} ({formatBytes(lowerBound)}–{formatBytes(upperBound)})
        </strong>
      </div>

    </div>
  );
}

function findFirstImageFile(files: FileList): File | null {
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) return file;
  }

  return files[0] ?? null;
}

function triggerDownload(url: string, fileName: string): void {
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.click();
}
