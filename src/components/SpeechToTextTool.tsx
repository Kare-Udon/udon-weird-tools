import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/i18n/config';
import { getDefaultSpeechLanguage, getSpeechModel, getSpeechModelCacheCoverage, isSpeechModelCacheUrl, speechModelOptions } from '@/tools/speech-to-text/models';
import type { SpeechLanguage } from '@/tools/speech-to-text/models';
import { bindProcessorTokenizer } from '@/tools/speech-to-text/runtime';
import { copyTextToClipboard } from '@/tools/speech-to-text/clipboard';
import { sttText } from '@/tools/speech-to-text/ui';
import { normalizeVoskModelArchive } from '@/tools/speech-to-text/vosk-archive';
import { getVoskTimelineModel } from '@/tools/speech-to-text/vosk';
import type { VoskTimelineModel } from '@/tools/speech-to-text/vosk';
import type { Model as VoskModel } from 'vosk-browser';

type SpeechToTextToolProps = {
  locale: Locale;
};

type Backend = 'webgpu' | 'wasm';
type ModelState = 'idle' | 'loading' | 'ready' | 'error';
type CacheState = 'checking' | 'empty' | 'partial' | 'downloaded' | 'deleted';
type AudioSource = 'none' | 'record' | 'upload';

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

type AlignmentState = 'idle' | 'loading' | 'aligning' | 'ready' | 'error';
type VoskModelState = 'idle' | 'downloading' | 'loading' | 'ready' | 'error';

type TimedWord = {
  word: string;
  start: number;
  end: number;
  conf: number;
};

type TimedTranscriptOutput = {
  text: string;
  words: TimedWord[];
  modelName: string;
};

type TranscriptSentence = {
  id: string;
  text: string;
  originalText: string;
  start: number | null;
  end: number | null;
  confidence: number;
  timing: 'none' | 'exact' | 'approximate' | 'weak';
};

type TimedChar = {
  char: string;
  start: number;
  end: number;
  conf: number;
};

type VoskRecognizerMessage = {
  event: 'result' | 'partialresult' | 'error';
  result?: {
    text?: string;
    result?: TimedWord[];
    partial?: string;
  };
  error?: string;
};

type Transcriber = {
  (audio: string | URL | Float32Array, options?: Record<string, unknown>): Promise<TranscriptionOutput>;
  tokenizer?: unknown;
  dispose?: () => void | Promise<void>;
};

const CACHE_KEY = 'transformers-cache';
const VOSK_CACHE_KEY = 'vosk-model-cache';
const LANGUAGE_STORAGE_KEY = 'udon-tools-stt-language';
const TIMELINE_STORAGE_KEY = 'udon-tools-stt-timeline-enabled';
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

export default function SpeechToTextTool({ locale }: SpeechToTextToolProps) {
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [cacheState, setCacheState] = useState<CacheState>('checking');
  const [backend, setBackend] = useState<Backend>('wasm');
  const [webGpuAvailable, setWebGpuAvailable] = useState(false);
  const [progress, setProgress] = useState(0);
  const [language, setLanguage] = useState<SpeechLanguage>(() => getInitialSpeechLanguage(locale));
  const selectedModel = getSpeechModel(language);
  const [cacheCoverage, setCacheCoverage] = useState(() => ({ downloadedFiles: 0, totalFiles: selectedModel.requiredFiles.length }));
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>('none');
  const [audioUrl, setAudioUrl] = useState('');
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingDetail, setProcessingDetail] = useState('');
  const [output, setOutput] = useState<TranscriptionOutput | null>(null);
  const [timelineEnabled, setTimelineEnabled] = useState(() => getInitialTimelineEnabled());
  const [alignmentState, setAlignmentState] = useState<AlignmentState>('idle');
  const [voskModelState, setVoskModelState] = useState<VoskModelState>('idle');
  const [voskCacheState, setVoskCacheState] = useState<CacheState>('checking');
  const [voskProgress, setVoskProgress] = useState(0);
  const [timedOutput, setTimedOutput] = useState<TimedTranscriptOutput | null>(null);
  const [error, setError] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const transcriberRef = useRef<Transcriber | null>(null);
  const loadingRef = useRef<Promise<Transcriber> | null>(null);
  const loadedModelIdRef = useRef<string | null>(null);
  const voskModelRef = useRef<VoskModel | null>(null);
  const voskLoadingRef = useRef<Promise<VoskModel> | null>(null);
  const loadedVoskLanguageRef = useRef<SpeechLanguage | null>(null);
  const voskBlobUrlRef = useRef<string | null>(null);
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
    rememberSpeechLanguage(language);
  }, [language]);

  useEffect(() => {
    rememberTimelineEnabled(timelineEnabled);
  }, [timelineEnabled]);

  useEffect(() => {
    runIdRef.current += 1;
    setTranscribing(false);
    cancelRecording();
    setRecording(false);
    setRecordingElapsed(0);
    resetProcessingProgress();
    setOutput(null);
    setTimedOutput(null);
    setAlignmentState('idle');
    setError('');
    setModelState('idle');
    setCacheCoverage({ downloadedFiles: 0, totalFiles: selectedModel.requiredFiles.length });
    resetModelProgress();
    loadingRef.current = null;
    loadedModelIdRef.current = null;
    const currentTranscriber = transcriberRef.current;
    transcriberRef.current = null;
    void currentTranscriber?.dispose?.();
    voskModelRef.current?.terminate();
    voskModelRef.current = null;
    voskLoadingRef.current = null;
    loadedVoskLanguageRef.current = null;
    setVoskModelState('idle');
    setVoskProgress(0);
    const nextVoskModel = getVoskTimelineModel(language);
    if (!nextVoskModel.modelUrl) {
      setTimelineEnabled(false);
    }
    void refreshVoskCacheState(nextVoskModel);
    void refreshCacheState(selectedModel.modelId);
  }, [language, selectedModel.modelId]);

  useEffect(() => {
    return () => {
      cancelRecording();
      voskModelRef.current?.terminate();
      revokeVoskBlobUrl();
    };
  }, []);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl('');
      setWaveformPeaks([]);
      return;
    }

    let active = true;
    const nextUrl = URL.createObjectURL(audioFile);
    setAudioUrl(nextUrl);
    void buildWaveformPeaks(audioFile).then((peaks) => {
      if (active) setWaveformPeaks(peaks);
    });

    return () => {
      active = false;
      URL.revokeObjectURL(nextUrl);
    };
  }, [audioFile]);

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

  async function refreshVoskCacheState(timelineModel = getVoskTimelineModel(language)) {
    if (!timelineModel.modelUrl || typeof window === 'undefined' || !('caches' in window)) {
      setVoskCacheState('empty');
      return;
    }

    setVoskCacheState('checking');
    const cache = await window.caches.open(VOSK_CACHE_KEY);
    const cached = await cache.match(timelineModel.modelUrl);
    setVoskCacheState(cached ? 'downloaded' : 'empty');
  }

  function revokeVoskBlobUrl() {
    if (!voskBlobUrlRef.current) return;
    URL.revokeObjectURL(voskBlobUrlRef.current);
    voskBlobUrlRef.current = null;
  }

  async function deleteVoskModelCache(timelineModel: VoskTimelineModel) {
    if (!timelineModel.modelUrl || typeof window === 'undefined' || !('caches' in window)) return;
    const cache = await window.caches.open(VOSK_CACHE_KEY);
    await cache.delete(timelineModel.modelUrl);
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
    setError('');
    try {
      await ensureModel();
      if (timelineEnabled) {
        const timelineModel = getVoskTimelineModel(language);
        if (timelineModel.modelUrl) {
          await ensureVoskModel(timelineModel);
        }
      }
    } catch (preloadError) {
      setError(preloadError instanceof Error ? preloadError.message : String(preloadError));
    }
  }

  async function handleDeleteModel() {
    runIdRef.current += 1;
    setTranscribing(false);
    resetProcessingProgress();
    setOutput(null);
    setTimedOutput(null);
    setAlignmentState('idle');
    setError('');
    await transcriberRef.current?.dispose?.();
    transcriberRef.current = null;
    loadingRef.current = null;
    loadedModelIdRef.current = null;
    voskModelRef.current?.terminate();
    voskModelRef.current = null;
    voskLoadingRef.current = null;
    loadedVoskLanguageRef.current = null;
    setVoskModelState('idle');
    setVoskProgress(0);
    revokeVoskBlobUrl();
    setModelState('idle');
    resetModelProgress();

    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await window.caches.open(CACHE_KEY);
      const keys = await cache.keys();
      await Promise.all(keys.filter((request) => isModelCacheRequest(request.url, selectedModel.modelId)).map((request) => cache.delete(request)));
    }

    await deleteVoskModelCache(getVoskTimelineModel(language));

    setCacheCoverage({ downloadedFiles: 0, totalFiles: selectedModel.requiredFiles.length });
    setCacheState('deleted');
    setVoskCacheState('deleted');
  }

  async function handleAudioChange(file: File | null) {
    if (recording) return;
    setAudioFile(file);
    setAudioSource(file ? 'upload' : 'none');
    setOutput(null);
    setTimedOutput(null);
    setAlignmentState('idle');
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
    if (modelState === 'loading' || voskModelState === 'loading' || transcribing || recording) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(sttText(locale, 'microphoneUnavailable'));
      return;
    }

    setAudioFile(null);
    setAudioSource('none');
    setOutput(null);
    setTimedOutput(null);
    setAlignmentState('idle');
    setError('');
    resetProcessingProgress();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      setAudioSource('record');

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
          setAudioSource('none');
          setError(sttText(locale, 'microphoneUnavailable'));
          return;
        }

        const recordingType = recorder.mimeType || mimeType || 'audio/webm';
        const recordingFile = new File(chunks, `recording-${Date.now()}.${getRecordingExtension(recordingType)}`, { type: recordingType });
        setAudioFile(recordingFile);
        setAudioSource('record');
        void transcribeFile(recordingFile);
      };

      recorder.onerror = () => {
        stopRecordingStream();
        setRecording(false);
        setAudioSource('none');
        setError(sttText(locale, 'microphoneUnavailable'));
      };

      recorder.start();
      setRecording(true);
    } catch (recordError) {
      stopRecordingStream();
      setRecording(false);
      setAudioSource('none');
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
    setTimedOutput(null);
    setAlignmentState('idle');
    const url = URL.createObjectURL(file);

    try {
      const transcriber = await ensureModel();
      if (runIdRef.current !== currentRun) return;
      const activeTimelineModel = timelineEnabled ? getVoskTimelineModel(language) : null;
      if (activeTimelineModel?.modelUrl) {
        await ensureVoskModel(activeTimelineModel);
        if (runIdRef.current !== currentRun) return;
      }

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
      if (activeTimelineModel?.modelUrl) {
        const timedResult = await createVoskTimeline(file, activeTimelineModel, currentRun);
        if (runIdRef.current !== currentRun) return;
        setTimedOutput(timedResult);
        setAlignmentState('ready');
        setProcessingProgress(100);
        setProcessingDetail('');
        setOutput(result);
      } else {
        setProcessingProgress(100);
        setProcessingDetail('');
        setOutput(result);
      }
    } catch (transcribeError) {
      if (runIdRef.current !== currentRun) return;
      setAlignmentState('error');
      setError(transcribeError instanceof Error ? transcribeError.message : String(transcribeError));
    } finally {
      URL.revokeObjectURL(url);
      if (runIdRef.current === currentRun) {
        setTranscribing(false);
      }
    }
  }

  async function ensureVoskModel(timelineModel: VoskTimelineModel): Promise<VoskModel> {
    if (!timelineModel.modelUrl) {
      throw new Error(sttText(locale, 'timelineUnavailable'));
    }

    if (voskModelRef.current && loadedVoskLanguageRef.current === timelineModel.language) {
      return voskModelRef.current;
    }

    if (voskLoadingRef.current && loadedVoskLanguageRef.current === timelineModel.language) {
      return voskLoadingRef.current;
    }

    voskModelRef.current?.terminate();
    voskModelRef.current = null;
    revokeVoskBlobUrl();
    loadedVoskLanguageRef.current = timelineModel.language;
    setVoskModelState('downloading');
    setProcessingProgress(0);
    setProcessingDetail(sttText(locale, 'loadingTimeline'));

    const loadPromise = fetchVoskModelBlobUrl(timelineModel, (nextProgress) => {
      setVoskProgress(nextProgress);
      setProcessingProgress(Math.min(65, nextProgress * 0.65));
    })
      .then(async (blobUrl) => {
        voskBlobUrlRef.current = blobUrl;
        setVoskProgress(100);
        setVoskCacheState('downloaded');
        setVoskModelState('loading');
        setProcessingProgress(70);
        setProcessingDetail(sttText(locale, 'initializingTimeline'));
        const { createModel } = await import('vosk-browser');
        return createModel(blobUrl, -1);
      })
      .then((loaded) => {
        voskModelRef.current = loaded;
        setVoskModelState('ready');
        setVoskProgress(100);
        return loaded;
      })
      .catch((loadError: unknown) => {
        setVoskModelState('error');
        throw loadError;
      })
      .finally(() => {
        voskLoadingRef.current = null;
      });

    voskLoadingRef.current = loadPromise;
    return loadPromise;
  }

  async function createVoskTimeline(file: File, timelineModel: VoskTimelineModel, currentRun: number): Promise<TimedTranscriptOutput> {
    const model = await ensureVoskModel(timelineModel);
    if (runIdRef.current !== currentRun) throw new Error('Cancelled.');

    setAlignmentState('aligning');
    setProcessingProgress(70);
    setProcessingDetail(sttText(locale, 'aligningTimeline'));

    const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext is unavailable.');
    }

    const audioContext = new AudioContextClass();

    try {
      const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
      if (runIdRef.current !== currentRun) throw new Error('Cancelled.');
      return await recognizeVoskBuffer(model, audioBuffer, timelineModel.name);
    } finally {
      await audioContext.close().catch(() => undefined);
    }
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

  const timelineModel = getVoskTimelineModel(language);
  const timelineAvailable = Boolean(timelineModel.modelUrl);
  const timelineStatus = timelineAvailable ? (timelineEnabled ? sttText(locale, 'timelineOn') : sttText(locale, 'timelineOff')) : sttText(locale, 'timelineUnavailable');
  const busy = modelState === 'loading' || voskModelState === 'downloading' || voskModelState === 'loading' || transcribing;
  const controlsDisabled = busy || recording;
  const cacheLabel = getCacheLabel(locale, cacheState, cacheCoverage);
  const modelStatusLabel = modelState === 'ready' ? sttText(locale, 'ready') : modelState === 'loading' ? `${Math.round(progress)}%` : cacheLabel;
  const voskStatusLabel = getVoskStatusLabel(locale, timelineEnabled, timelineAvailable, voskModelState, voskCacheState, voskProgress);
  const combinedModelStatusLabel = getCombinedModelStatusLabel(locale, {
    moonshineState: modelState,
    moonshineCacheState: cacheState,
    moonshineCacheLabel: cacheLabel,
    timelineEnabled,
    timelineAvailable,
    voskState: voskModelState,
    voskCacheState,
  });
  const preloadDisabled = busy || (modelState === 'ready' && (!timelineEnabled || !timelineAvailable || voskModelState === 'ready'));
  const hasMoonshineModel = cacheState === 'downloaded' || cacheState === 'partial' || modelState === 'ready';
  const hasVoskModel = voskCacheState === 'downloaded' || voskModelState === 'ready';
  const deleteDisabled = controlsDisabled || (!hasMoonshineModel && !hasVoskModel);
  const processingLabel = voskModelState === 'downloading' ? sttText(locale, 'downloadingTimeline') : voskModelState === 'loading' ? sttText(locale, 'initializingTimeline') : alignmentState === 'aligning' ? sttText(locale, 'aligningTimeline') : sttText(locale, 'transcribing');
  const selectedAudioLabel = audioFile ? `${audioFile.name} · ${formatBytes(audioFile.size)}` : '';
  const recordSourceActive = audioSource === 'record';
  const uploadSourceActive = audioSource === 'upload';
  const recordCardClass = [
    'stt-source-card',
    'stt-recorder',
    recording ? 'stt-recorder--recording' : '',
    recordSourceActive ? 'stt-source-card--active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const uploadCardClass = ['stt-source-card', 'stt-upload-card', uploadSourceActive ? 'stt-source-card--active' : ''].filter(Boolean).join(' ');
  const recordStatus = recording ? `${sttText(locale, 'recording')} ${formatSeconds(recordingElapsed)}` : recordSourceActive && audioFile ? selectedAudioLabel : sttText(locale, 'noRecording');
  const uploadStatus = uploadSourceActive && audioFile ? selectedAudioLabel : sttText(locale, 'noFile');

  return (
    <div className="stt-workbench">
      <section className="panel stt-panel">
        <div className="section-heading stt-audio-heading">
          <h2>{sttText(locale, 'audio')}</h2>
          <details ref={modelMenuRef} className="stt-model-menu" open={modelMenuOpen} onToggle={(event) => setModelMenuOpen(event.currentTarget.open)}>
            <summary aria-expanded={modelMenuOpen}>
              <span>{timelineEnabled && timelineAvailable ? `${selectedModel.name} + ${timelineModel.name}` : selectedModel.name}</span>
              <strong>{combinedModelStatusLabel}</strong>
            </summary>
            <div className="stt-model-menu-panel">
              <div className="stt-model-split">
                <div className="stt-model-status-card">
                  <div className="stt-model-status-head">
                    <span>{sttText(locale, 'transcriptionModel')}</span>
                    <strong>{modelStatusLabel}</strong>
                  </div>
                  <div className="stt-model-status-body">
                    <strong>{selectedModel.name}</strong>
                    <small>{selectedModel.sizeLabel} · {sttText(locale, backend)}</small>
                  </div>
                  {modelState === 'loading' && (
                    <div className="stt-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
                      <div style={{ inlineSize: `${progress}%` }} />
                    </div>
                  )}
                </div>

                <div className={timelineEnabled && timelineAvailable ? 'stt-model-status-card' : 'stt-model-status-card stt-model-status-card--muted'}>
                  <div className="stt-model-status-head">
                    <span>{sttText(locale, 'alignmentModel')}</span>
                    <strong>{voskStatusLabel}</strong>
                  </div>
                  <div className="stt-model-status-body">
                    <strong>{timelineModel.name}</strong>
                    <small>{timelineAvailable ? timelineModel.sizeLabel : sttText(locale, 'timelineUnavailable')}</small>
                  </div>
                  {(voskModelState === 'downloading' || voskModelState === 'loading') && (
                    <div className={voskModelState === 'loading' ? 'stt-progress stt-progress--indeterminate' : 'stt-progress'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={voskModelState === 'downloading' ? Math.round(voskProgress) : undefined}>
                      <div style={voskModelState === 'downloading' ? { inlineSize: `${voskProgress}%` } : undefined} />
                    </div>
                  )}
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
                <button type="button" className="primary" onClick={handlePreload} disabled={preloadDisabled}>
                  {modelState === 'loading' || voskModelState === 'downloading' || voskModelState === 'loading' ? sttText(locale, 'loading') : sttText(locale, 'preload')}
                </button>
                <button type="button" onClick={handleDeleteModel} disabled={deleteDisabled}>
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
            <select value={language} onChange={(event) => setLanguage(getStoredSpeechLanguage(event.currentTarget.value) ?? getDefaultSpeechLanguage(locale))} disabled={controlsDisabled}>
              {speechModelOptions.map((option) => (
                <option key={option.language} value={option.language}>
                  {option.labels[locale] ?? option.labels.en}
                </option>
              ))}
            </select>
          </label>
          <label className={timelineAvailable ? 'stt-timeline-field' : 'stt-timeline-field stt-timeline-field--disabled'}>
            <span>{sttText(locale, 'timelineMode')}</span>
            <input
              type="checkbox"
              checked={timelineEnabled && timelineAvailable}
              onChange={(event) => setTimelineEnabled(event.currentTarget.checked && timelineAvailable)}
              disabled={controlsDisabled || !timelineAvailable}
            />
            <strong>{timelineStatus}</strong>
          </label>
        </div>

        <div className="stt-source-grid">
          <div className={recordCardClass}>
            <div className="stt-source-title">
              <strong>{sttText(locale, 'recordAudio')}</strong>
              {recordSourceActive && <span className="stt-source-badge">{recording ? sttText(locale, 'recording') : sttText(locale, 'currentSource')}</span>}
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
                <span className="stt-source-status">{recordStatus}</span>
              </div>
            </div>
          </div>

          <div className={uploadCardClass}>
            <div className="stt-source-title">
              <strong>{sttText(locale, 'uploadAudio')}</strong>
              {uploadSourceActive && <span className="stt-source-badge">{sttText(locale, 'currentSource')}</span>}
            </div>

            <div className="stt-upload-control">
              <input ref={fileInputRef} className="stt-file-input" type="file" accept="audio/*,video/*,.wav,.mp3,.m4a,.ogg,.flac,.webm,.mp4,.mov,.mkv" onChange={(event) => void handleAudioChange(event.currentTarget.files?.[0] ?? null)} disabled={controlsDisabled} />
              <button type="button" className="stt-upload-button" onClick={() => fileInputRef.current?.click()} disabled={controlsDisabled}>
                <svg className="stt-upload-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15V4" />
                  <path d="m8 8 4-4 4 4" />
                  <path d="M5 14v4.25A2.75 2.75 0 0 0 7.75 21h8.5A2.75 2.75 0 0 0 19 18.25V14" />
                </svg>
                <span>{sttText(locale, 'chooseFile')}</span>
              </button>
              <span className="stt-source-status">{uploadStatus}</span>
            </div>
          </div>
        </div>

        <div className="button-row stt-run-row">
          <button type="button" className="primary" onClick={handleTranscribe} disabled={controlsDisabled || !audioFile}>
            {transcribing ? sttText(locale, 'loading') : sttText(locale, 'transcribe')}
          </button>
        </div>
      </section>

      <section className="panel stt-panel stt-output-panel">
        <div className="section-heading output-heading">
          <h2>{sttText(locale, 'output')}</h2>
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
              <span>{processingLabel}</span>
              <strong>{processingDetail || `${Math.round(processingProgress)}%`}</strong>
            </div>
            <div className="stt-progress">
              <div style={{ inlineSize: `${processingProgress}%` }} />
            </div>
          </div>
        )}

        {output ? <Transcript output={output} timedOutput={timedOutput} locale={locale} audioUrl={audioUrl} waveformPeaks={waveformPeaks} timelineEnabled={timelineEnabled} /> : <div className="empty-result">{busy ? sttText(locale, 'loading') : sttText(locale, 'idleOutput')}</div>}
      </section>
    </div>
  );
}

function Transcript({
  output,
  timedOutput,
  locale,
  audioUrl,
  waveformPeaks,
  timelineEnabled,
}: {
  output: TranscriptionOutput;
  timedOutput: TimedTranscriptOutput | null;
  locale: Locale;
  audioUrl: string;
  waveformPeaks: number[];
  timelineEnabled: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const [sentences, setSentences] = useState<TranscriptSentence[]>(() => buildTranscriptSentences(output, timedOutput));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(sentences.map((sentence) => sentence.id)));
  const [activeSentenceId, setActiveSentenceId] = useState<string | null>(null);
  const [actionLabel, setActionLabel] = useState('');
  const showTimeline = timelineEnabled && Boolean(timedOutput?.words.length);
  const selectedCount = sentences.filter((sentence) => selectedIds.has(sentence.id)).length;
  const selectedDuration = sentences.reduce((total, sentence) => {
    if (!selectedIds.has(sentence.id) || sentence.start === null || sentence.end === null) return total;
    return total + Math.max(0, sentence.end - sentence.start);
  }, 0);

  useEffect(() => {
    const nextSentences = buildTranscriptSentences(output, timedOutput);
    setSentences(nextSentences);
    setSelectedIds(new Set(nextSentences.map((sentence) => sentence.id)));
    setActiveSentenceId(null);
    setActionLabel('');
  }, [output, timedOutput]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    };
  }, []);

  function updateSentence(id: string, text: string) {
    setSentences((previous) => previous.map((sentence) => (sentence.id === id ? { ...sentence, text } : sentence)));
  }

  function toggleSentence(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function copyText(text: string) {
    const copied = await copyTextToClipboard(text);
    setActionLabel(sttText(locale, copied ? 'copied' : 'copyFailed'));
  }

  async function copyAll() {
    await copyText(sentences.map((sentence) => sentence.text.trim()).filter(Boolean).join('\n'));
  }

  async function copySelected() {
    const text = sentences.filter((sentence) => selectedIds.has(sentence.id)).map((sentence) => sentence.text.trim()).filter(Boolean).join('\n');
    await copyText(text || sentences.map((sentence) => sentence.text.trim()).join('\n'));
  }

  function exportTranscript() {
    const text = sentences.map((sentence) => {
      const time = sentence.start !== null && sentence.end !== null ? `${formatSeconds(sentence.start)}-${formatSeconds(sentence.end)} ` : '';
      return `${time}${sentence.text.trim()}`;
    }).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'transcript.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    setActionLabel(sttText(locale, 'exported'));
  }

  function resetEdits() {
    const nextSentences = buildTranscriptSentences(output, timedOutput);
    setSentences(nextSentences);
    setSelectedIds(new Set(nextSentences.map((sentence) => sentence.id)));
    setActiveSentenceId(null);
    setActionLabel(sttText(locale, 'reset'));
  }

  function splitSentence(id: string) {
    setSentences((previous) => {
      const index = previous.findIndex((sentence) => sentence.id === id);
      if (index < 0) return previous;
      const sentence = previous[index];
      const splitIndex = findSentenceSplitIndex(sentence.text);
      if (splitIndex <= 0 || splitIndex >= sentence.text.length) return previous;
      const firstText = sentence.text.slice(0, splitIndex).trim();
      const secondText = sentence.text.slice(splitIndex).trim();
      if (!firstText || !secondText) return previous;
      const middle = sentence.start !== null && sentence.end !== null ? sentence.start + (sentence.end - sentence.start) * (firstText.length / sentence.text.length) : null;
      const first = { ...sentence, text: firstText, originalText: firstText, end: middle };
      const second = { ...sentence, id: `${sentence.id}-split-${Date.now()}`, text: secondText, originalText: secondText, start: middle };
      const next = [...previous];
      next.splice(index, 1, first, second);
      setSelectedIds((selected) => new Set([...selected, second.id]));
      return next;
    });
  }

  function mergeNext(id: string) {
    setSentences((previous) => {
      const index = previous.findIndex((sentence) => sentence.id === id);
      if (index < 0 || index >= previous.length - 1) return previous;
      const current = previous[index];
      const nextSentence = previous[index + 1];
      const merged = {
        ...current,
        text: `${current.text.trim()}${needsJoinSpace(current.text, nextSentence.text) ? ' ' : ''}${nextSentence.text.trim()}`,
        originalText: `${current.originalText.trim()}${needsJoinSpace(current.originalText, nextSentence.originalText) ? ' ' : ''}${nextSentence.originalText.trim()}`,
        end: nextSentence.end ?? current.end,
        confidence: Math.min(current.confidence, nextSentence.confidence),
        timing: current.timing === 'none' || nextSentence.timing === 'none' ? 'none' : current.timing === 'weak' || nextSentence.timing === 'weak' ? 'weak' : 'approximate',
      } satisfies TranscriptSentence;
      const next = [...previous];
      next.splice(index, 2, merged);
      setSelectedIds((selected) => {
        const updated = new Set(selected);
        updated.delete(nextSentence.id);
        return updated;
      });
      return next;
    });
  }

  async function playSentence(sentence: TranscriptSentence) {
    if (!audioRef.current || !audioUrl) return;
    if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
    const start = sentence.start ?? 0;
    const end = sentence.end ?? null;
    audioRef.current.currentTime = Math.max(0, start);
    setActiveSentenceId(sentence.id);
    await audioRef.current.play();
    if (end !== null && end > start) {
      stopTimerRef.current = window.setTimeout(() => {
        audioRef.current?.pause();
        setActiveSentenceId(null);
      }, Math.max(200, (end - start) * 1000));
    }
  }

  return (
    <div className="stt-transcript">
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

      <div className="stt-transcript-toolbar">
        <div>
          <strong>{sttText(locale, 'sentenceTranscript')}</strong>
          <span>{showTimeline ? sttText(locale, 'approximateSentenceTiming') : sttText(locale, 'sentenceOnly')}</span>
        </div>
        <div className="stt-selection-summary">
          <span>{selectedCount}/{sentences.length}</span>
          <strong>{selectedDuration > 0 ? formatSeconds(selectedDuration) : sttText(locale, 'noTiming')}</strong>
        </div>
      </div>

      {showTimeline && (
        <div className="stt-wave-timeline" aria-label={sttText(locale, 'timedTranscript')}>
          <div className="stt-wave-bars" aria-hidden="true">
            {(waveformPeaks.length > 0 ? waveformPeaks : Array.from({ length: 72 }, (_, index) => waveformHeight(index) / 100)).map((peak, index) => (
              <span key={index} style={{ blockSize: `${Math.max(10, Math.round(peak * 100))}%` }} />
            ))}
          </div>
          <div className="stt-wave-regions">
            {sentences
              .filter((sentence) => sentence.start !== null && sentence.end !== null)
              .map((sentence) => (
                <button
                  key={sentence.id}
                  type="button"
                  className={sentence.id === activeSentenceId ? 'stt-wave-region stt-wave-region--active' : 'stt-wave-region'}
                  style={getWaveRegionStyle(sentence, sentences)}
                  onClick={() => void playSentence(sentence)}
                  title={`${formatTimestamp([sentence.start ?? 0, sentence.end ?? 0])} ${sentence.text}`}
                >
                  <span>{formatSeconds(sentence.start ?? 0)}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="stt-sentence-list">
        {sentences.map((sentence, index) => (
          <div key={sentence.id} className={sentence.id === activeSentenceId ? 'stt-sentence-row stt-sentence-row--active' : 'stt-sentence-row'}>
            <button type="button" className="stt-time-pill" onClick={() => void playSentence(sentence)} disabled={!audioUrl}>
              {sentence.start !== null && sentence.end !== null ? formatTimestamp([sentence.start, sentence.end]) : sttText(locale, 'noTiming')}
            </button>
            <textarea value={sentence.text} onChange={(event) => updateSentence(sentence.id, event.currentTarget.value)} aria-label={`${sttText(locale, 'sentence')} ${index + 1}`} rows={2} />
            <div className="stt-sentence-actions">
              <button type="button" title={sttText(locale, 'playSentence')} aria-label={sttText(locale, 'playSentence')} onClick={() => void playSentence(sentence)} disabled={!audioUrl}>
                <IconPlay />
              </button>
              <button type="button" title={sttText(locale, 'copySentence')} aria-label={sttText(locale, 'copySentence')} onClick={() => void copyText(sentence.text)}>
                <IconCopy />
              </button>
              <button type="button" title={sttText(locale, 'splitSentence')} aria-label={sttText(locale, 'splitSentence')} onClick={() => splitSentence(sentence.id)}>
                <IconSplit />
              </button>
              <button type="button" title={sttText(locale, 'mergeNext')} aria-label={sttText(locale, 'mergeNext')} onClick={() => mergeNext(sentence.id)} disabled={index >= sentences.length - 1}>
                <IconMerge />
              </button>
              <label className="stt-select-check" title={sttText(locale, 'selected')}>
                <input type="checkbox" checked={selectedIds.has(sentence.id)} onChange={() => toggleSentence(sentence.id)} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="stt-transcript-actions">
        <button type="button" onClick={() => void copyAll()}>{sttText(locale, 'copyAll')}</button>
        <button type="button" className="primary" onClick={() => void copySelected()}>{sttText(locale, 'copySelected')}</button>
        <button type="button" onClick={exportTranscript}>{sttText(locale, 'exportTranscript')}</button>
        <button type="button" onClick={resetEdits}>{sttText(locale, 'resetEdits')}</button>
        {actionLabel && <span>{actionLabel}</span>}
      </div>
    </div>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 9h10v10H9z" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function IconSplit() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v16" />
      <path d="M5 8h4" />
      <path d="M15 8h4" />
      <path d="M5 16h4" />
      <path d="M15 16h4" />
    </svg>
  );
}

function IconMerge() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h6l3 5-3 5H5" />
      <path d="M14 7h5" />
      <path d="M14 17h5" />
    </svg>
  );
}

function buildTranscriptSentences(output: TranscriptionOutput, timedOutput: TimedTranscriptOutput | null): TranscriptSentence[] {
  if (timedOutput?.words.length) {
    const timed = buildTimedTranscriptSentences(output.text, timedOutput.words);
    if (timed.length > 0) return timed;
  }

  return splitPlainSentences(output.text).map((text, index) => ({
    id: `plain-${index}`,
    text,
    originalText: text,
    start: null,
    end: null,
    confidence: 0,
    timing: 'none',
  }));
}

function buildTimedTranscriptSentences(text: string, words: TimedWord[]): TranscriptSentence[] {
  const moonPositions = getTextCharPositions(text);
  const moonChars = moonPositions.map((entry) => entry.char);
  const timedChars = getTimedChars(words);
  if (moonChars.length === 0 || timedChars.length === 0) return [];

  const alignment = alignChars(moonChars, timedChars);
  const punctuated = splitTextRanges(text, /[。！？!?]/u);
  if (punctuated.length > 1) {
    return punctuated.map((range, index) => makeSentenceFromMoonRange(`timed-${index}`, text, moonPositions, timedChars, alignment.map, range)).filter((sentence): sentence is TranscriptSentence => Boolean(sentence));
  }

  const groups = groupTimedChars(timedChars);
  const usedMoonIndexes = new Set<number>();
  const sentences: TranscriptSentence[] = [];
  groups.forEach((group, index) => {
    const moonIndexes: number[] = [];
    for (const [moonIndex, timedIndex] of alignment.map.entries()) {
      if (timedIndex >= group.first && timedIndex <= group.last && !usedMoonIndexes.has(moonIndex)) {
        moonIndexes.push(moonIndex);
      }
    }
    moonIndexes.sort((a, b) => a - b);
    if (moonIndexes.length === 0) return;
    moonIndexes.forEach((moonIndex) => usedMoonIndexes.add(moonIndex));
    const first = moonIndexes[0];
    const last = moonIndexes[moonIndexes.length - 1];
    const sourceStart = moonPositions[first].sourceIndex;
    const sourceEnd = moonPositions[last + 1]?.sourceIndex ?? text.length;
    const sentenceText = text.slice(sourceStart, sourceEnd).trim();
    if (!sentenceText) return;
    const confidence = moonIndexes.length / Math.max(1, normalizeTextChars(sentenceText).length);
    sentences.push({
      id: `timed-gap-${index}`,
      text: sentenceText,
      originalText: sentenceText,
      start: timedChars[group.first].start,
      end: timedChars[group.last].end,
      confidence,
      timing: confidence >= 0.72 ? 'approximate' : 'weak',
    });
  });

  return sentences;
}

function makeSentenceFromMoonRange(
  id: string,
  sourceText: string,
  moonPositions: Array<{ char: string; sourceIndex: number }>,
  timedChars: TimedChar[],
  alignment: Map<number, number>,
  range: { start: number; end: number; text: string },
): TranscriptSentence | null {
  const timedIndexes: number[] = [];
  for (let index = 0; index < moonPositions.length; index += 1) {
    const sourceIndex = moonPositions[index].sourceIndex;
    if (sourceIndex >= range.start && sourceIndex < range.end && alignment.has(index)) {
      timedIndexes.push(alignment.get(index)!);
    }
  }

  timedIndexes.sort((a, b) => a - b);
  const anchors = timedIndexes.map((index) => timedChars[index]).filter(Boolean);
  const sentenceText = sourceText.slice(range.start, range.end).trim();
  if (!sentenceText) return null;
  const confidence = anchors.length / Math.max(1, normalizeTextChars(sentenceText).length);
  return {
    id,
    text: sentenceText,
    originalText: sentenceText,
    start: anchors[0]?.start ?? null,
    end: anchors[anchors.length - 1]?.end ?? null,
    confidence,
    timing: anchors.length === 0 ? 'none' : confidence >= 0.78 ? 'approximate' : 'weak',
  };
}

function splitPlainSentences(text: string): string[] {
  const ranges = splitTextRanges(text, /[。！？!?]/u);
  if (ranges.length > 0) return ranges.map((range) => range.text);
  const trimmed = text.trim();
  return trimmed ? [trimmed] : [];
}

function splitTextRanges(text: string, boundary: RegExp): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (boundary.test(text[index])) {
      const segment = text.slice(start, index + 1).trim();
      if (segment) ranges.push({ start, end: index + 1, text: segment });
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) ranges.push({ start, end: text.length, text: tail });
  return ranges;
}

function getTextCharPositions(text: string): Array<{ char: string; sourceIndex: number }> {
  const positions: Array<{ char: string; sourceIndex: number }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = normalizeChar(text[index]);
    if (char) positions.push({ char, sourceIndex: index });
  }
  return positions;
}

function getTimedChars(words: TimedWord[]): TimedChar[] {
  const chars: TimedChar[] = [];
  words.forEach((word) => {
    const units = normalizeTextChars(word.word);
    if (units.length === 0) return;
    const duration = Math.max(0.01, word.end - word.start);
    units.forEach((char, index) => {
      chars.push({
        char,
        start: word.start + (duration * index) / units.length,
        end: word.start + (duration * (index + 1)) / units.length,
        conf: word.conf,
      });
    });
  });
  return chars;
}

function alignChars(source: string[], timed: TimedChar[]) {
  const rows = source.length + 1;
  const cols = timed.length + 1;
  const score = Array.from({ length: rows }, () => new Float32Array(cols));
  const back = Array.from({ length: rows }, () => new Int8Array(cols));
  const gap = -0.7;

  for (let row = 1; row < rows; row += 1) {
    score[row][0] = score[row - 1][0] + gap;
    back[row][0] = 1;
  }
  for (let col = 1; col < cols; col += 1) {
    score[0][col] = score[0][col - 1] + gap;
    back[0][col] = 2;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const diagonal = score[row - 1][col - 1] + (source[row - 1] === timed[col - 1].char ? 2 : -0.9);
      const up = score[row - 1][col] + gap;
      const left = score[row][col - 1] + gap;
      if (diagonal >= up && diagonal >= left) {
        score[row][col] = diagonal;
        back[row][col] = 0;
      } else if (up >= left) {
        score[row][col] = up;
        back[row][col] = 1;
      } else {
        score[row][col] = left;
        back[row][col] = 2;
      }
    }
  }

  const map = new Map<number, number>();
  let row = source.length;
  let col = timed.length;
  while (row > 0 || col > 0) {
    const move = back[row][col];
    if (row > 0 && col > 0 && move === 0) {
      if (source[row - 1] === timed[col - 1].char) map.set(row - 1, col - 1);
      row -= 1;
      col -= 1;
    } else if (row > 0 && (col === 0 || move === 1)) {
      row -= 1;
    } else {
      col -= 1;
    }
  }

  return { map };
}

function groupTimedChars(chars: TimedChar[]) {
  const groups: Array<{ first: number; last: number }> = [];
  if (chars.length === 0) return groups;
  let first = 0;
  for (let index = 1; index < chars.length; index += 1) {
    const gap = chars[index].start - chars[index - 1].end;
    const duration = chars[index - 1].end - chars[first].start;
    if (gap > 0.55 || duration > 13) {
      groups.push({ first, last: index - 1 });
      first = index;
    }
  }
  groups.push({ first, last: chars.length - 1 });
  return groups;
}

function normalizeTextChars(text: string): string[] {
  return Array.from(text).map(normalizeChar).filter((char): char is string => Boolean(char));
}

function normalizeChar(char: string): string | null {
  const normalized = char.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return null;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}a-z0-9]/u.test(normalized)) return normalized;
  return null;
}

function findSentenceSplitIndex(text: string): number {
  const candidates = ['。', '！', '？', '，', ',', ';', '；'];
  for (const candidate of candidates) {
    const index = text.indexOf(candidate);
    if (index > 0 && index < text.length - 1) return index + 1;
  }
  return Math.floor(text.length / 2);
}

function needsJoinSpace(left: string, right: string): boolean {
  return /[A-Za-z0-9]$/.test(left.trim()) && /^[A-Za-z0-9]/.test(right.trim());
}

function getWaveRegionStyle(sentence: TranscriptSentence, sentences: TranscriptSentence[]): { insetInlineStart: string; inlineSize: string } {
  const timed = sentences.filter((item) => item.start !== null && item.end !== null);
  const start = timed[0]?.start ?? 0;
  const end = timed[timed.length - 1]?.end ?? 1;
  const duration = Math.max(0.1, end - start);
  const left = (((sentence.start ?? start) - start) / duration) * 100;
  const width = (((sentence.end ?? start) - (sentence.start ?? start)) / duration) * 100;
  return {
    insetInlineStart: `${Math.max(0, Math.min(100, left))}%`,
    inlineSize: `${Math.max(2, Math.min(100, width))}%`,
  };
}

async function buildWaveformPeaks(file: File, bars = 96): Promise<number[]> {
  const AudioContextClass = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return [];
  const audioContext = new AudioContextClass();

  try {
    const audioBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    const data = audioBuffer.getChannelData(0);
    const blockSize = Math.max(1, Math.floor(data.length / bars));
    const peaks = Array.from({ length: bars }, (_, index) => {
      let peak = 0;
      const start = index * blockSize;
      const end = Math.min(data.length, start + blockSize);
      for (let cursor = start; cursor < end; cursor += 1) {
        peak = Math.max(peak, Math.abs(data[cursor]));
      }
      return Math.min(1, Math.max(0.08, peak));
    });
    const max = Math.max(0.1, ...peaks);
    return peaks.map((peak) => 0.12 + (peak / max) * 0.88);
  } catch {
    return [];
  } finally {
    await audioContext.close().catch(() => undefined);
  }
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

async function recognizeVoskBuffer(model: VoskModel, audioBuffer: AudioBuffer, modelName: string): Promise<TimedTranscriptOutput> {
  const recognizer = new model.KaldiRecognizer(audioBuffer.sampleRate);
  const words: TimedWord[] = [];
  const textParts: string[] = [];

  recognizer.setWords(true);

  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      let settleTimer: number | null = null;
      let fallbackTimer: number | null = window.setTimeout(() => {
        settle();
      }, 15000);

      recognizer.on('result', (message: VoskRecognizerMessage) => {
        if (settled) return;
        const result = message.result;
        if (result?.text) {
          textParts.push(result.text);
        }
        if (result?.result) {
          words.push(...result.result);
        }
        scheduleSettle();
      });

      recognizer.on('error', (message: VoskRecognizerMessage) => {
        if (settled) return;
        cleanup();
        reject(new Error(message.error ?? 'Vosk recognition failed.'));
      });

      recognizer.acceptWaveform(audioBuffer);
      recognizer.retrieveFinalResult();

      function scheduleSettle() {
        if (settleTimer !== null) window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
          settle();
        }, 120);
      }

      function settle() {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          text: textParts.join(' ').trim(),
          words,
          modelName,
        });
      }

      function cleanup() {
        if (settleTimer !== null) window.clearTimeout(settleTimer);
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
        settleTimer = null;
        fallbackTimer = null;
      }
    });
  } finally {
    recognizer.remove();
  }
}

async function fetchVoskModelBlobUrl(timelineModel: VoskTimelineModel, onProgress: (progress: number) => void): Promise<string> {
  const modelUrl = timelineModel.modelUrl;
  if (!modelUrl) {
    throw new Error('Vosk model URL is unavailable.');
  }

  const cachedBlob = await readCachedVoskModel(modelUrl);
  if (cachedBlob) {
    onProgress(100);
    return URL.createObjectURL(cachedBlob);
  }

  const response = await fetch(modelUrl);
  if (!response.ok) {
    throw new Error(`Unable to download Vosk model: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? 'application/gzip';
  const total = Number(response.headers.get('content-length') ?? 0);

  if (!response.body || total <= 0) {
    const downloadedBlob = await response.blob();
    const blob = await normalizeVoskModelArchive(downloadedBlob, timelineModel.archiveFormat);
    await cacheVoskModel(modelUrl, blob, 'application/gzip');
    onProgress(100);
    return URL.createObjectURL(blob);
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
      loaded += value.byteLength;
      onProgress(clampProgress((loaded / total) * 100));
    }
  } finally {
    reader.releaseLock();
  }

  const downloadedBlob = new Blob(chunks, { type: contentType });
  const blob = await normalizeVoskModelArchive(downloadedBlob, timelineModel.archiveFormat);
  await cacheVoskModel(modelUrl, blob, 'application/gzip');
  onProgress(100);
  return URL.createObjectURL(blob);
}

async function readCachedVoskModel(modelUrl: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  const cache = await window.caches.open(VOSK_CACHE_KEY);
  const response = await cache.match(modelUrl);
  return response ? await response.blob() : null;
}

async function cacheVoskModel(modelUrl: string, blob: Blob, contentType: string) {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  const cache = await window.caches.open(VOSK_CACHE_KEY);
  await cache.put(
    modelUrl,
    new Response(blob, {
      headers: {
        'content-type': contentType,
      },
    }),
  );
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

function getInitialSpeechLanguage(locale: Locale): SpeechLanguage {
  if (typeof window === 'undefined') return getDefaultSpeechLanguage(locale);

  try {
    return getStoredSpeechLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) ?? getDefaultSpeechLanguage(locale);
  } catch {
    return getDefaultSpeechLanguage(locale);
  }
}

function getStoredSpeechLanguage(value: string | null): SpeechLanguage | null {
  return speechModelOptions.find((option) => option.language === value)?.language ?? null;
}

function rememberSpeechLanguage(language: SpeechLanguage) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Ignore storage failures so private browsing or blocked storage does not break transcription.
  }
}

function getInitialTimelineEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(TIMELINE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberTimelineEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(TIMELINE_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage failures so private browsing or blocked storage does not break transcription.
  }
}

function getCacheLabel(locale: Locale, cacheState: CacheState, coverage: { downloadedFiles: number; totalFiles: number }): string {
  if (cacheState === 'checking') return '...';
  if (cacheState === 'downloaded') return sttText(locale, 'downloaded');
  if (cacheState === 'partial') return `${sttText(locale, 'partial')} ${coverage.downloadedFiles}/${coverage.totalFiles}`;
  if (cacheState === 'deleted') return sttText(locale, 'deleted');
  return sttText(locale, 'empty');
}

function getVoskStatusLabel(locale: Locale, enabled: boolean, available: boolean, state: VoskModelState, cacheState: CacheState, progress: number): string {
  if (!available) return sttText(locale, 'timelineUnavailable');
  if (!enabled) return sttText(locale, 'timelineOff');
  if (state === 'downloading') return `${Math.round(progress)}%`;
  if (state === 'loading') return sttText(locale, 'loading');
  if (state === 'ready') return sttText(locale, 'ready');
  if (state === 'error') return sttText(locale, 'failed');
  if (cacheState === 'downloaded') return sttText(locale, 'downloaded');
  if (cacheState === 'checking') return '...';
  if (cacheState === 'deleted') return sttText(locale, 'deleted');
  return sttText(locale, 'empty');
}

function getCombinedModelStatusLabel(
  locale: Locale,
  status: {
    moonshineState: ModelState;
    moonshineCacheState: CacheState;
    moonshineCacheLabel: string;
    timelineEnabled: boolean;
    timelineAvailable: boolean;
    voskState: VoskModelState;
    voskCacheState: CacheState;
  },
): string {
  const {
    moonshineState,
    moonshineCacheState,
    moonshineCacheLabel,
    timelineEnabled,
    timelineAvailable,
    voskState,
    voskCacheState,
  } = status;

  if (!timelineEnabled || !timelineAvailable) {
    if (moonshineState === 'loading') return sttText(locale, 'loading');
    if (moonshineState === 'error') return sttText(locale, 'failed');
    if (moonshineState === 'ready') return sttText(locale, 'ready');
    return moonshineCacheLabel;
  }

  if (moonshineState === 'loading' || voskState === 'downloading' || voskState === 'loading') return sttText(locale, 'loading');
  if (moonshineState === 'error' || voskState === 'error') return sttText(locale, 'failed');

  const moonshineReady = moonshineState === 'ready';
  const voskReady = voskState === 'ready';
  if (moonshineReady && voskReady) return sttText(locale, 'ready');
  if (moonshineCacheState === 'checking' || voskCacheState === 'checking') return '...';

  const moonshineDownloaded = moonshineReady || moonshineCacheState === 'downloaded';
  const voskDownloaded = voskReady || voskCacheState === 'downloaded';
  if (moonshineDownloaded && voskDownloaded) return sttText(locale, 'downloaded');
  if (moonshineDownloaded || voskDownloaded || moonshineCacheState === 'partial') return sttText(locale, 'partial');

  if (moonshineCacheState === 'deleted' || voskCacheState === 'deleted') return sttText(locale, 'deleted');
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
