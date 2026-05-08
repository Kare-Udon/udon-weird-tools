import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/i18n/config';
import { getDefaultSpeechLanguage, getSpeechModel, getSpeechModelCacheCoverage, isSpeechModelCacheUrl, speechModelOptions } from '@/tools/speech-to-text/models';
import type { SpeechLanguage } from '@/tools/speech-to-text/models';
import { bindProcessorTokenizer } from '@/tools/speech-to-text/runtime';
import { sttText } from '@/tools/speech-to-text/ui';

type SpeechToTextToolProps = {
  locale: Locale;
};

type Backend = 'webgpu' | 'wasm';
type ModelState = 'idle' | 'loading' | 'ready' | 'error';
type CacheState = 'checking' | 'empty' | 'partial' | 'downloaded' | 'deleted';

type ProgressInfo = {
  status?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  file?: string;
  files?: Record<string, ProgressFile>;
};

type ProgressFile = {
  loaded: number;
  total: number;
  progress?: number;
};

type ProgressTrack = {
  loaded: number;
  total: number;
};

type TranscriptionChunk = {
  text: string;
  timestamp?: [number, number];
};

type TranscriptionOutput = {
  text: string;
  chunks?: TranscriptionChunk[];
};

type Transcriber = {
  (audio: string | URL | Float32Array, options?: Record<string, unknown>): Promise<TranscriptionOutput>;
  tokenizer?: unknown;
  dispose?: () => void | Promise<void>;
};

const CACHE_KEY = 'transformers-cache';
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

export default function SpeechToTextTool({ locale }: SpeechToTextToolProps) {
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [cacheState, setCacheState] = useState<CacheState>('checking');
  const [backend, setBackend] = useState<Backend>('wasm');
  const [webGpuAvailable, setWebGpuAvailable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [language, setLanguage] = useState<SpeechLanguage>(() => getDefaultSpeechLanguage(locale));
  const selectedModel = getSpeechModel(language);
  const [cacheCoverage, setCacheCoverage] = useState(() => ({ downloadedFiles: 0, totalFiles: selectedModel.requiredFiles.length }));
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingDetail, setProcessingDetail] = useState('');
  const [output, setOutput] = useState<TranscriptionOutput | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const transcriberRef = useRef<Transcriber | null>(null);
  const loadingRef = useRef<Promise<Transcriber> | null>(null);
  const loadedModelIdRef = useRef<string | null>(null);
  const progressFilesRef = useRef<Map<string, ProgressTrack>>(new Map());
  const modelMenuRef = useRef<HTMLDetailsElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const runIdRef = useRef(0);

  useEffect(() => {
    const hasGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    setWebGpuAvailable(hasGpu);
    setBackend(hasGpu ? 'webgpu' : 'wasm');
  }, []);

  useEffect(() => {
    runIdRef.current += 1;
    setTranscribing(false);
    cancelRecording();
    setRecording(false);
    setRecordingElapsed(0);
    resetProcessingProgress();
    setOutput(null);
    setCopied(false);
    setError('');
    setModelState('idle');
    setCacheCoverage({ downloadedFiles: 0, totalFiles: selectedModel.requiredFiles.length });
    resetModelProgress();
    loadingRef.current = null;
    loadedModelIdRef.current = null;
    const currentTranscriber = transcriberRef.current;
    transcriberRef.current = null;
    void currentTranscriber?.dispose?.();
    void refreshCacheState(selectedModel.modelId);
  }, [language, selectedModel.modelId]);

  useEffect(() => {
    return () => {
      cancelRecording();
    };
  }, []);

  useEffect(() => {
    if (!recording) return;

    const startedAt = Date.now();
    setRecordingElapsed(0);
    const interval = window.setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [recording]);

  useEffect(() => {
    if (!modelMenuOpen || typeof document === 'undefined') return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && modelMenuRef.current?.contains(target)) return;
      setModelMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setModelMenuOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [modelMenuOpen]);

  async function refreshCacheState(modelId = selectedModel.modelId) {
    const model = getSpeechModelById(modelId);
    if (typeof window === 'undefined' || !('caches' in window)) {
      setCacheState('empty');
      setCacheCoverage({ downloadedFiles: 0, totalFiles: model.requiredFiles.length });
      return;
    }

    setCacheState('checking');
    const cache = await window.caches.open(CACHE_KEY);
    const keys = await cache.keys();
    const coverage = getSpeechModelCacheCoverage(
      keys.map((request) => request.url),
      model,
    );
    setCacheCoverage({ downloadedFiles: coverage.downloadedFiles, totalFiles: coverage.totalFiles });
    setCacheState(coverage.state);
  }

  function stopRecordingStream() {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.stop();
    }
    recordingChunksRef.current = [];
    stopRecordingStream();
  }

  async function ensureModel(): Promise<Transcriber> {
    const modelId = selectedModel.modelId;
    if (transcriberRef.current && loadedModelIdRef.current === modelId) return transcriberRef.current;
    if (loadingRef.current) return loadingRef.current;

    setModelState('loading');
    setError('');
    resetModelProgress();

    const requestedBackend: Backend = webGpuAvailable ? 'webgpu' : 'wasm';
    const loadPromise = loadTranscriber(modelId, requestedBackend, handleModelProgress)
      .catch(async (firstError) => {
        if (requestedBackend !== 'webgpu') throw firstError;
        setBackend('wasm');
        resetModelProgress();
        return loadTranscriber(modelId, 'wasm', handleModelProgress);
      })
      .then((loaded) => {
        transcriberRef.current = loaded;
        loadedModelIdRef.current = modelId;
        setModelState('ready');
        setProgress(100);
        setCacheState('downloaded');
        setCacheCoverage({ downloadedFiles: selectedModel.requiredFiles.length, totalFiles: selectedModel.requiredFiles.length });
        return loaded;
      })
      .catch((loadError: unknown) => {
        setModelState('error');
        setError(loadError instanceof Error ? loadError.message : String(loadError));
        throw loadError;
      })
      .finally(() => {
        loadingRef.current = null;
        void refreshCacheState(modelId);
      });

    loadingRef.current = loadPromise;
    return loadPromise;
  }

  async function handlePreload() {
    await ensureModel();
  }

  async function handleDeleteModel() {
    runIdRef.current += 1;
    setTranscribing(false);
    resetProcessingProgress();
    setOutput(null);
    setCopied(false);
    setError('');
    await transcriberRef.current?.dispose?.();
    transcriberRef.current = null;
    loadingRef.current = null;
    loadedModelIdRef.current = null;
    setModelState('idle');
    resetModelProgress();

    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await window.caches.open(CACHE_KEY);
      const keys = await cache.keys();
      await Promise.all(keys.filter((request) => isModelCacheRequest(request.url, selectedModel.modelId)).map((request) => cache.delete(request)));
    }

    setCacheCoverage({ downloadedFiles: 0, totalFiles: selectedModel.requiredFiles.length });
    setCacheState('deleted');
  }

  async function handleAudioChange(file: File | null) {
    if (recording) return;
    setAudioFile(file);
    setOutput(null);
    setCopied(false);
    setError('');
    resetProcessingProgress();

    if (!file) return;
    await transcribeFile(file);
  }

  async function handleTranscribe() {
    if (!audioFile) return;
    await transcribeFile(audioFile);
  }

  async function handleStartRecording() {
    if (modelState === 'loading' || transcribing || recording) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(sttText(locale, 'microphoneUnavailable'));
      return;
    }

    setAudioFile(null);
    setOutput(null);
    setCopied(false);
    setError('');
    resetProcessingProgress();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        stopRecordingStream();
        setRecording(false);

        if (chunks.length === 0) {
          setError(sttText(locale, 'microphoneUnavailable'));
          return;
        }

        const recordingType = recorder.mimeType || mimeType || 'audio/webm';
        const recordingFile = new File(chunks, `recording-${Date.now()}.${getRecordingExtension(recordingType)}`, { type: recordingType });
        setAudioFile(recordingFile);
        void transcribeFile(recordingFile);
      };

      recorder.onerror = () => {
        stopRecordingStream();
        setRecording(false);
        setError(sttText(locale, 'microphoneUnavailable'));
      };

      recorder.start();
      setRecording(true);
    } catch (recordError) {
      stopRecordingStream();
      setRecording(false);
      setError(recordError instanceof Error ? recordError.message : sttText(locale, 'microphoneUnavailable'));
    }
  }

  function handleStopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }

  async function transcribeFile(file: File) {
    const currentRun = runIdRef.current + 1;
    runIdRef.current = currentRun;

    if (file.size > MAX_AUDIO_BYTES) {
      setError(`${formatBytes(file.size)} > ${formatBytes(MAX_AUDIO_BYTES)}`);
      return;
    }

    setTranscribing(true);
    setProcessingProgress(0);
    setProcessingDetail('');
    setError('');
    setOutput(null);
    setCopied(false);

    const url = URL.createObjectURL(file);

    try {
      const transcriber = await ensureModel();
      if (runIdRef.current !== currentRun) return;

      const duration = await getAudioDuration(url).catch(() => null);
      const maxNewTokens = estimateMaxNewTokens(duration);
      const streamer = transcriber.tokenizer
        ? await createProgressStreamer(transcriber.tokenizer, maxNewTokens, (tokenCount, tokenLimit) => {
            if (runIdRef.current !== currentRun) return;
            const nextProgress = getTokenProgress(tokenCount, tokenLimit);
            setProcessingDetail(`${Math.round(nextProgress)}%`);
            setProcessingProgress(nextProgress);
          })
        : null;

      const result = await transcriber(url, {
        task: 'transcribe',
        ...(maxNewTokens ? { max_new_tokens: maxNewTokens } : {}),
        ...(streamer ? { streamer } : {}),
      });

      if (runIdRef.current !== currentRun) return;
      setProcessingProgress(100);
      setProcessingDetail('');
      setOutput(result);
    } catch (transcribeError) {
      if (runIdRef.current !== currentRun) return;
      setError(transcribeError instanceof Error ? transcribeError.message : String(transcribeError));
    } finally {
      URL.revokeObjectURL(url);
      if (runIdRef.current === currentRun) {
        setTranscribing(false);
      }
    }
  }

  async function handleCopy() {
    if (!output?.text) return;
    await navigator.clipboard.writeText(output.text.trim());
    setCopied(true);
  }

  function resetModelProgress() {
    progressFilesRef.current = new Map();
    setProgress(0);
  }

  function resetProcessingProgress() {
    setProcessingProgress(0);
    setProcessingDetail('');
  }

  function handleModelProgress(info: ProgressInfo) {
    if (info.files) {
      const nextFiles = new Map<string, ProgressTrack>();
      for (const [file, fileProgress] of Object.entries(info.files)) {
        nextFiles.set(file, {
          loaded: fileProgress.loaded,
          total: fileProgress.total,
        });
      }
      progressFilesRef.current = nextFiles;
    } else if (info.file) {
      const nextFiles = new Map(progressFilesRef.current);
      const previous = nextFiles.get(info.file);
      nextFiles.set(info.file, {
        loaded: info.loaded ?? previous?.loaded ?? 0,
        total: info.total ?? previous?.total ?? 0,
      });
      progressFilesRef.current = nextFiles;
    }

    if (info.status === 'progress_total' && typeof info.progress === 'number') {
      const nextProgress = clampProgress(info.progress);
      setProgress((previous) => Math.max(previous, nextProgress));
      return;
    }

    const aggregate = aggregateProgress(progressFilesRef.current);
    if (aggregate !== null) {
      setProgress((previous) => Math.max(previous, aggregate));
    } else if (typeof info.progress === 'number') {
      const nextProgress = clampProgress(info.progress);
      setProgress((previous) => Math.max(previous, nextProgress));
    }
  }

  const busy = modelState === 'loading' || transcribing;
  const controlsDisabled = busy || recording;
  const cacheLabel = getCacheLabel(locale, cacheState, cacheCoverage);
  const modelStatusLabel = modelState === 'ready' ? sttText(locale, 'ready') : modelState === 'loading' ? `${Math.round(progress)}%` : cacheLabel;

  return (
    <div className="stt-workbench">
      <section className="panel stt-panel">
        <div className="section-heading stt-audio-heading">
          <h2>{sttText(locale, 'audio')}</h2>
          <details ref={modelMenuRef} className="stt-model-menu" open={modelMenuOpen} onToggle={(event) => setModelMenuOpen(event.currentTarget.open)}>
            <summary aria-expanded={modelMenuOpen}>
              <span>{selectedModel.name}</span>
              <strong>{modelStatusLabel}</strong>
            </summary>
            <div className="stt-model-menu-panel">
              <div className="stt-model-detail-row">
                <span>{sttText(locale, 'model')}</span>
                <div>
                  <strong>{selectedModel.name}</strong>
                  <small>{selectedModel.sizeLabel}</small>
                </div>
              </div>
              <div className="stt-model-detail-row">
                <span>{sttText(locale, 'backend')}</span>
                <div>
                  <strong>{sttText(locale, backend)}</strong>
                  <small>{webGpuAvailable ? sttText(locale, 'webgpu') : sttText(locale, 'wasm')}</small>
                </div>
              </div>
              <div className="stt-model-detail-row">
                <span>{sttText(locale, 'cache')}</span>
                <div>
                  <strong>{cacheLabel}</strong>
                  <small>{CACHE_KEY}</small>
                </div>
              </div>
              <div className="stt-model-actions">
                <button type="button" className="primary" onClick={handlePreload} disabled={busy || modelState === 'ready'}>
                  {modelState === 'loading' ? sttText(locale, 'loading') : sttText(locale, 'preload')}
                </button>
                <button type="button" onClick={handleDeleteModel} disabled={controlsDisabled || (cacheState !== 'downloaded' && cacheState !== 'partial' && modelState !== 'ready')}>
                  {sttText(locale, 'deleteModel')}
                </button>
              </div>
            </div>
          </details>
        </div>

        {modelState === 'loading' && (
          <div className="stt-model-loading" role="status">
            <div className="stt-processing-meta">
              <span>{sttText(locale, 'loading')}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="stt-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div style={{ inlineSize: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="stt-global-controls">
          <label className="stt-language-field">
            <span>{sttText(locale, 'language')}</span>
            <select value={language} onChange={(event) => setLanguage(event.currentTarget.value as SpeechLanguage)} disabled={controlsDisabled}>
              {speechModelOptions.map((option) => (
                <option key={option.language} value={option.language}>
                  {option.labels[locale] ?? option.labels.en}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="stt-source-grid">
          <div className={recording ? 'stt-source-card stt-recorder stt-recorder--recording' : 'stt-source-card stt-recorder'}>
            <div className="stt-source-title">
              <strong>{sttText(locale, 'recordAudio')}</strong>
              <span>{recording ? `${sttText(locale, 'recording')} ${formatSeconds(recordingElapsed)}` : sttText(locale, 'record')}</span>
            </div>
            <div className="stt-recorder-compact">
              <button type="button" className="stt-record-button" onClick={recording ? handleStopRecording : () => void handleStartRecording()} disabled={busy} aria-label={recording ? sttText(locale, 'stopRecording') : sttText(locale, 'recordAudio')}>
                <span aria-hidden="true" />
              </button>
              <div className="stt-recorder-body">
                <div className="stt-waveform" aria-hidden="true">
                  {Array.from({ length: 20 }, (_, index) => (
                    <span key={index} style={{ blockSize: `${waveformHeight(index)}%` }} />
                  ))}
                </div>
                <span className="stt-source-status">{recording ? formatSeconds(recordingElapsed) : audioFile ? `${audioFile.name} · ${formatBytes(audioFile.size)}` : sttText(locale, 'noFile')}</span>
              </div>
            </div>
          </div>

          <div className="stt-source-card stt-upload-card">
            <div className="stt-source-title">
              <strong>{sttText(locale, 'uploadAudio')}</strong>
              <span>{audioFile ? `${audioFile.name} · ${formatBytes(audioFile.size)}` : sttText(locale, 'noFile')}</span>
            </div>

            <div className="stt-upload-control">
              <input ref={fileInputRef} className="stt-file-input" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" onChange={(event) => void handleAudioChange(event.currentTarget.files?.[0] ?? null)} disabled={controlsDisabled} />
              <button type="button" className="stt-upload-button" onClick={() => fileInputRef.current?.click()} disabled={controlsDisabled}>
                <span className="stt-upload-icon" aria-hidden="true" />
                <span>{sttText(locale, 'chooseFile')}</span>
              </button>
              <span className="stt-source-status">{audioFile ? `${audioFile.name} · ${formatBytes(audioFile.size)}` : sttText(locale, 'noFile')}</span>
            </div>
          </div>
        </div>

        <div className="button-row stt-run-row">
          <button type="button" className="primary" onClick={handleTranscribe} disabled={controlsDisabled || !audioFile}>
            {transcribing ? sttText(locale, 'loading') : sttText(locale, 'transcribe')}
          </button>
          <span>{recording ? `${sttText(locale, 'recording')} ${formatSeconds(recordingElapsed)}` : audioFile ? `${audioFile.name} · ${formatBytes(audioFile.size)}` : sttText(locale, 'noFile')}</span>
        </div>
      </section>

      <section className="panel stt-panel stt-output-panel">
        <div className="section-heading output-heading">
          <h2>{sttText(locale, 'output')}</h2>
          {output?.text && (
            <button type="button" onClick={handleCopy}>
              {copied ? '✓' : sttText(locale, 'copy')}
            </button>
          )}
        </div>

        {error && (
          <div className="error-panel" role="alert">
            <strong>{sttText(locale, 'failed')}</strong>
            <p>{error}</p>
          </div>
        )}

        {transcribing && (
          <div className="stt-processing">
            <div className="stt-processing-meta">
              <span>{sttText(locale, 'transcribing')}</span>
              <strong>{processingDetail || `${Math.round(processingProgress)}%`}</strong>
            </div>
            <div className="stt-progress">
              <div style={{ inlineSize: `${processingProgress}%` }} />
            </div>
          </div>
        )}

        {output ? <Transcript output={output} /> : <div className="empty-result">{busy ? sttText(locale, 'loading') : sttText(locale, 'idleOutput')}</div>}
      </section>
    </div>
  );
}

function Transcript({ output }: { output: TranscriptionOutput }) {
  return (
    <div className="stt-transcript">
      <pre>{output.text.trim()}</pre>
      {output.chunks && output.chunks.length > 0 && (
        <div className="stt-chunks">
          {output.chunks.map((chunk, index) => (
            <div key={`${chunk.text}-${index}`} className="stt-chunk">
              <span>{formatTimestamp(chunk.timestamp)}</span>
              <p>{chunk.text.trim()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function createProgressStreamer(
  tokenizer: unknown,
  maxNewTokens: number | null,
  onToken: (tokenCount: number, tokenLimit: number | null) => void,
): Promise<unknown> {
  const { TextStreamer } = await import('@huggingface/transformers');
  let tokenCount = 0;

  return new TextStreamer(tokenizer as never, {
    skip_prompt: true,
    callback_function: () => undefined,
    token_callback_function: (tokens: bigint[]) => {
      tokenCount += tokens.length;
      onToken(tokenCount, maxNewTokens);
    },
  });
}

async function loadTranscriber(modelId: string, backend: Backend, onProgress: (info: ProgressInfo) => void): Promise<Transcriber> {
  const { pipeline, env } = await import('@huggingface/transformers');
  const wasmFactoryUrl = new URL('/vendor/onnxruntime/ort-wasm-simd-threaded.jsep.mjs', window.location.href).href;
  const wasmBinaryUrl = new URL('/vendor/onnxruntime/ort-wasm-simd-threaded.jsep.wasm', window.location.href).href;

  const onnxBackend = env.backends.onnx as {
    wasm?: {
      wasmPaths?: {
        mjs: string;
        wasm: string;
      };
    };
  };

  onnxBackend.wasm = {
    ...(onnxBackend.wasm ?? {}),
    wasmPaths: {
      mjs: wasmFactoryUrl,
      wasm: wasmBinaryUrl,
    },
  };

  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  env.useWasmCache = true;
  env.cacheKey = CACHE_KEY;

  const loaded = await pipeline('automatic-speech-recognition', modelId, {
    device: backend,
    dtype: 'q8',
    progress_callback: onProgress,
  });

  return bindProcessorTokenizer(loaded as Transcriber);
}

async function getAudioDuration(url: string): Promise<number> {
  const audio = document.createElement('audio');
  audio.preload = 'metadata';

  return await new Promise((resolve, reject) => {
    audio.onloadedmetadata = () => {
      const { duration } = audio;
      cleanup();
      Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error('Unknown audio duration.'));
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('Unable to read audio duration.'));
    };
    audio.src = url;

    function cleanup() {
      audio.removeAttribute('src');
      audio.load();
    }
  });
}

function estimateMaxNewTokens(duration: number | null): number | null {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return null;
  return Math.max(1, Math.floor(duration) * 6);
}

function getTokenProgress(tokenCount: number, tokenLimit: number | null): number {
  if (!tokenLimit) return clampProgress(Math.min(90, 8 + tokenCount));
  return clampProgress(Math.min(95, 5 + (tokenCount / tokenLimit) * 90));
}

function waveformHeight(index: number): number {
  const heights = [28, 52, 36, 74, 44, 62, 30, 86, 46, 64, 38, 78, 34, 56];
  return heights[index % heights.length];
}

function isModelCacheRequest(url: string, modelId: string): boolean {
  return isSpeechModelCacheUrl(url, modelId);
}

function getSpeechModelById(modelId: string) {
  return speechModelOptions.find((option) => option.modelId === modelId) ?? speechModelOptions[0];
}

function getCacheLabel(locale: Locale, cacheState: CacheState, coverage: { downloadedFiles: number; totalFiles: number }): string {
  if (cacheState === 'checking') return '...';
  if (cacheState === 'downloaded') return sttText(locale, 'downloaded');
  if (cacheState === 'partial') return `${sttText(locale, 'partial')} ${coverage.downloadedFiles}/${coverage.totalFiles}`;
  if (cacheState === 'deleted') return sttText(locale, 'deleted');
  return sttText(locale, 'empty');
}

function getSupportedRecordingMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

function getRecordingExtension(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function aggregateProgress(files: Map<string, ProgressTrack>): number | null {
  let loaded = 0;
  let total = 0;

  for (const file of files.values()) {
    loaded += Math.max(0, file.loaded);
    total += Math.max(0, file.total);
  }

  if (total <= 0) return null;
  return clampProgress((loaded / total) * 100);
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTimestamp(timestamp: [number, number] | undefined): string {
  if (!timestamp) return '--:--';
  return `${formatSeconds(timestamp[0])} - ${formatSeconds(timestamp[1])}`;
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.max(0, Math.floor(value % 60));
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
