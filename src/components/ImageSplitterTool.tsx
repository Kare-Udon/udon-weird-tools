import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Locale } from '@/i18n/config';
import { localize } from '@/i18n/utils';
import { decodeImageFile, type DecodedImage } from '@/lib/image-splitter/browser';
import {
  createSaveLock,
  detectSaveCapabilities,
  saveAllImages,
  saveOneImage,
  type SaveResult,
} from '@/lib/image-splitter/save';
import {
  IMAGE_SPLITTER_MIN_COUNT,
  getSplitAxisLength,
  run,
  type ImageSplitterOutput,
  type SplitDirection,
} from '@/tools/image-splitter/run';
import {
  createImageSplitterState,
  moveImageSplitterCut,
  resetImageSplitterState,
  setImageSplitterCount,
  setImageSplitterDirection,
  setImageSplitterMode,
  setImageSplitterSource,
  setImageSplitterSymmetric,
  toImageSplitterInput,
  type ImageSplitterState,
} from '@/tools/image-splitter/state';
import {
  getImageSplitterErrorText,
  imageSplitterUi,
  type ImageSplitterUiKey,
} from '@/tools/image-splitter/ui';
import { prepareImageSplitterArtifacts } from './image-splitter/prepare';
import { getSaveRailLayout, type SaveRailLayout } from './image-splitter/save-rail';
import {
  getCutKeyboardTarget,
  getCutPointerRatio,
  getNearestCutIndex,
  getSlicedPreviewPointerRatio,
  hasCutDragCrossedThreshold,
  type CutPointerPosition,
} from './image-splitter/cut-input';
import './ImageSplitterTool.css';

type ImageSplitterToolProps = {
  locale: Locale;
};

type CountChoice = 'three' | 'four' | 'custom';
type ProcessKind = 'decoding' | 'preparing' | 'saving';
type Copy = (key: ImageSplitterUiKey, values?: Record<string, string | number>) => string;
type CutDragSource = 'preview' | 'slider';
type CutDrag = {
  index: number;
  pointerId: number;
  element: HTMLElement;
  source: CutDragSource;
  startPointer: CutPointerPosition;
  started: boolean;
  panelHeight: number;
};

const IMAGE_ACCEPT = 'image/*,.avif';
const PREPARE_DELAY_MS = 160;
const CUT_DRAG_THRESHOLD_PX = 4;
const PREVIEW_GAP_PX = 6;

export default function ImageSplitterTool({ locale }: ImageSplitterToolProps) {
  const [splitState, setSplitState] = useState<ImageSplitterState>(() => createImageSplitterState());
  const splitStateRef = useRef(splitState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decodedImage, setDecodedImage] = useState<DecodedImage | null>(null);
  const decodedImageRef = useRef<DecodedImage | null>(null);
  const [countChoice, setCountChoice] = useState<CountChoice>('three');
  const [countDraft, setCountDraft] = useState('3');
  const [mobilePreferred, setMobilePreferred] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [interactionStatus, setInteractionStatus] = useState<string | null>(null);
  const [activeCutIndex, setActiveCutIndex] = useState<number | null>(null);
  const [draggingCut, setDraggingCut] = useState<number | null>(null);
  const draggingCutRef = useRef<CutDrag | null>(null);
  const [preparedFiles, setPreparedFiles] = useState<File[] | null>(null);
  const [preparedZip, setPreparedZip] = useState<File | null>(null);
  const [preparedKey, setPreparedKey] = useState('');
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [mobileCanShare, setMobileCanShare] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const previewListRef = useRef<HTMLDivElement | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const countInputRef = useRef<HTMLInputElement | null>(null);
  const decodeControllerRef = useRef<AbortController | null>(null);
  const prepareControllerRef = useRef<AbortController | null>(null);
  const decodeRunIdRef = useRef(0);
  const prepareRunIdRef = useRef(0);
  const mobileShareKeyRef = useRef('');
  const saveLockRef = useRef(createSaveLock());

  const copy: Copy = (key, values) => interpolate(localize(imageSplitterUi[key], locale), values);

  const axisLength = useMemo(() => {
    if (!splitState.source) return null;
    return getSplitAxisLength(splitState.source.width, splitState.source.height, splitState.direction);
  }, [splitState.direction, splitState.source]);

  const geometry = useMemo<ImageSplitterOutput | null>(() => {
    const input = toImageSplitterInput(splitState);
    if (!input) return null;

    try {
      return run(input);
    } catch {
      return null;
    }
  }, [splitState]);

  const geometryKey = useMemo(() => {
    if (!geometry || !splitState.source) return '';
    return [
      splitState.source.key,
      geometry.width,
      geometry.height,
      geometry.direction,
      geometry.count,
      geometry.mode,
      geometry.cuts.join(','),
    ].join('|');
  }, [geometry, splitState.source]);

  const interactionKey = useMemo(() => {
    if (!geometry || !splitState.source) return '';
    return [
      splitState.source.key,
      geometry.width,
      geometry.height,
      geometry.direction,
      geometry.count,
      geometry.mode,
    ].join('|');
  }, [geometry, splitState.source]);

  const hasPreparedFiles = Boolean(
    geometry &&
      preparedFiles &&
      preparedKey === geometryKey &&
      preparedFiles.length === geometry.slices.length,
  );
  const canSave = Boolean(
    splitState.status === 'ready' &&
      geometry &&
      hasPreparedFiles &&
      !decoding &&
      draggingCut === null &&
      !preparing &&
      !saving,
  );
  const maxCount = axisLength === null ? 32 : Math.min(32, axisLength);
  const countControlsDisabled = saving || splitState.status === 'axis-too-short';
  const customCountActive = countChoice === 'custom' || (splitState.count !== 3 && splitState.count !== 4);
  const globalErrorCode = errorCode ?? (splitState.status === 'axis-too-short' ? 'axis-too-short' : null);
  const showZipFallback = Boolean(
    preparedZip &&
      (mobileCanShare === false ||
        errorCode === 'batch-share-unavailable' ||
        saveResult?.status === 'failed' ||
        saveResult?.status === 'partial'),
  );

  useEffect(() => {
    const updatePreference = () => setMobilePreferred(isMobilePreference());
    const viewportQuery = window.matchMedia('(max-width: 767px)');
    const pointerQuery = window.matchMedia('(pointer: coarse)');

    updatePreference();
    viewportQuery.addEventListener('change', updatePreference);
    pointerQuery.addEventListener('change', updatePreference);
    window.addEventListener('resize', updatePreference);

    return () => {
      viewportQuery.removeEventListener('change', updatePreference);
      pointerQuery.removeEventListener('change', updatePreference);
      window.removeEventListener('resize', updatePreference);
    };
  }, []);

  useEffect(() => {
    if (!mobilePreferred || !hasPreparedFiles || !preparedFiles || !geometryKey) {
      mobileShareKeyRef.current = '';
      setMobileCanShare(null);
      return;
    }
    if (mobileShareKeyRef.current === geometryKey) return;

    let canShare = false;
    try {
      canShare = Boolean(detectSaveCapabilities(preparedFiles, { zip: preparedZip ?? undefined }).canShareFiles);
    } catch {
      canShare = false;
    }
    mobileShareKeyRef.current = geometryKey;
    setMobileCanShare(canShare);
  }, [geometryKey, hasPreparedFiles, mobilePreferred, preparedFiles, preparedZip]);

  useEffect(() => {
    const currentTaskId = prepareRunIdRef.current + 1;
    prepareRunIdRef.current = currentTaskId;
    prepareControllerRef.current?.abort();
    prepareControllerRef.current = null;

    if (
      !decodedImage ||
      !selectedFile ||
      !geometry ||
      splitState.status !== 'ready' ||
      draggingCut !== null
    ) {
      setPreparing(false);
      return;
    }

    if (preparedKey === geometryKey && preparedFiles && preparedFiles.length === geometry.slices.length) {
      setPreparing(false);
      return;
    }

    const controller = new AbortController();
    prepareControllerRef.current = controller;
    setPreparing(true);
    setErrorCode(null);

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const preparation = await prepareImageSplitterArtifacts({
            decoded: decodedImage,
            slices: geometry.slices,
            sourceName: selectedFile.name,
            signal: controller.signal,
            isCurrent: () => prepareRunIdRef.current === currentTaskId,
            onFilesReady: (files) => {
              if (prepareRunIdRef.current !== currentTaskId) return;
              setPreparedFiles(files);
              setPreparedKey(geometryKey);
              setPreparedZip(null);
            },
          });

          if (prepareRunIdRef.current !== currentTaskId) return;
          setPreparedZip(preparation.zip);
          if (preparation.zipError) {
            setErrorCode(readErrorCode(preparation.zipError) ?? 'zip-encode-failed');
          }
        } catch (prepareError) {
          if (prepareRunIdRef.current !== currentTaskId) return;
          setPreparedFiles(null);
          setPreparedZip(null);
          setPreparedKey('');
          setErrorCode(readErrorCode(prepareError) ?? 'encode-failed');
        } finally {
          if (prepareRunIdRef.current === currentTaskId) {
            prepareControllerRef.current = null;
            setPreparing(false);
          }
        }
      })();
    }, PREPARE_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [decodedImage, draggingCut, geometry, geometryKey, selectedFile, splitState.status]);

  useEffect(() => {
    return () => {
      decodeRunIdRef.current += 1;
      prepareRunIdRef.current += 1;
      decodeControllerRef.current?.abort();
      prepareControllerRef.current?.abort();
      cancelCutDrag(false);
      decodedImageRef.current?.release();
      decodedImageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleWindowBlur = () => cancelCutDrag();
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, []);

  useEffect(() => {
    if (
      (countChoice === 'three' && splitState.count !== 3) ||
      (countChoice === 'four' && splitState.count !== 4)
    ) {
      setCountChoice('custom');
    }
    if (document.activeElement !== countInputRef.current) {
      setCountDraft(String(splitState.count));
    }
  }, [countChoice, splitState.count]);

  function invalidatePrepared() {
    prepareControllerRef.current?.abort();
    prepareControllerRef.current = null;
    setPreparedFiles(null);
    setPreparedZip(null);
    setPreparedKey('');
    setSaveResult(null);
    setMobileCanShare(null);
    mobileShareKeyRef.current = '';
  }

  function cancelCutDrag(updateState = true) {
    const drag = draggingCutRef.current;
    if (drag?.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
    draggingCutRef.current = null;
    if (updateState) setDraggingCut(null);
  }

  function applySplitState(nextState: ImageSplitterState) {
    if (nextState === splitStateRef.current) return;
    cancelCutDrag();
    invalidatePrepared();
    setErrorCode(null);
    setInteractionStatus(null);
    splitStateRef.current = nextState;
    setSplitState(nextState);
  }

  async function handleSelectedFile(file: File) {
    const runId = decodeRunIdRef.current + 1;
    decodeRunIdRef.current = runId;
    decodeControllerRef.current?.abort();
    prepareControllerRef.current?.abort();
    cancelCutDrag();
    invalidatePrepared();
    decodedImageRef.current?.release();
    decodedImageRef.current = null;
    setDecodedImage(null);
    setSelectedFile(file);
    setErrorCode(null);
    setInteractionStatus(null);
    setDecoding(true);

    const controller = new AbortController();
    decodeControllerRef.current = controller;
    let nextDecoded: DecodedImage | null = null;

    try {
      nextDecoded = await decodeImageFile(file, {
        signal: controller.signal,
        isCurrent: () => decodeRunIdRef.current === runId,
      });

      if (decodeRunIdRef.current !== runId) {
        nextDecoded.release();
        return;
      }

      const nextState = setImageSplitterSource(splitStateRef.current, {
        key: createFileKey(file),
        width: nextDecoded.width,
        height: nextDecoded.height,
      });
      splitStateRef.current = nextState;
      setSplitState(nextState);
      decodedImageRef.current = nextDecoded;
      setDecodedImage(nextDecoded);
      nextDecoded = null;
    } catch (decodeError) {
      nextDecoded?.release();
      if (decodeRunIdRef.current !== runId) return;

      const clearedState = setImageSplitterSource(splitStateRef.current, null);
      splitStateRef.current = clearedState;
      setSplitState(clearedState);
      setErrorCode(readErrorCode(decodeError) ?? 'decode-failed');
    } finally {
      if (decodeRunIdRef.current === runId) {
        decodeControllerRef.current = null;
        setDecoding(false);
      }
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (file) void handleSelectedFile(file);
  }

  function handleUploadClick() {
    if (saving) return;
    fileInputRef.current?.click();
  }

  function handleDirectionChange(direction: SplitDirection) {
    applySplitState(setImageSplitterDirection(splitStateRef.current, direction));
  }

  function handleModeChange(mode: 'equal' | 'free') {
    applySplitState(setImageSplitterMode(splitStateRef.current, mode));
  }

  function handleCountPreset(value: 3 | 4) {
    if (countControlsDisabled || (axisLength !== null && axisLength < value)) return;
    const nextState = setImageSplitterCount(splitStateRef.current, value);
    setCountChoice(nextState.count === value ? (value === 3 ? 'three' : 'four') : 'custom');
    setCountDraft(String(nextState.count));
    applySplitState(nextState);
  }

  function handleCustomCountChoice() {
    if (countControlsDisabled) return;
    setCountChoice('custom');
    setCountDraft(String(splitStateRef.current.count));
  }

  function commitCountDraft(rawValue: string) {
    const normalized = rawValue.trim();
    if (!normalized || !/^[0-9]+$/.test(normalized)) {
      setCountDraft(String(splitStateRef.current.count));
      return;
    }

    const candidate = Number(normalized);
    if (!Number.isInteger(candidate) || candidate < IMAGE_SPLITTER_MIN_COUNT || candidate > maxCount) {
      setCountDraft(String(splitStateRef.current.count));
      return;
    }

    const nextState = setImageSplitterCount(splitStateRef.current, candidate);
    setCountChoice('custom');
    setCountDraft(String(nextState.count));
    applySplitState(nextState);
  }

  function stepCount(delta: -1 | 1) {
    if (countControlsDisabled) return;
    const nextState = setImageSplitterCount(splitStateRef.current, splitStateRef.current.count + delta);
    setCountChoice('custom');
    setCountDraft(String(nextState.count));
    applySplitState(nextState);
  }

  function handleCountInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  function applyCutTarget(index: number, target: number) {
    if (saving) return;
    const result = moveImageSplitterCut(splitStateRef.current, index, target);
    if (result.status === 'symmetric-no-solution') {
      setInteractionStatus('symmetric-no-solution');
      return;
    }
    if (!result.changed) return;

    invalidatePrepared();
    setErrorCode(null);
    setSaveResult(null);
    setInteractionStatus(null);
    splitStateRef.current = result.state;
    setSplitState(result.state);
  }

  function getPreviewPointerTarget(event: ReactPointerEvent<HTMLElement>, index: number): number | null {
    const preview = previewListRef.current;
    const currentState = splitStateRef.current;
    const currentAxisLength = currentState.source
      ? getSplitAxisLength(currentState.source.width, currentState.source.height, currentState.direction)
      : 0;
    if (!preview || currentAxisLength < 2) return null;

    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ratio = getSlicedPreviewPointerRatio(
      currentState.direction,
      rect,
      event,
      index,
      currentState.cuts.length,
      PREVIEW_GAP_PX,
    );
    return ratio === null ? null : Math.round(ratio * currentAxisLength);
  }

  function getSliderPointerTarget(event: ReactPointerEvent<HTMLElement>): number | null {
    const track = sliderTrackRef.current;
    const currentState = splitStateRef.current;
    const currentAxisLength = currentState.source
      ? getSplitAxisLength(currentState.source.width, currentState.source.height, currentState.direction)
      : 0;
    if (!track || currentAxisLength < 2) return null;

    const rect = track.getBoundingClientRect();
    const ratio = getCutPointerRatio(currentState.direction, rect, event);
    return ratio === null ? null : Math.round(ratio * currentAxisLength);
  }

  function getSliderIndexAtPointer(event: ReactPointerEvent<HTMLDivElement>): number | null {
    const track = sliderTrackRef.current;
    const currentState = splitStateRef.current;
    const currentAxisLength = currentState.source
      ? getSplitAxisLength(currentState.source.width, currentState.source.height, currentState.direction)
      : 0;
    if (!track || currentAxisLength < 2 || currentState.cuts.length === 0) return null;

    const rect = track.getBoundingClientRect();
    const ratio = getCutPointerRatio(currentState.direction, rect, event);
    if (ratio === null) return null;
    const pointerValue = ratio * currentAxisLength;
    return getNearestCutIndex(currentState.cuts, pointerValue);
  }

  function beginCutDrag(
    event: ReactPointerEvent<HTMLElement>,
    index: number,
    source: CutDragSource,
    jumpOnPointerDown: boolean,
  ) {
    if (saving || splitStateRef.current.mode !== 'free') return;
    const pointerTarget = source === 'preview'
      ? getPreviewPointerTarget(event, index)
      : getSliderPointerTarget(event);
    if (pointerTarget === null || !Number.isInteger(splitStateRef.current.cuts[index])) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveCutIndex(index);
    draggingCutRef.current = {
      index,
      pointerId: event.pointerId,
      element: event.currentTarget,
      source,
      startPointer: { clientX: event.clientX, clientY: event.clientY },
      started: jumpOnPointerDown,
      // 状态行和保存回退会在失效时消失；保留高度，避免页面底部滚动被钳制。
      panelHeight: panelRef.current?.getBoundingClientRect().height ?? 0,
    };
    setDraggingCut(index);
    invalidatePrepared();
    if (jumpOnPointerDown) applyCutTarget(index, pointerTarget);
  }

  function handleCutPointerDown(event: ReactPointerEvent<HTMLElement>, index: number) {
    if (previewListRef.current) {
      index = getOverlappingCutControlIndex(
        previewListRef.current, '.image-splitter-preview-cut-handle', event, index,
      );
    }
    beginCutDrag(event, index, 'preview', false);
  }

  function getOverlappingCutControlIndex(
    container: HTMLElement,
    selector: string,
    event: ReactPointerEvent<HTMLElement>,
    fallbackIndex: number,
  ): number {
    const hits = Array.from(container.querySelectorAll<HTMLElement>(selector))
      .map((control, index) => ({ index, rect: control.getBoundingClientRect() }))
      .filter(({ rect }) => event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom);
    if (hits.length < 2) return fallbackIndex;
    const vertical = splitStateRef.current.direction === 'vertical';
    const nearest = getNearestCutIndex(
      hits.map(({ rect }) => vertical ? rect.left + rect.width / 2 : rect.top + rect.height / 2),
      vertical ? event.clientX : event.clientY,
    );
    return nearest === null ? fallbackIndex : hits[nearest].index;
  }

  function handleSliderPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (saving || splitStateRef.current.mode !== 'free') return;
    const target = event.target;
    const candidateThumb = target instanceof HTMLElement
      ? target.closest<HTMLButtonElement>('[data-slider-index]')
      : null;
    const thumb = candidateThumb?.parentElement === event.currentTarget ? candidateThumb : null;
    // 窄屏或近邻切线处命中区会重叠，滑块与片缝统一按实际中心选取。
    const index = thumb
      ? getOverlappingCutControlIndex(event.currentTarget, '[data-slider-index]', event, Number(thumb.dataset.sliderIndex))
      : getSliderIndexAtPointer(event);
    if (index !== null) {
      beginCutDrag(event, index, 'slider', !thumb);
      event.stopPropagation();
    }
  }

  function handleCutPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (saving) return;
    const drag = draggingCutRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.started) {
      const currentPointer = { clientX: event.clientX, clientY: event.clientY };
      if (!hasCutDragCrossedThreshold(
        splitStateRef.current.direction,
        drag.startPointer,
        currentPointer,
        CUT_DRAG_THRESHOLD_PX,
      )) return;
      drag.started = true;
    }
    const pointerTarget = drag.source === 'preview'
      ? getPreviewPointerTarget(event, drag.index)
      : getSliderPointerTarget(event);
    if (pointerTarget !== null) applyCutTarget(drag.index, pointerTarget);
  }

  function finishCutPointer(event: ReactPointerEvent<HTMLElement>) {
    const drag = draggingCutRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    cancelCutDrag();
  }

  function handleSliderBlur() {
    if (draggingCutRef.current?.source === 'slider') cancelCutDrag();
  }

  function handleSliderKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (saving) return;
    const currentState = splitStateRef.current;
    const current = currentState.cuts[index];
    const currentAxisLength = currentState.source
      ? getSplitAxisLength(currentState.source.width, currentState.source.height, currentState.direction)
      : 0;
    const target = getCutKeyboardTarget(currentState.direction, event.key, current, currentAxisLength);
    if (target === null) return;

    event.preventDefault();
    setActiveCutIndex(index);
    applyCutTarget(index, target);
  }

  function resetTool() {
    if (saving) return;
    cancelCutDrag();
    decodeRunIdRef.current += 1;
    prepareRunIdRef.current += 1;
    decodeControllerRef.current?.abort();
    prepareControllerRef.current?.abort();
    decodeControllerRef.current = null;
    prepareControllerRef.current = null;
    decodedImageRef.current?.release();
    decodedImageRef.current = null;
    invalidatePrepared();
    const nextState = resetImageSplitterState();
    splitStateRef.current = nextState;
    setSplitState(nextState);
    setSelectedFile(null);
    setDecodedImage(null);
    setCountChoice('three');
    setCountDraft('3');
    setDecoding(false);
    setPreparing(false);
    setErrorCode(null);
    setInteractionStatus(null);
    setActiveCutIndex(null);
    setDraggingCut(null);
    setSaveResult(null);
  }

  async function saveSlice(index: number) {
    if (!canSave || !preparedFiles || saving) return;
    const file = preparedFiles[index];
    if (!file) return;

    setSaving(true);
    setErrorCode(null);
    setSaveResult(null);
    try {
      const result = await saveOneImage(file, {
        preference: mobilePreferred ? 'mobile' : 'desktop',
        lock: saveLockRef.current,
      });
      setSaveResult(result);
    } catch (saveError) {
      setErrorCode(readErrorCode(saveError) ?? 'file-write-failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveAll(action: 'auto' | 'zip' = 'auto') {
    if (!canSave || !preparedFiles || saving) return;
    if (action === 'zip' && !preparedZip) {
      setErrorCode('zip-not-prepared');
      return;
    }
    if (action === 'auto' && mobilePreferred && mobileCanShare === false) {
      setErrorCode('batch-share-unavailable');
      return;
    }

    setSaving(true);
    setErrorCode(null);
    setSaveResult(null);
    try {
      const result = action === 'zip'
        ? await saveAllImages(preparedFiles, {
            action: 'zip',
            zip: preparedZip ?? undefined,
            preference: mobilePreferred ? 'mobile' : 'desktop',
            lock: saveLockRef.current,
          })
        : await saveAllImages(preparedFiles, {
            preference: mobilePreferred ? 'mobile' : 'desktop',
            zip: preparedZip ?? undefined,
            lock: saveLockRef.current,
          });
      setSaveResult(result);
    } catch (saveError) {
      setErrorCode(readErrorCode(saveError) ?? 'download-failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="image-splitter-tool">
      <section
        ref={panelRef}
        className="panel image-splitter-panel"
        style={{ minHeight: draggingCut === null ? undefined : draggingCutRef.current?.panelHeight }}
      >
        <div className="image-splitter-upload">
          <span className="image-splitter-field-label">{copy('uploadLabel')}</span>
          <div className="image-splitter-upload-row">
            <button
              type="button"
              className="primary image-splitter-upload-button"
              onClick={handleUploadClick}
              disabled={saving}
            >
              {selectedFile ? copy('replaceImage') : copy('chooseImage')}
            </button>

            {selectedFile && (
              <button
                type="button"
                className="image-splitter-reset-button"
                onClick={resetTool}
                disabled={saving}
              >
                {copy('reset')}
              </button>
            )}
          </div>

          {decodedImage && (
            <div className="image-splitter-selected-preview">
              <img
                className="image-splitter-file-thumbnail"
                src={decodedImage.previewUrl}
                alt={copy('selectedImageAlt')}
              />
            </div>
          )}

          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept={IMAGE_ACCEPT}
            aria-hidden="true"
            tabIndex={-1}
            disabled={saving}
            onChange={handleFileInputChange}
          />
        </div>

        <div className="image-splitter-settings">
          <SettingGroup label={copy('directionLabel')}>
            <div className="image-splitter-option-grid image-splitter-option-grid--two" role="group" aria-label={copy('directionLabel')}>
              <OptionButton
                active={splitState.direction === 'vertical'}
                disabled={saving}
                onClick={() => handleDirectionChange('vertical')}
              >
                <DirectionGlyph direction="vertical" />
                {copy('vertical')}
              </OptionButton>
              <OptionButton
                active={splitState.direction === 'horizontal'}
                disabled={saving}
                onClick={() => handleDirectionChange('horizontal')}
              >
                <DirectionGlyph direction="horizontal" />
                {copy('horizontal')}
              </OptionButton>
            </div>
          </SettingGroup>

          <SettingGroup label={copy('countLabel')}>
            <div className="image-splitter-count-row" role="group" aria-label={copy('countLabel')}>
              <OptionButton
                active={countChoice === 'three' && splitState.count === 3}
                disabled={countControlsDisabled || (axisLength !== null && axisLength < 3)}
                onClick={() => handleCountPreset(3)}
              >
                {copy('countThree')}
              </OptionButton>
              <OptionButton
                active={countChoice === 'four' && splitState.count === 4}
                disabled={countControlsDisabled || (axisLength !== null && axisLength < 4)}
                onClick={() => handleCountPreset(4)}
              >
                {copy('countFour')}
              </OptionButton>
              {customCountActive ? (
                <div className="image-splitter-stepper" role="group" aria-label={copy('countInputLabel')}>
                  <button
                    type="button"
                    aria-label={copy('decreaseCount')}
                    onClick={() => stepCount(-1)}
                    disabled={countControlsDisabled || splitState.count <= 2}
                  >
                    −
                  </button>
                  <input
                    ref={countInputRef}
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={maxCount}
                    step={1}
                    aria-label={copy('countInputLabel')}
                    value={countDraft}
                    disabled={countControlsDisabled}
                    onChange={(event) => setCountDraft(event.currentTarget.value)}
                    onBlur={(event) => commitCountDraft(event.currentTarget.value)}
                    onKeyDown={handleCountInputKeyDown}
                  />
                  <button
                    type="button"
                    aria-label={copy('increaseCount')}
                    onClick={() => stepCount(1)}
                    disabled={countControlsDisabled || splitState.count >= maxCount}
                  >
                    +
                  </button>
                </div>
              ) : (
                <OptionButton
                  active={false}
                  disabled={countControlsDisabled}
                  onClick={handleCustomCountChoice}
                >
                  {copy('customCount')}
                </OptionButton>
              )}
            </div>
          </SettingGroup>

          <SettingGroup label={copy('ratioLabel')} wide>
            <div className="image-splitter-option-grid image-splitter-option-grid--two" role="group" aria-label={copy('ratioLabel')}>
              <OptionButton
                active={splitState.mode === 'equal'}
                disabled={saving}
                onClick={() => handleModeChange('equal')}
              >
                {copy('equal')}
              </OptionButton>
              <OptionButton
                active={splitState.mode === 'free'}
                disabled={saving}
                onClick={() => handleModeChange('free')}
              >
                {copy('free')}
              </OptionButton>
            </div>
          </SettingGroup>
        </div>

        {decodedImage && splitState.source && splitState.status === 'axis-too-short' && (
          <SourceImageState copy={copy} previewUrl={decodedImage.previewUrl} source={splitState.source} />
        )}

        {decodedImage && geometry && splitState.status === 'ready' && splitState.source && selectedFile && (
          <SplitPreview
            key={interactionKey}
            copy={copy}
            geometry={geometry}
            previewUrl={decodedImage.previewUrl}
            source={splitState.source}
            adjustable={splitState.mode === 'free'}
            cuts={splitState.cuts}
            symmetric={splitState.symmetric}
            activeCutIndex={activeCutIndex}
            previewListRef={previewListRef}
            sliderTrackRef={sliderTrackRef}
            onSymmetricChange={(value) => applySplitState(setImageSplitterSymmetric(splitStateRef.current, value))}
            onPointerDown={handleCutPointerDown}
            onPointerMove={handleCutPointerMove}
            onPointerUp={finishCutPointer}
            onPointerCancel={finishCutPointer}
            onSliderPointerDown={handleSliderPointerDown}
            onSliderFocus={setActiveCutIndex}
            onSliderBlur={handleSliderBlur}
            onSliderKeyDown={handleSliderKeyDown}
            onSave={(index) => void saveSlice(index)}
            disabled={!canSave || saving}
            adjustmentDisabled={saving}
          />
        )}

        {(decoding || preparing || saving) && (
          <div className="image-splitter-status" role="status" aria-live="polite">
            {copy((saving ? 'saving' : preparing ? 'preparing' : 'decoding') as ProcessKind)}
          </div>
        )}

        {globalErrorCode && (
          <div className="image-splitter-error" role="alert">
            <strong>{copy('errorTitle')}</strong>
            <span>{localizeImageSplitterError(globalErrorCode, locale)}</span>
          </div>
        )}

        {interactionStatus === 'symmetric-no-solution' && (
          <div className="image-splitter-inline-status" role="status" aria-live="polite">
            {copy('symmetricNoSolution')}
          </div>
        )}

        {saveResult && <SaveResultMessage copy={copy} locale={locale} result={saveResult} />}

        {showZipFallback && (
          <div className="image-splitter-zip-fallback">
            <button type="button" onClick={() => void saveAll('zip')} disabled={!canSave || saving}>
              {copy('saveZip')}
            </button>
          </div>
        )}

        <div className="image-splitter-save-bar">
          <button
            type="button"
            className="primary image-splitter-save-all"
            onClick={() => void saveAll()}
            disabled={!canSave}
          >
            {saving ? copy('saving') : copy('saveAll', { count: geometry?.count ?? splitState.count })}
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingGroup({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'image-splitter-setting-group image-splitter-setting-group--wide' : 'image-splitter-setting-group'}>
      <span className="image-splitter-field-label">{label}</span>
      {children}
    </div>
  );
}

function OptionButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? 'image-splitter-option image-splitter-option--active' : 'image-splitter-option'}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function DirectionGlyph({ direction }: { direction: SplitDirection }) {
  if (direction === 'vertical') {
    return (
      <svg className="image-splitter-direction-glyph" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6 3v14M14 3v14M9 6h2M9 10h2M9 14h2" />
      </svg>
    );
  }

  return (
    <svg className="image-splitter-direction-glyph" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 6h14M3 14h14M6 9v2M10 9v2M14 9v2" />
    </svg>
  );
}

function SourceImageState({
  copy,
  previewUrl,
  source,
}: {
  copy: Copy;
  previewUrl: string;
  source: { width: number; height: number };
}) {
  return (
    <section className="image-splitter-editor" aria-labelledby="image-splitter-source-title">
      <div className="image-splitter-editor-heading">
        <h2 id="image-splitter-source-title">{copy('preview')}</h2>
      </div>
      <div
        className="image-splitter-editor-content image-splitter-editor-content--static"
        style={{ '--image-splitter-source-ratio': String(source.width / source.height) } as CSSProperties}
      >
        <div className="image-splitter-editor-media">
          <div className="image-splitter-editor-image-frame">
            <img className="image-splitter-editor-image" src={previewUrl} alt="" draggable={false} />
          </div>
        </div>
      </div>
    </section>
  );
}

function FreeCutEditor({
  copy,
  direction,
  source,
  cuts,
  disabled,
  activeCutIndex,
  sliderTrackRef,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSliderPointerDown,
  onSliderFocus,
  onSliderBlur,
  onSliderKeyDown,
}: {
  copy: Copy;
  direction: SplitDirection;
  source: { width: number; height: number };
  cuts: number[];
  disabled: boolean;
  activeCutIndex: number | null;
  sliderTrackRef: RefObject<HTMLDivElement | null>;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onSliderPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSliderFocus: (index: number) => void;
  onSliderBlur: () => void;
  onSliderKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
}) {
  const axisLength = direction === 'vertical' ? source.width : source.height;
  const sliderOrientation = direction === 'horizontal' ? 'vertical' : 'horizontal';

  return (
    <div
      ref={sliderTrackRef}
      className={`image-splitter-slider-track image-splitter-slider-track--${sliderOrientation}`}
      role="group"
      aria-label={copy('adjustCuts')}
      onPointerDownCapture={onSliderPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerUp}
    >
      <span className="image-splitter-slider-rail" aria-hidden="true" />
      {cuts.map((cut, index) => {
        const position = `${(cut / axisLength) * 100}%`;
        const positionStyle = sliderOrientation === 'vertical' ? { top: position } : { left: position };
        const legalMin = index === 0 ? 1 : cuts[index - 1] + 1;
        const legalMax = index === cuts.length - 1 ? axisLength - 1 : cuts[index + 1] - 1;
        return (
          <button
            key={`slider-${index}`}
            className={activeCutIndex === index ? 'image-splitter-slider-thumb image-splitter-slider-thumb--active' : 'image-splitter-slider-thumb'}
            type="button"
            role="slider"
            aria-label={copy('sliderLabel', { index: index + 1, count: cuts.length })}
            aria-orientation={sliderOrientation}
            aria-valuemin={legalMin}
            aria-valuemax={legalMax}
            aria-valuenow={cut}
            aria-valuetext={copy('sliderValue', { value: cut })}
            data-slider-index={index}
            disabled={disabled}
            onFocus={() => onSliderFocus(index)}
            onBlur={onSliderBlur}
            onKeyDown={(event) => onSliderKeyDown(event, index)}
            style={{ ...positionStyle, zIndex: activeCutIndex === index ? cuts.length + 2 : index + 1 }}
          >
            <span aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function SplitPreview({
  copy,
  geometry,
  previewUrl,
  source,
  adjustable,
  cuts,
  symmetric,
  activeCutIndex,
  previewListRef,
  sliderTrackRef,
  onSymmetricChange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onSliderPointerDown,
  onSliderFocus,
  onSliderBlur,
  onSliderKeyDown,
  onSave,
  disabled,
  adjustmentDisabled,
}: {
  copy: Copy;
  geometry: ImageSplitterOutput;
  previewUrl: string;
  source: { width: number; height: number };
  adjustable: boolean;
  cuts: number[];
  symmetric: boolean;
  activeCutIndex: number | null;
  previewListRef: RefObject<HTMLDivElement | null>;
  sliderTrackRef: RefObject<HTMLDivElement | null>;
  onSymmetricChange: (value: boolean) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, index: number) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onSliderPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSliderFocus: (index: number) => void;
  onSliderBlur: () => void;
  onSliderKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
  onSave: (index: number) => void;
  disabled: boolean;
  adjustmentDisabled: boolean;
}) {
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [focusedSlice, setFocusedSlice] = useState<number | null>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const saveRailRef = useRef<HTMLDivElement>(null);
  const [saveRailLayout, setSaveRailLayout] = useState<SaveRailLayout | null>(null);
  const highlightedSlice = hoveredSlice ?? focusedSlice;
  const columns = geometry.direction === 'vertical'
    ? geometry.slices.map((slice) => `minmax(0, ${slice.width}fr)`).join(' ')
    : undefined;
  const axisLength = geometry.direction === 'vertical' ? source.width : source.height;

  useEffect(() => {
    const viewport = previewViewportRef.current;
    const rail = saveRailRef.current;
    if (geometry.direction !== 'horizontal' || !viewport || !rail) return;

    const media = Array.from(viewport.querySelectorAll<HTMLElement>('.image-splitter-slice-media'));
    const buttons = Array.from(rail.querySelectorAll('button'));
    const measureSaveRail = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const railStyle = getComputedStyle(rail);
      const next = getSaveRailLayout({
        sliceCenters: media.map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top - viewportRect.top + viewport.scrollTop + rect.height / 2;
        }),
        buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
        // 无滚动时保留小数高度，避免 scrollHeight 取整后产生多余滚动条。
        contentHeight: viewport.scrollHeight > viewport.clientHeight ? viewport.scrollHeight : viewportRect.height,
        gap: Number.parseFloat(railStyle.rowGap),
        padding: Number.parseFloat(railStyle.paddingTop),
      });
      setSaveRailLayout((previous) => (
        previous?.mode === next.mode && previous.trailingSpace === next.trailingSpace &&
        previous.minimumHeight === next.minimumHeight &&
        previous.margins.length === next.margins.length &&
        previous.margins.every((margin, index) => margin === next.margins[index])
          ? previous : next
      ));
    };
    const observer = new ResizeObserver(measureSaveRail);
    [viewport, ...media, ...buttons].forEach((element) => observer.observe(element));
    measureSaveRail();
    return () => observer.disconnect();
  }, [geometry]);

  useEffect(() => {
    if (saveRailLayout?.mode === 'aligned' && saveRailRef.current && previewViewportRef.current) {
      saveRailRef.current.scrollTop = previewViewportRef.current.scrollTop;
    }
  }, [saveRailLayout]);

  const synchronizeScroll = (source: HTMLDivElement | null, target: HTMLDivElement | null) => {
    if (saveRailLayout?.mode !== 'aligned' || !source || !target) return;
    if (target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop;
  };

  const revealSlice = (index: number) => {
    const viewport = previewViewportRef.current;
    const slice = viewport?.querySelector<HTMLElement>(`#image-splitter-slice-${index}`);
    if (!viewport || !slice) return;

    if (saveRailLayout?.mode === 'aligned') {
      const rail = saveRailRef.current;
      const button = rail?.querySelector<HTMLButtonElement>(`button[aria-controls="image-splitter-slice-${index}"]`);
      if (!rail || !button) return;
      const railTop = rail.getBoundingClientRect().top;
      const buttonRect = button.getBoundingClientRect();
      const padding = Number.parseFloat(getComputedStyle(rail).paddingTop);
      // 居中模式只揭示目标按钮，避免大切片的边缘揭示把按钮滚出鼠标位置。
      if (buttonRect.top < railTop + padding) {
        rail.scrollTop += buttonRect.top - railTop - padding;
      } else if (buttonRect.bottom > railTop + rail.clientHeight - padding) {
        rail.scrollTop += buttonRect.bottom - railTop - rail.clientHeight + padding;
      }
      viewport.scrollTop = rail.scrollTop;
      return;
    }

    const viewportTop = viewport.getBoundingClientRect().top;
    const sliceRect = slice.getBoundingClientRect();
    if (sliceRect.top < viewportTop || sliceRect.height > viewport.clientHeight) {
      viewport.scrollTop += sliceRect.top - viewportTop;
    } else if (sliceRect.bottom > viewportTop + viewport.clientHeight) {
      viewport.scrollTop += sliceRect.bottom - viewportTop - viewport.clientHeight;
    }
  };

  return (
    <section className="image-splitter-preview-section" aria-labelledby="image-splitter-preview-title">
      <div className="image-splitter-editor-heading">
        <h2 id="image-splitter-preview-title">{copy('previewAndAdjust')}</h2>
        {adjustable && (
          <label className="image-splitter-symmetric-control">
            <input
              type="checkbox"
              checked={symmetric}
              disabled={adjustmentDisabled}
              onChange={(event) => onSymmetricChange(event.currentTarget.checked)}
            />
            <span>{copy('symmetric')}</span>
          </label>
        )}
      </div>
      <div
        className={`image-splitter-preview-layout image-splitter-preview-layout--${geometry.direction} image-splitter-preview-layout--${adjustable ? 'adjustable' : 'equal'}`}
        style={{ minHeight: saveRailLayout?.minimumHeight }}
      >
        <div
          className="image-splitter-preview-viewport"
          ref={previewViewportRef}
          onScroll={() => synchronizeScroll(previewViewportRef.current, saveRailRef.current)}
        >
          <div
            ref={previewListRef}
            className={`image-splitter-preview-list image-splitter-preview-list--${geometry.direction}`}
            style={{
              gridTemplateColumns: columns,
              '--image-splitter-preview-ratio': geometry.width / geometry.height,
              '--image-splitter-preview-gap-count': geometry.count - 1,
              '--image-splitter-preview-gap': `${PREVIEW_GAP_PX}px`,
            } as CSSProperties}
          >
            {geometry.slices.map((slice) => (
              <SlicePreview
                key={slice.index}
                copy={copy}
                slice={slice}
                sourceWidth={geometry.width}
                sourceHeight={geometry.height}
                previewUrl={previewUrl}
                direction={geometry.direction}
                highlighted={highlightedSlice === slice.index}
              />
            ))}
            {adjustable && cuts.map((cut, index) => {
              const ratio = cut / axisLength;
              const gapOffset = (index + 0.5 - ratio * cuts.length) * PREVIEW_GAP_PX;
              const position = `calc(${ratio * 100}% + ${gapOffset}px)`;
              const positionStyle = geometry.direction === 'vertical' ? { left: position } : { top: position };
              const pairedIndex = cuts.length - 1 - index;
              const active = activeCutIndex === index || (symmetric && activeCutIndex === pairedIndex);
              return (
                <div
                  key={`preview-cut-${index}`}
                  className={[
                    'image-splitter-preview-cut-handle',
                    `image-splitter-preview-cut-handle--${geometry.direction}`,
                    active ? 'image-splitter-preview-cut-handle--active' : '',
                  ].filter(Boolean).join(' ')}
                  style={positionStyle}
                  aria-hidden="true"
                  data-cut-line="true"
                  data-cut-index={index}
                  onPointerDown={(event) => onPointerDown(event, index)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onLostPointerCapture={onPointerUp}
                >
                  <span />
                </div>
              );
            })}
          </div>
        </div>
        {adjustable && (
          <FreeCutEditor
            copy={copy}
            direction={geometry.direction}
            source={source}
            cuts={cuts}
            disabled={adjustmentDisabled}
            activeCutIndex={activeCutIndex}
            sliderTrackRef={sliderTrackRef}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onSliderPointerDown={onSliderPointerDown}
            onSliderFocus={onSliderFocus}
            onSliderBlur={onSliderBlur}
            onSliderKeyDown={onSliderKeyDown}
          />
        )}
        <div
          className="image-splitter-preview-save-grid"
          ref={saveRailRef}
          role="group"
          aria-labelledby="image-splitter-preview-title"
          data-save-layout={saveRailLayout?.mode}
          onScroll={() => synchronizeScroll(saveRailRef.current, previewViewportRef.current)}
        >
          {geometry.slices.map((slice) => (
            <button
              key={slice.index}
              type="button"
              aria-controls={`image-splitter-slice-${slice.index}`}
              style={{
                marginTop: saveRailLayout?.margins[slice.index],
                marginBottom: slice.index === geometry.count - 1 ? saveRailLayout?.trailingSpace : undefined,
              }}
              onPointerEnter={() => {
                setHoveredSlice(slice.index);
                revealSlice(slice.index);
              }}
              onPointerLeave={() => {
                setHoveredSlice(null);
                if (focusedSlice !== null) revealSlice(focusedSlice);
              }}
              onFocus={() => {
                setHoveredSlice(null);
                setFocusedSlice(slice.index);
                revealSlice(slice.index);
              }}
              onBlur={() => setFocusedSlice(null)}
              onClick={() => onSave(slice.index)}
              disabled={disabled}
            >
              {copy('saveSlice', { index: slice.index + 1 })}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SlicePreview({
  copy,
  slice,
  sourceWidth,
  sourceHeight,
  previewUrl,
  direction,
  highlighted,
}: {
  copy: Copy;
  slice: ImageSplitterOutput['slices'][number];
  sourceWidth: number;
  sourceHeight: number;
  previewUrl: string;
  direction: SplitDirection;
  highlighted: boolean;
}) {
  const imageStyle: CSSProperties = {
    width: `${(sourceWidth / slice.width) * 100}%`,
    height: `${(sourceHeight / slice.height) * 100}%`,
    left: `-${(slice.x / slice.width) * 100}%`,
    top: `-${(slice.y / slice.height) * 100}%`,
  };
  const mediaStyle = {
    aspectRatio: `${slice.width} / ${slice.height}`,
  } as CSSProperties;

  return (
    <article
      id={`image-splitter-slice-${slice.index}`}
      className={`image-splitter-slice-card image-splitter-slice-card--${direction}${highlighted ? ' image-splitter-slice-card--highlighted' : ''}`}
    >
      <div
        className="image-splitter-slice-media"
        style={mediaStyle}
        role="img"
        aria-label={copy('sliceAlt', { index: slice.index + 1 })}
      >
        <img src={previewUrl} alt="" style={imageStyle} draggable={false} />
      </div>
    </article>
  );
}

function SaveResultMessage({ copy, locale, result }: { copy: Copy; locale: Locale; result: SaveResult }) {
  if (result.status === 'cancelled') {
    return <div className="image-splitter-save-message" role="status">{copy('saveCancelled')}</div>;
  }
  if (result.status === 'handed-to-system') {
    return <div className="image-splitter-save-message" role="status">{copy('saveHandedToSystem')}</div>;
  }
  if (result.status === 'written') {
    return <div className="image-splitter-save-message" role="status">{copy('saveWritten', { count: result.written })}</div>;
  }
  if (result.status === 'partial') {
    return (
      <div className="image-splitter-save-message image-splitter-save-message--error" role="alert">
        {copy('savePartial', { written: result.written, total: result.attempted })}
      </div>
    );
  }

  const errorCode = result.errorCode ?? 'download-failed';
  return (
    <div className="image-splitter-save-message image-splitter-save-message--error" role="alert">
      {localizeImageSplitterError(errorCode, locale)}
    </div>
  );
}

function readErrorCode(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  if ('code' in value && typeof value.code === 'string') return value.code;
  if ('errorCode' in value && typeof value.errorCode === 'string') return value.errorCode;
  return null;
}

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

function localizeImageSplitterError(code: string, locale: Locale): string {
  return localize(getImageSplitterErrorText(code), locale);
}

function createFileKey(file: File): string {
  return [file.name, file.size, file.lastModified, file.type].join('\u0000');
}

function isMobilePreference(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const userAgentData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  return window.matchMedia('(max-width: 767px)').matches ||
    (window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
}
