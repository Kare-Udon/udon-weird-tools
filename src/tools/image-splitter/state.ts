import {
  createEqualCuts,
  getSplitAxisLength,
  ImageSplitterError,
  IMAGE_SPLITTER_DEFAULTS,
  IMAGE_SPLITTER_MAX_COUNT,
  IMAGE_SPLITTER_MIN_COUNT,
  validateSplitCuts,
} from './run.ts';
import type { ImageSplitterInput, SplitDirection, SplitMode } from './run.ts';

export type ImageSplitterSource = {
  key: string;
  width: number;
  height: number;
};

export type ImageSplitterStateStatus = 'no-source' | 'ready' | 'axis-too-short';

export type ImageSplitterState = {
  source: ImageSplitterSource | null;
  direction: SplitDirection;
  count: number;
  mode: SplitMode;
  symmetric: boolean;
  cuts: number[];
  rememberedFreeCuts: number[] | null;
  status: ImageSplitterStateStatus;
};

export type ImageSplitterStateOptions = {
  direction?: SplitDirection;
  count?: number;
  mode?: SplitMode;
  symmetric?: boolean;
};

export type ImageSplitterCutMoveStatus =
  | 'moved'
  | 'clamped'
  | 'unchanged'
  | 'invalid-index'
  | 'invalid-target'
  | 'symmetric-no-solution';

export type ImageSplitterCutMoveResult = {
  cuts: number[];
  status: ImageSplitterCutMoveStatus;
  changed: boolean;
  movedIndices: number[];
};

export type ImageSplitterStateMoveStatus = ImageSplitterCutMoveStatus | ImageSplitterStateStatus | 'equal-mode';

export type ImageSplitterStateMoveResult = {
  state: ImageSplitterState;
  cuts: number[];
  status: ImageSplitterStateMoveStatus;
  changed: boolean;
  movedIndices: number[];
};

export function createImageSplitterState(
  source: ImageSplitterSource | null = null,
  options: ImageSplitterStateOptions = {},
): ImageSplitterState {
  const direction = normalizeDirection(options.direction ?? IMAGE_SPLITTER_DEFAULTS.direction);
  const mode = normalizeMode(options.mode ?? IMAGE_SPLITTER_DEFAULTS.mode);
  const symmetric = options.symmetric ?? IMAGE_SPLITTER_DEFAULTS.symmetric;

  if (!source) {
    return {
      source: null,
      direction,
      count: normalizeCount(options.count, null, IMAGE_SPLITTER_DEFAULTS.count),
      mode,
      symmetric,
      cuts: [],
      rememberedFreeCuts: null,
      status: 'no-source',
    };
  }

  const normalizedSource = validateSource(source);
  return createStateForSource(normalizedSource, direction, options.count, mode, symmetric);
}

export function setImageSplitterSource(
  state: ImageSplitterState,
  source: ImageSplitterSource | null,
): ImageSplitterState {
  if (!source) {
    if (state.source === null && state.status === 'no-source') return state;

    return {
      ...state,
      source: null,
      cuts: [],
      rememberedFreeCuts: null,
      status: 'no-source',
    };
  }

  const normalizedSource = validateSource(source);
  if (sameSource(state.source, normalizedSource)) return state;

  return createStateForSource(normalizedSource, state.direction, state.count, state.mode, state.symmetric);
}

export function setImageSplitterDirection(state: ImageSplitterState, direction: SplitDirection): ImageSplitterState {
  const normalizedDirection = normalizeDirection(direction);
  if (normalizedDirection === state.direction) return state;

  if (!state.source) {
    return {
      ...state,
      direction: normalizedDirection,
      cuts: [],
      rememberedFreeCuts: null,
      status: 'no-source',
    };
  }

  return createStateForSource(
    state.source,
    normalizedDirection,
    state.count,
    state.mode,
    state.symmetric,
  );
}

export function setImageSplitterCount(state: ImageSplitterState, count: number): ImageSplitterState {
  const axisLength = state.source ? getSplitAxisLength(state.source.width, state.source.height, state.direction) : null;
  const normalizedCount = normalizeCount(count, axisLength, state.count);
  if (normalizedCount === state.count) return state;

  if (!state.source) {
    return {
      ...state,
      count: normalizedCount,
      cuts: [],
      rememberedFreeCuts: null,
      status: 'no-source',
    };
  }

  return createStateForSource(
    state.source,
    state.direction,
    normalizedCount,
    state.mode,
    state.symmetric,
  );
}

export function setImageSplitterMode(state: ImageSplitterState, mode: SplitMode): ImageSplitterState {
  const normalizedMode = normalizeMode(mode);
  if (normalizedMode === state.mode) return state;

  if (!state.source || state.status === 'axis-too-short') {
    return {
      ...state,
      mode: normalizedMode,
      cuts: [],
      rememberedFreeCuts: null,
    };
  }

  const axisLength = getSplitAxisLength(state.source.width, state.source.height, state.direction);
  const equalCuts = createEqualCuts(axisLength, state.count);

  if (state.mode === 'free' && normalizedMode === 'equal') {
    const rememberedFreeCuts = isValidCuts(state.cuts, axisLength, state.count) ? [...state.cuts] : null;

    return {
      ...state,
      mode: normalizedMode,
      cuts: equalCuts,
      rememberedFreeCuts,
    };
  }

  const previousFreeCuts = state.rememberedFreeCuts;
  const rememberedFreeCuts = isValidCuts(previousFreeCuts, axisLength, state.count)
    ? [...previousFreeCuts]
    : null;

  return {
    ...state,
    mode: normalizedMode,
    cuts: rememberedFreeCuts ? [...rememberedFreeCuts] : equalCuts,
    rememberedFreeCuts,
  };
}

export function setImageSplitterSymmetric(state: ImageSplitterState, symmetric: boolean): ImageSplitterState {
  if (state.symmetric === symmetric) return state;
  return { ...state, symmetric };
}

export function moveImageSplitterCuts(
  cuts: readonly number[],
  axisLength: number,
  index: number,
  target: number,
  symmetric: boolean,
): ImageSplitterCutMoveResult {
  validateSplitCuts(axisLength, cuts);

  const nextCuts = [...cuts];
  if (!Number.isInteger(index) || index < 0 || index >= cuts.length) {
    return { cuts: nextCuts, status: 'invalid-index', changed: false, movedIndices: [] };
  }

  if (!Number.isFinite(target)) {
    return { cuts: nextCuts, status: 'invalid-target', changed: false, movedIndices: [] };
  }

  const roundedTarget = Math.round(target);
  const pairIndex = cuts.length - 1 - index;

  if (symmetric && pairIndex !== index) {
    const leftIndex = Math.min(index, pairIndex);
    const rightIndex = Math.max(index, pairIndex);
    const leftRange = getSymmetricLeftRange(cuts, axisLength, leftIndex, rightIndex);

    if (!leftRange) {
      return {
        cuts: nextCuts,
        status: 'symmetric-no-solution',
        changed: false,
        movedIndices: [],
      };
    }

    const feasibleRange = index === leftIndex
      ? leftRange
      : { min: axisLength - leftRange.max, max: axisLength - leftRange.min };
    const effectiveTarget = clamp(roundedTarget, feasibleRange.min, feasibleRange.max);
    const nextLeft = index === leftIndex ? effectiveTarget : axisLength - effectiveTarget;
    const nextRight = index === leftIndex ? axisLength - effectiveTarget : effectiveTarget;
    nextCuts[leftIndex] = nextLeft;
    nextCuts[rightIndex] = nextRight;

    const changed = nextLeft !== cuts[leftIndex] || nextRight !== cuts[rightIndex];
    return {
      cuts: nextCuts,
      status: getMoveStatus(changed, effectiveTarget, roundedTarget, target),
      changed,
      movedIndices: changed ? [leftIndex, rightIndex] : [],
    };
  }

  const legalRange = getLegalRange(cuts, axisLength, index);
  const effectiveTarget = clamp(roundedTarget, legalRange.min, legalRange.max);
  nextCuts[index] = effectiveTarget;
  const changed = effectiveTarget !== cuts[index];

  return {
    cuts: nextCuts,
    status: getMoveStatus(changed, effectiveTarget, roundedTarget, target),
    changed,
    movedIndices: changed ? [index] : [],
  };
}

export function moveImageSplitterCut(
  state: ImageSplitterState,
  index: number,
  target: number,
): ImageSplitterStateMoveResult {
  if (!state.source) {
    return createStateMoveResult(state, 'no-source');
  }

  if (state.status === 'axis-too-short') {
    return createStateMoveResult(state, 'axis-too-short');
  }

  if (state.mode !== 'free') {
    return createStateMoveResult(state, 'equal-mode');
  }

  const axisLength = getSplitAxisLength(state.source.width, state.source.height, state.direction);
  const result = moveImageSplitterCuts(state.cuts, axisLength, index, target, state.symmetric);
  const nextState = result.changed
    ? { ...state, cuts: [...result.cuts], rememberedFreeCuts: [...result.cuts] }
    : state;

  return { ...result, state: nextState };
}

export function toImageSplitterInput(state: ImageSplitterState): ImageSplitterInput | null {
  if (!state.source || state.status !== 'ready') return null;

  const input: ImageSplitterInput = {
    width: state.source.width,
    height: state.source.height,
    direction: state.direction,
    count: state.count,
    mode: state.mode,
  };

  if (state.mode === 'free') input.cuts = [...state.cuts];
  return input;
}

export function resetImageSplitterState(): ImageSplitterState {
  return createImageSplitterState();
}

function createStateForSource(
  source: ImageSplitterSource,
  direction: SplitDirection,
  requestedCount: number | undefined,
  mode: SplitMode,
  symmetric: boolean,
): ImageSplitterState {
  const axisLength = getSplitAxisLength(source.width, source.height, direction);
  const count = normalizeCount(requestedCount, axisLength, IMAGE_SPLITTER_DEFAULTS.count);
  const canSplit = axisLength >= IMAGE_SPLITTER_MIN_COUNT;

  return {
    source: { ...source },
    direction,
    count,
    mode,
    symmetric,
    cuts: canSplit ? createEqualCuts(axisLength, count) : [],
    rememberedFreeCuts: null,
    status: canSplit ? 'ready' : 'axis-too-short',
  };
}

function validateSource(source: ImageSplitterSource): ImageSplitterSource {
  if (!source || typeof source.key !== 'string' || source.key.length === 0) {
    throw new ImageSplitterError('invalid-source', 'A source key is required to track free-cut positions.');
  }

  getSplitAxisLength(source.width, source.height, 'vertical');
  return { key: source.key, width: source.width, height: source.height };
}

function sameSource(left: ImageSplitterSource | null, right: ImageSplitterSource): boolean {
  return Boolean(
    left &&
      left.key === right.key &&
      left.width === right.width &&
      left.height === right.height,
  );
}

function normalizeDirection(direction: SplitDirection): SplitDirection {
  if (direction !== 'vertical' && direction !== 'horizontal') {
    throw new ImageSplitterError('invalid-direction', 'Direction must be vertical or horizontal.');
  }
  return direction;
}

function normalizeMode(mode: SplitMode): SplitMode {
  if (mode !== 'equal' && mode !== 'free') {
    throw new ImageSplitterError('invalid-mode', 'Mode must be equal or free.');
  }
  return mode;
}

function normalizeCount(requested: number | undefined, axisLength: number | null, fallback: number): number {
  const candidate = Number.isFinite(requested) ? Math.round(requested as number) : fallback;
  const maximum = axisLength !== null && axisLength >= IMAGE_SPLITTER_MIN_COUNT
    ? Math.min(IMAGE_SPLITTER_MAX_COUNT, axisLength)
    : IMAGE_SPLITTER_MAX_COUNT;

  return clamp(candidate, IMAGE_SPLITTER_MIN_COUNT, maximum);
}

function getLegalRange(cuts: readonly number[], axisLength: number, index: number): { min: number; max: number } {
  return {
    min: index === 0 ? 1 : cuts[index - 1] + 1,
    max: index === cuts.length - 1 ? axisLength - 1 : cuts[index + 1] - 1,
  };
}

function getSymmetricLeftRange(
  cuts: readonly number[],
  axisLength: number,
  leftIndex: number,
  rightIndex: number,
): { min: number; max: number } | null {
  if (rightIndex === leftIndex + 1) {
    const leftMinimum = leftIndex === 0 ? 1 : cuts[leftIndex - 1] + 1;
    const rightMaximum = rightIndex === cuts.length - 1 ? axisLength - 1 : cuts[rightIndex + 1] - 1;
    const minimum = Math.max(leftMinimum, axisLength - rightMaximum);
    const maximum = Math.floor((axisLength - 1) / 2);
    return minimum <= maximum ? { min: minimum, max: maximum } : null;
  }

  const leftRange = getLegalRange(cuts, axisLength, leftIndex);
  const rightRange = getLegalRange(cuts, axisLength, rightIndex);
  const minimum = Math.max(leftRange.min, axisLength - rightRange.max);
  const maximum = Math.min(leftRange.max, axisLength - rightRange.min);
  return minimum <= maximum ? { min: minimum, max: maximum } : null;
}

function getMoveStatus(changed: boolean, effectiveTarget: number, roundedTarget: number, target: number): 'moved' | 'clamped' | 'unchanged' {
  if (effectiveTarget !== roundedTarget || roundedTarget !== target) return 'clamped';
  return changed ? 'moved' : 'unchanged';
}

function isValidCuts(cuts: readonly number[] | null, axisLength: number, count: number): cuts is number[] {
  if (!cuts) return false;

  try {
    validateSplitCuts(axisLength, cuts, count);
    return true;
  } catch {
    return false;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function createStateMoveResult(state: ImageSplitterState, status: ImageSplitterStateMoveStatus): ImageSplitterStateMoveResult {
  return {
    state,
    cuts: [...state.cuts],
    status,
    changed: false,
    movedIndices: [],
  };
}
