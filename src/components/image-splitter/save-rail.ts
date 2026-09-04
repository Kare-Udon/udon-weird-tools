export type SaveRailMeasurements = {
  sliceCenters: readonly number[];
  buttonHeights: readonly number[];
  contentHeight: number;
  gap: number;
  padding: number;
};

export type SaveRailLayout = {
  mode: 'aligned' | 'compact';
  margins: number[];
  trailingSpace: number;
  minimumHeight: number | undefined;
};

export function getSaveRailLayout({
  sliceCenters,
  buttonHeights,
  contentHeight,
  gap,
  padding,
}: SaveRailMeasurements): SaveRailLayout {
  const measurableButtons = buttonHeights.length > 0 &&
    buttonHeights.every((height) => Number.isFinite(height) && height > 0);
  const minimumHeight = measurableButtons && Number.isFinite(padding) && padding >= 0
    ? Math.max(...buttonHeights) + padding * 2 : undefined;
  const compact: SaveRailLayout = {
    mode: 'compact',
    margins: buttonHeights.map(() => 0),
    trailingSpace: 0,
    minimumHeight,
  };
  if (
    sliceCenters.length === 0 || sliceCenters.length !== buttonHeights.length ||
    ![contentHeight, gap, padding].every((value) => Number.isFinite(value) && value >= 0) ||
    !sliceCenters.every(Number.isFinite) ||
    !measurableButtons
  ) return compact;

  const margins: number[] = [];
  let previousBottom = padding - gap;
  for (let index = 0; index < sliceCenters.length; index += 1) {
    const top = sliceCenters[index] - buttonHeights[index] / 2;
    const margin = top - previousBottom - gap;
    const bottom = top + buttonHeights[index];
    // 留白只属于按钮轨道；任一目标放不下时整栏紧凑排列，不撑大图片。
    if (margin < -1e-6 || bottom > contentHeight - padding + 1e-6) return compact;
    margins.push(Math.max(0, margin));
    previousBottom = bottom;
  }

  return {
    mode: 'aligned',
    margins,
    trailingSpace: Math.max(0, contentHeight - padding - previousBottom),
    minimumHeight,
  };
}
