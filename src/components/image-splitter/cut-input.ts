import type { SplitDirection } from '../../tools/image-splitter/run';

export type CutControlRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CutPointerPosition = {
  clientX: number;
  clientY: number;
};

export function hasCutDragCrossedThreshold(
  direction: SplitDirection,
  start: CutPointerPosition,
  current: CutPointerPosition,
  thresholdPx: number,
): boolean {
  if (!Number.isFinite(thresholdPx) || thresholdPx < 0) return false;
  const startPosition = direction === 'vertical' ? start.clientX : start.clientY;
  const currentPosition = direction === 'vertical' ? current.clientX : current.clientY;
  if (!Number.isFinite(startPosition) || !Number.isFinite(currentPosition)) return false;
  return Math.abs(currentPosition - startPosition) >= thresholdPx;
}

export function getCutPointerRatio(
  direction: SplitDirection,
  rect: CutControlRect,
  pointer: CutPointerPosition,
): number | null {
  const position = direction === 'vertical' ? pointer.clientX : pointer.clientY;
  const start = direction === 'vertical' ? rect.left : rect.top;
  const length = direction === 'vertical' ? rect.width : rect.height;
  if (!Number.isFinite(position) || !Number.isFinite(start) || !Number.isFinite(length) || length <= 0) return null;
  return Math.min(1, Math.max(0, (position - start) / length));
}

export function getNearestCutIndex(cuts: readonly number[], pointerValue: number): number | null {
  if (cuts.length === 0 || !Number.isFinite(pointerValue)) return null;
  // 命中使用未取整的位置，避免相邻窄切片在半像素处选错滑块。
  return cuts.reduce((nearestIndex, cut, index) => (
    Math.abs(cut - pointerValue) < Math.abs(cuts[nearestIndex] - pointerValue) ? index : nearestIndex
  ), 0);
}

export function getCutKeyboardTarget(
  direction: SplitDirection,
  key: string,
  current: number,
  axisLength: number,
): number | null {
  if (!Number.isInteger(current) || !Number.isInteger(axisLength) || axisLength < 2) return null;
  const downStep = direction === 'horizontal' ? 1 : -1;
  const pageStep = Math.max(1, Math.round(axisLength / 10));

  switch (key) {
    case 'ArrowLeft': return current - 1;
    case 'ArrowRight': return current + 1;
    case 'ArrowUp': return current - downStep;
    case 'ArrowDown': return current + downStep;
    case 'Home': return 1;
    case 'End': return axisLength - 1;
    case 'PageUp': return current - downStep * pageStep;
    case 'PageDown': return current + downStep * pageStep;
    default: return null;
  }
}
