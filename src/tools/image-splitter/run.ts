export type SplitDirection = 'vertical' | 'horizontal';

export type SplitMode = 'equal' | 'free';

export type SliceRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageSplitterInput = {
  width: number;
  height: number;
  direction: SplitDirection;
  count: number;
  mode: SplitMode;
  cuts?: number[];
};

export type ImageSplitterOutput = {
  width: number;
  height: number;
  direction: SplitDirection;
  count: number;
  mode: SplitMode;
  cuts: number[];
  slices: SliceRect[];
};

export type ImageSplitterErrorCode =
  | 'invalid-source'
  | 'invalid-dimensions'
  | 'invalid-direction'
  | 'invalid-count'
  | 'axis-too-short'
  | 'count-exceeds-axis'
  | 'invalid-mode'
  | 'missing-cuts'
  | 'cut-count-mismatch'
  | 'cuts-not-integer'
  | 'cuts-out-of-range'
  | 'cuts-not-ordered';

export class ImageSplitterError extends Error {
  readonly code: ImageSplitterErrorCode;

  constructor(code: ImageSplitterErrorCode, message: string) {
    super(message);
    this.name = 'ImageSplitterError';
    this.code = code;
  }
}

export const IMAGE_SPLITTER_MIN_COUNT = 2;
export const IMAGE_SPLITTER_MAX_COUNT = 32;
export const IMAGE_SPLITTER_DEFAULTS = {
  direction: 'vertical',
  count: 3,
  mode: 'equal',
  symmetric: false,
} as const;

export function run(input: ImageSplitterInput): ImageSplitterOutput {
  assertDimensions(input?.width, input?.height);
  assertDirection(input?.direction);
  assertCount(input?.count);
  assertMode(input?.mode);

  const axisLength = getSplitAxisLength(input.width, input.height, input.direction);

  if (axisLength < IMAGE_SPLITTER_MIN_COUNT) {
    throw new ImageSplitterError('axis-too-short', 'The split axis must be at least 2 pixels long.');
  }

  if (input.count > axisLength) {
    throw new ImageSplitterError('count-exceeds-axis', 'The split count cannot exceed the split-axis length.');
  }

  const cuts =
    input.mode === 'equal'
      ? createEqualCutsUnchecked(axisLength, input.count)
      : getValidatedFreeCuts(input.cuts, axisLength, input.count);

  return {
    width: input.width,
    height: input.height,
    direction: input.direction,
    count: input.count,
    mode: input.mode,
    cuts,
    slices: createSliceRects(input.width, input.height, input.direction, cuts),
  };
}

export function getSplitAxisLength(width: number, height: number, direction: SplitDirection): number {
  assertDimensions(width, height);
  assertDirection(direction);
  return direction === 'vertical' ? width : height;
}

export function createEqualCuts(axisLength: number, count: number): number[] {
  assertAxisLength(axisLength);
  assertCount(count);

  if (axisLength < IMAGE_SPLITTER_MIN_COUNT) {
    throw new ImageSplitterError('axis-too-short', 'The split axis must be at least 2 pixels long.');
  }

  if (count > axisLength) {
    throw new ImageSplitterError('count-exceeds-axis', 'The split count cannot exceed the split-axis length.');
  }

  return createEqualCutsUnchecked(axisLength, count);
}

export function validateSplitCuts(axisLength: number, cuts: readonly number[], count?: number): void {
  assertAxisLength(axisLength);
  const resolvedCount = count ?? (Array.isArray(cuts) ? cuts.length + 1 : 0);
  assertCount(resolvedCount);

  if (axisLength < IMAGE_SPLITTER_MIN_COUNT) {
    throw new ImageSplitterError('axis-too-short', 'The split axis must be at least 2 pixels long.');
  }

  if (resolvedCount > axisLength) {
    throw new ImageSplitterError('count-exceeds-axis', 'The split count cannot exceed the split-axis length.');
  }

  if (!Array.isArray(cuts) || cuts.length !== resolvedCount - 1) {
    throw new ImageSplitterError('cut-count-mismatch', 'The number of cuts must equal count minus one.');
  }

  let previous = 0;
  for (const cut of cuts) {
    if (!Number.isInteger(cut)) {
      throw new ImageSplitterError('cuts-not-integer', 'Every cut must be an integer source pixel position.');
    }

    if (cut <= 0 || cut >= axisLength) {
      throw new ImageSplitterError('cuts-out-of-range', 'Every cut must be strictly inside the split axis.');
    }

    if (cut <= previous) {
      throw new ImageSplitterError('cuts-not-ordered', 'Cuts must be strictly increasing.');
    }

    previous = cut;
  }
}

function createEqualCutsUnchecked(axisLength: number, count: number): number[] {
  const axis = BigInt(axisLength);
  const divisor = BigInt(count);

  return Array.from(
    { length: count - 1 },
    (_, index) => Number((BigInt(index + 1) * axis) / divisor),
  );
}

function getValidatedFreeCuts(cuts: number[] | undefined, axisLength: number, count: number): number[] {
  if (!Array.isArray(cuts)) {
    throw new ImageSplitterError('missing-cuts', 'Free mode requires an explicit cuts array.');
  }

  validateSplitCuts(axisLength, cuts, count);
  return [...cuts];
}

function createSliceRects(width: number, height: number, direction: SplitDirection, cuts: readonly number[]): SliceRect[] {
  const axisLength = direction === 'vertical' ? width : height;
  const boundaries = [0, ...cuts, axisLength];

  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];

    return direction === 'vertical'
      ? { index, x: start, y: 0, width: end - start, height }
      : { index, x: 0, y: start, width, height: end - start };
  });
}

function assertDimensions(width: number, height: number): void {
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new ImageSplitterError('invalid-dimensions', 'Image width and height must be positive integers.');
  }
}

function assertAxisLength(axisLength: number): void {
  if (!isPositiveInteger(axisLength)) {
    throw new ImageSplitterError('invalid-dimensions', 'The split-axis length must be a positive integer.');
  }
}

function assertDirection(direction: SplitDirection): void {
  if (direction !== 'vertical' && direction !== 'horizontal') {
    throw new ImageSplitterError('invalid-direction', 'Direction must be vertical or horizontal.');
  }
}

function assertCount(count: number): void {
  if (!Number.isInteger(count) || count < IMAGE_SPLITTER_MIN_COUNT || count > IMAGE_SPLITTER_MAX_COUNT) {
    throw new ImageSplitterError(
      'invalid-count',
      `Split count must be an integer from ${IMAGE_SPLITTER_MIN_COUNT} to ${IMAGE_SPLITTER_MAX_COUNT}.`,
    );
  }
}

function assertMode(mode: SplitMode): void {
  if (mode !== 'equal' && mode !== 'free') {
    throw new ImageSplitterError('invalid-mode', 'Mode must be equal or free.');
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
