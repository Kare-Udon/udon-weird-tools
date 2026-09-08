import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getSaveRailLayout } from '../../components/image-splitter/save-rail.ts';
import { examples } from './examples.ts';
import { manifest } from './manifest.ts';
import { inputFields, toImageSplitterInput } from './schema.ts';

const locales = ['en', 'ja', 'zh-CN'];
const component = readFileSync(new URL('../../components/ImageSplitterTool.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../components/ImageSplitterTool.css', import.meta.url), 'utf8');
const globalStyles = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');

function sourceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label} source range is missing: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label} source range has no end marker: ${endMarker}`);
  return source.slice(start, end);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const cutInput = () => import('../../components/image-splitter/cut-input.ts');

test('自由滑条方向、坐标和辅助功能随切线移动轴同步变化', () => {
  const editor = sourceBetween(component, 'function FreeCutEditor(', 'function SplitPreview(', 'free cut editor');
  const pointer = sourceBetween(component, 'function getSliderPointerTarget(', 'function getSliderIndexAtPointer(', 'slider pointer');
  const nearest = sourceBetween(component, 'function getSliderIndexAtPointer(', 'function beginCutDrag(', 'nearest slider');
  const keyboard = sourceBetween(component, 'function handleSliderKeyDown(', 'function resetTool(', 'slider keyboard');

  assert.match(editor, /sliderOrientation = direction === 'horizontal' \? 'vertical' : 'horizontal'/, '滑条方向必须与切线本身垂直');
  assert.match(editor, /aria-orientation=\{sliderOrientation\}/, '读屏方向必须使用真实滑条方向');
  assert.match(editor, /image-splitter-slider-track--\$\{sliderOrientation\}/, '轨道样式必须使用滑条自身方向');
  assert.match(editor, /positionStyle = sliderOrientation === 'vertical' \? \{ top: position \} : \{ left: position \}/, '滑块必须在竖轨上按 top 定位，在横轨上按 left 定位');
  assert.match(editor, /style=\{\{ \.\.\.positionStyle, zIndex:/, '方向位置必须传到实际滑块，不能只更改辅助功能属性');
  for (const source of [pointer, nearest]) {
    assert.match(source, /getCutPointerRatio\(currentState\.direction, rect, event\)/, '拖动和空白轨道命中必须使用同一主轴映射');
  }
  assert.match(nearest, /getNearestCutIndex\(currentState\.cuts, pointerValue\)/, '空白轨道命中必须保留未取整的像素位置');
  assert.match(keyboard, /getCutKeyboardTarget\(currentState\.direction, event\.key, current, currentAxisLength\)/, '键盘也必须随切线移动方向变化');
  assert.match(styles, /\.image-splitter-preview-layout--horizontal\.image-splitter-preview-layout--adjustable\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+2\.75rem\s+5\.5rem/s, '横切的竖滑条和保存栏必须并入预览右侧');
  assert.match(styles, /\.image-splitter-slider-track--vertical\s*\{[^}]*min-height:\s*0/s, '竖轨不能用旧横轨的最低高度撑高极矮图片');
});

test('横切滑条使用 Y 坐标，纵切滑条仍使用 X 坐标', async () => {
  const { getCutPointerRatio } = await cutInput();
  const rect = { left: 100, top: 50, width: 300, height: 200 };
  assert.equal(getCutPointerRatio('horizontal', rect, { clientX: 0, clientY: 100 }), 0.25);
  assert.equal(getCutPointerRatio('horizontal', rect, { clientX: 900, clientY: 100 }), 0.25, '改变横坐标不能移动横切线');
  assert.equal(getCutPointerRatio('vertical', rect, { clientX: 175, clientY: 0 }), 0.25);
  assert.equal(getCutPointerRatio('vertical', rect, { clientX: 175, clientY: 900 }), 0.25, '改变纵坐标不能移动纵切线');
});

test('合并预览按固定切片间距修正拖动坐标', async () => {
  const { getSlicedPreviewPointerRatio } = await cutInput();
  const verticalRect = { left: 100, top: 50, width: 312, height: 240 };
  const horizontalRect = { left: 100, top: 50, width: 240, height: 312 };

  assert.equal(
    getSlicedPreviewPointerRatio('vertical', verticalRect, { clientX: 178, clientY: 0 }, 0, 2, 6),
    0.25,
    '第一条竖向间隙的中心应映射回扣除间隙后的 25%',
  );
  assert.equal(
    getSlicedPreviewPointerRatio('vertical', verticalRect, { clientX: 334, clientY: 0 }, 1, 2, 6),
    0.75,
    '第二条竖向间隙的中心应映射回扣除间隙后的 75%',
  );
  assert.equal(
    getSlicedPreviewPointerRatio('horizontal', horizontalRect, { clientX: 0, clientY: 128 }, 0, 2, 6),
    0.25,
    '横向分片使用同一间距修正但读取纵坐标',
  );
  assert.equal(
    getSlicedPreviewPointerRatio('vertical', verticalRect, { clientX: 178, clientY: 0 }, 2, 2, 6),
    null,
    '间隙索引越界时不得产生拖动目标',
  );
});

test('滑条只钳制有效主轴，零尺寸或无效坐标不产生目标', async () => {
  const { getCutPointerRatio } = await cutInput();
  const rect = { left: 100, top: 50, width: 300, height: 200 };
  assert.equal(getCutPointerRatio('horizontal', { ...rect, width: 0 }, { clientX: NaN, clientY: 100 }), 0.25, '竖轨只依赖自身高度和纵坐标');
  assert.equal(getCutPointerRatio('vertical', { ...rect, height: 0 }, { clientX: 175, clientY: NaN }), 0.25, '横轨只依赖自身宽度和横坐标');
  for (const direction of ['vertical', 'horizontal']) {
    assert.equal(getCutPointerRatio(direction, rect, { clientX: -100, clientY: -100 }), 0);
    assert.equal(getCutPointerRatio(direction, rect, { clientX: 999, clientY: 999 }), 1);
    assert.equal(getCutPointerRatio(direction, { ...rect, width: 0, height: 0 }, { clientX: 200, clientY: 100 }), null);
    assert.equal(getCutPointerRatio(direction, rect, { clientX: NaN, clientY: NaN }), null);
  }
});

test('空白轨道按未取整的像素距离选择切线，等距保持原有片序', async () => {
  const { getNearestCutIndex, getCutPointerRatio } = await cutInput();
  const ratio = getCutPointerRatio('horizontal', { left: 0, top: 0, width: 44, height: 100 }, { clientX: 22, clientY: 21.25 });
  assert.equal(getNearestCutIndex([20, 22], ratio * 100), 1);
  assert.equal(getNearestCutIndex([20, 22], 21), 0);
  assert.equal(getNearestCutIndex([20, 22], 0), 0);
  assert.equal(getNearestCutIndex([20, 22], 100), 1);
  assert.equal(getNearestCutIndex([], 21), null);
});

test('按下现有滑块或图片切线不跳，拖动时中心直接跟随光标', () => {
  const drag = sourceBetween(component, 'function beginCutDrag(', 'function finishCutPointer(', 'cut drag');
  assert.match(drag, /jumpOnPointerDown/, '直接抓取与空白轨道跳转必须显式区分');
  assert.match(drag, /if \(jumpOnPointerDown\) applyCutTarget\(index, pointerTarget\)/, '只有空白轨道按下时可以立即跳转');
  assert.match(drag, /beginCutDrag\(event, index, 'preview', false\)/, '预览间隙按下不能跳向命中区内的光标');
  assert.match(drag, /beginCutDrag\(event, index, 'slider', !thumb\)/, '现有滑块按下不跳，空白轨道仍可跳转');
  assert.match(drag, /applyCutTarget\(drag\.index, pointerTarget\)/, '拖动后滑块中心必须直接跟随光标');
  assert.doesNotMatch(component, /grabOffset|getCutDragGrabOffset|getCutDragTarget/, '拖动不应保留光标与滑块中心的偏移');
});

test('导出缓存 key 随切线变化，但预览交互 key 保持稳定', () => {
  const keyBlock = sourceBetween(component, 'const geometryKey = useMemo', 'const hasPreparedFiles', 'geometry key block');
  const readyPreview = sourceBetween(
    component,
    '        {decodedImage && geometry && splitState.status === \'ready\'',
    '        {(decoding || preparing || saving)',
    'ready preview usage',
  );

  assert.match(keyBlock, /const geometryKey = useMemo/, '完整几何 key 必须保留');
  assert.match(keyBlock, /geometry\.cuts\.join\(','\)/, '导出准备 key 必须随实际切线变化');
  const interactionKey = keyBlock.match(/const interactionKey = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[geometry, splitState\.source\]\);/)?.[0];
  assert.ok(interactionKey, '预览必须声明独立的交互 key');
  assert.doesNotMatch(interactionKey, /cuts/, '交互 key 不能把可变切线位置编码进去');
  assert.match(readyPreview, /<SplitPreview[\s\S]*key=\{interactionKey\}/, '预览必须使用独立的稳定交互 key');
  assert.doesNotMatch(readyPreview, /key=\{geometryKey\}/, '预览不能复用导出几何 key');
  assert.match(component, /preparedKey === geometryKey/, '准备好的导出文件仍必须按完整几何 key 命中');
});

test('点击微抖未达到阈值时不启动拖动，达到阈值后才直接跟随光标', async () => {
  const { hasCutDragCrossedThreshold } = await cutInput();
  const start = { clientX: 100, clientY: 200 };

  assert.equal(hasCutDragCrossedThreshold('vertical', start, { clientX: 103.99, clientY: 900 }, 4), false, '纵切只看横向位移，且不足 4px 不拖动');
  assert.equal(hasCutDragCrossedThreshold('vertical', start, { clientX: 104, clientY: 0 }, 4), true, '纵切横向位移达到 4px 后开始拖动');
  assert.equal(hasCutDragCrossedThreshold('horizontal', start, { clientX: 900, clientY: 203.99 }, 4), false, '横切只看纵向位移，且不足 4px 不拖动');
  assert.equal(hasCutDragCrossedThreshold('horizontal', start, { clientX: 0, clientY: 196 }, 4), true, '横切反向位移达到 4px 后也开始拖动');
  assert.equal(hasCutDragCrossedThreshold('vertical', start, { clientX: Number.NaN, clientY: 200 }, 4), false, '无效指针位置不能启动拖动');
  assert.equal(hasCutDragCrossedThreshold('vertical', start, { clientX: 104, clientY: 200 }, -1), false, '无效阈值不能启动拖动');

  const drag = sourceBetween(component, 'function beginCutDrag(', 'function finishCutPointer(', 'cut drag');
  assert.match(component, /const CUT_DRAG_THRESHOLD_PX = 4/, '点击微抖阈值必须是显式常量');
  assert.match(drag, /hasCutDragCrossedThreshold\(/, '第一次指针移动必须先通过拖动阈值');
  assert.match(drag, /drag\.started = true/, '超过阈值后必须记住拖动已经开始');
  assert.match(drag, /applyCutTarget\(drag\.index, pointerTarget\)/, '真正拖动后仍应使用光标绝对位置，不保留抓取偏移');
});

test('滑块可见内核在横轨和竖轨上都是正圆', () => {
  const thumbCoreRule = styles.match(/\.image-splitter-slider-thumb span\s*\{([^}]+)\}/)?.[1];
  const verticalOverride = styles.match(/\.image-splitter-slider-track--vertical \.image-splitter-slider-thumb span\s*\{([^}]+)\}/)?.[1] ?? '';

  assert.ok(thumbCoreRule, '滑块可见内核样式必须存在');
  const width = thumbCoreRule.match(/width:\s*([^;]+);/)?.[1];
  const height = thumbCoreRule.match(/height:\s*([^;]+);/)?.[1];
  assert.ok(width && height, '滑块可见内核必须显式设置宽高');
  assert.equal(width, height, '可见内核宽高必须相等');
  assert.match(thumbCoreRule, /border-radius:\s*50%/, '等宽高内核必须使用圆形圆角');
  assert.doesNotMatch(verticalOverride, /(?:width|height):/, '竖轨不能再次把圆形内核压成长条');
});

test('按住或禁用滑块时仍保留命中框的居中定位', () => {
  const globalActiveRule = globalStyles.match(/button:active,\s*\.button:active\s*\{([^}]+)\}/)?.[1];
  const globalDisabledRule = globalStyles.match(/button:disabled\s*\{([^}]+)\}/)?.[1];
  const localStateRule = styles.match(/\.image-splitter-slider-thumb:active,\s*\.image-splitter-slider-thumb:disabled\s*\{([^}]+)\}/)?.[1];

  assert.match(globalActiveRule ?? '', /transform:\s*translateY\(1px\)/, '测试必须覆盖会改写 transform 的全局按压样式');
  assert.match(globalDisabledRule ?? '', /transform:\s*none/, '测试必须覆盖会改写 transform 的全局禁用样式');
  assert.ok(localStateRule, '滑块必须显式覆盖全局按钮状态的 transform');
  assert.match(localStateRule, /transform:\s*translate\(-50%,\s*-50%\)/, '按住和禁用时都必须保留 44px 命中框的双轴居中');
});

test('竖滑条上下键与切线同向，横滑条保留原有左右和快捷键语义', async () => {
  const { getCutKeyboardTarget } = await cutInput();
  assert.equal(getCutKeyboardTarget('horizontal', 'ArrowUp', 250, 900), 249);
  assert.equal(getCutKeyboardTarget('horizontal', 'ArrowDown', 250, 900), 251);
  assert.equal(getCutKeyboardTarget('horizontal', 'PageUp', 250, 900), 160);
  assert.equal(getCutKeyboardTarget('horizontal', 'PageDown', 250, 900), 340);
  for (const direction of ['vertical', 'horizontal']) {
    assert.equal(getCutKeyboardTarget(direction, 'ArrowLeft', 250, 900), 249);
    assert.equal(getCutKeyboardTarget(direction, 'ArrowRight', 250, 900), 251);
    assert.equal(getCutKeyboardTarget(direction, 'Home', 250, 900), 1);
    assert.equal(getCutKeyboardTarget(direction, 'End', 250, 900), 899);
    assert.equal(getCutKeyboardTarget(direction, 'Tab', 250, 900), null);
    assert.equal(getCutKeyboardTarget(direction, 'ArrowUp', 0, 1), null);
  }
  assert.equal(getCutKeyboardTarget('vertical', 'ArrowUp', 250, 900), 251);
  assert.equal(getCutKeyboardTarget('vertical', 'ArrowDown', 250, 900), 249);
  assert.equal(getCutKeyboardTarget('vertical', 'PageUp', 250, 900), 340);
  assert.equal(getCutKeyboardTarget('vertical', 'PageDown', 250, 900), 160);
});

test('manifest, schema labels/options, and examples provide all supported locales', () => {
  for (const locale of locales) {
    assert.equal(typeof manifest.i18n.name[locale], 'string');
    assert.equal(typeof manifest.i18n.description[locale], 'string');
  }

  for (const field of inputFields) {
    for (const locale of locales) assert.equal(typeof field.label[locale], 'string');
    if (field.type === 'select') {
      for (const option of field.options) {
        for (const locale of locales) assert.equal(typeof option.label[locale], 'string');
      }
    }
  }

  for (const example of examples) {
    for (const locale of locales) assert.equal(typeof example.name[locale], 'string');
  }
});

test('schema defaults and form conversion match the frozen geometry input', () => {
  const direction = inputFields.find((field) => field.name === 'direction');
  const count = inputFields.find((field) => field.name === 'count');
  const mode = inputFields.find((field) => field.name === 'mode');

  assert.equal(direction?.type, 'select');
  assert.equal(direction?.defaultValue, 'vertical');
  assert.equal(count?.type, 'number');
  assert.equal(count?.defaultValue, 3);
  assert.equal(count?.min, 2);
  assert.equal(count?.max, 32);
  assert.equal(mode?.type, 'select');
  assert.equal(mode?.defaultValue, 'equal');

  assert.deepEqual(
    toImageSplitterInput({
      width: 80,
      height: 120,
      direction: 'horizontal',
      count: 4,
      mode: 'free',
      cuts: [24, 62, 96],
    }),
    {
      width: 80,
      height: 120,
      direction: 'horizontal',
      count: 4,
      mode: 'free',
      cuts: [24, 62, 96],
    },
  );
});

test('dedicated UI uses one native file input and keeps the selected-image summary minimal', () => {
  const upload = sourceBetween(
    component,
    '<div className="image-splitter-upload">',
    '<div className="image-splitter-settings">',
    'upload panel',
  );

  assert.equal(countMatches(upload, /type="file"/g), 1, 'the upload panel must own exactly one native file input');
  assert.match(component, /fileInputRef\.current\?\.click\(\)/, 'the visible upload button must synchronously open the native input');
  assert.doesNotMatch(upload, /sourceMenuOpen|openMobileSource|chooseFromPhotos|chooseFromFiles/, 'the page must not insert a custom source menu before the native picker');
  assert.match(upload, /\{selectedFile && \(\s*<button[\s\S]*?image-splitter-reset-button/, 'Reset must be conditional on a selected file');
  assert.match(upload, /image-splitter-selected-preview[\s\S]*?image-splitter-file-thumbnail/, 'the selected image must render in its centered preview wrapper');
  assert.doesNotMatch(upload, /image-splitter-file-name/, 'the selected file name must not be rendered');

  const thumbnailRule = styles.match(/\.image-splitter-file-thumbnail\s*\{([\s\S]*?)\}/);
  assert.ok(thumbnailRule, 'the selected thumbnail rule is missing');
  assert.match(thumbnailRule[1], /(?:^|;)\s*width:\s*100%/, 'the selected thumbnail must use the available upload width');
  assert.match(thumbnailRule[1], /height:\s*auto/, 'the selected thumbnail must derive its height from the source aspect ratio');
  assert.match(styles, /\.image-splitter-selected-preview\s*\{[\s\S]*?justify-content:\s*center/, 'the selected thumbnail must stay centered');
});

test('custom count replaces its third slot and preview layout follows the split direction', () => {
  const countControls = sourceBetween(
    component,
    '<SettingGroup label={copy(\'countLabel\')}>',
    '<SettingGroup label={copy(\'ratioLabel\')} wide>',
    'slice count controls',
  );

  assert.match(
    countControls,
    /\{customCountActive \? \(\s*<div className="image-splitter-stepper"[\s\S]*?\) : \(\s*<OptionButton/,
    'the custom stepper must replace the Custom button in the same render slot',
  );
  assert.doesNotMatch(styles, /\.image-splitter-stepper\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s, 'the custom stepper must not force a new row');

  assert.match(component, /image-splitter-preview-list--\$\{geometry\.direction\}/, 'the preview list must expose the active direction');
  assert.match(component, /direction=\{geometry\.direction\}/, 'each slice card must receive the active direction');
  assert.doesNotMatch(component, /NARROW_PREVIEW_RATIO|COMPACT_PREVIEW_WIDTH|slice-card--compact/, 'per-slice compact scaling must not reintroduce unequal cross-axis sizes');
  assert.match(styles, /\.image-splitter-preview-list--vertical\s*\{[^}]*display:\s*grid/s, 'vertical cuts must share the available width through proportional grid columns');
  assert.match(styles, /\.image-splitter-preview-list--horizontal\s*\{[^}]*flex-direction:\s*column/s, 'horizontal cuts must render as a same-width column');
  assert.match(styles, /\.image-splitter-slice-card--vertical \.image-splitter-slice-media\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s, 'vertical slice media must share the row height even when their widths round to subpixels');
  assert.match(styles, /\.image-splitter-slice-card--horizontal \.image-splitter-slice-media\s*\{[^}]*width:\s*100%/s, 'horizontal slice media must share one width');
  assert.match(styles, /\.image-splitter-preview-layout--horizontal\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+5\.5rem/s, 'horizontal save buttons must keep a separate right-side column');
});

test('自由编辑与切片预览合并为一个 Preview & adjust 工作区', () => {
  const root = sourceBetween(
    component,
    'return (\n    <div className="image-splitter-tool">',
    'function SettingGroup(',
    'tool root',
  );
  const preview = sourceBetween(component, 'function SplitPreview(', 'function SlicePreview(', 'merged preview');

  assert.equal(countMatches(root, /<SplitPreview\b/g), 1, '就绪状态只能渲染一个预览工作区');
  assert.doesNotMatch(root, /<FreeCutEditor\b/, '自由模式不能再额外渲染一张编辑器图片');
  assert.match(preview, /copy\('previewAndAdjust'\)/, '合并工作区需要使用新的统一标题');
  assert.match(preview, /image-splitter-preview-cut-handle/, '切片间隙本身应保留直接拖动入口');
  assert.match(preview, /<FreeCutEditor\b/, '自由模式的滑条必须嵌入合并工作区');
});

test('桌面设置区按设计稿并排，窄屏仍保持单列', () => {
  const root = sourceBetween(
    component,
    'return (\n    <div className="image-splitter-tool">',
    'function SettingGroup(',
    'tool root',
  );

  assert.match(root, /<SettingGroup label=\{copy\('ratioLabel'\)\} wide>/, '切分比例应显式跨越桌面两列');
  assert.match(styles, /@media \(min-width:\s*900px\)\s*\{[\s\S]*?\.image-splitter-settings\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/, '桌面设置区应形成方向与数量两列');
  assert.match(styles, /\.image-splitter-setting-group--wide\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s, '比例组选项应横跨完整设置宽度');
  assert.match(styles, /@media \(max-width:\s*767px\)\s*\{[\s\S]*?\.image-splitter-count-row\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, '手机端应继续使用原有单列设置和三槽数量控件');
});

test('preview geometry and per-slice save controls have independent layout tracks in both directions', () => {
  const preview = sourceBetween(component, 'function SplitPreview(', 'function SlicePreview(', 'split preview');
  const slice = sourceBetween(component, 'function SlicePreview(', 'function SaveResultMessage(', 'slice preview');

  assert.match(preview, /geometry\.slices\.map\(\(slice\) => `minmax\(0, \$\{slice\.width\}fr\)`\)/, 'the source pixel widths must determine the preview column proportions');
  assert.match(preview, /gridTemplateColumns:\s*columns/, 'the calculated source proportions must reach the rendered grid');
  assert.match(preview, /image-splitter-preview-save-grid/, 'both directions need an independent action grid');
  assert.match(preview, /aria-controls=\{`image-splitter-slice-\$\{slice\.index\}`\}/, 'each detached save button must name exactly its own preview');
  assert.match(preview, /onClick=\{\(\) => onSave\(slice\.index\)\}/, 'each numbered save button must save its own source slice');
  assert.match(preview, /highlighted=\{highlightedSlice === slice\.index\}/, 'focus and pointer highlighting must select the same slice index');
  assert.match(slice, /className="image-splitter-slice-media"/, 'each slice must retain its own preview image');
  assert.doesNotMatch(slice, /<button\b/, 'neither direction may size a slice card from a save button');
  assert.doesNotMatch(preview, /\{geometry\.direction === 'vertical' && \(\s*<div className="image-splitter-preview-save-grid"/, 'the detached save grid must not exclude horizontal cuts');
  assert.match(styles, /\.image-splitter-preview-list--vertical\s*\{[^}]*width:\s*100%/s, 'the continuous vertical strip must occupy the full preview width');
  assert.match(styles, /\.image-splitter-preview-save-grid\s*\{[^}]*repeat\(auto-fit,\s*minmax\(5\.5rem,\s*1fr\)\)/s, 'save button minimum widths must belong to the independent wrapping grid');
  assert.match(preview, /'--image-splitter-preview-ratio':\s*geometry\.width \/ geometry\.height/, 'the shared preview height must use the full source aspect ratio');
  assert.match(styles, /\.image-splitter-preview-list--vertical\s*\{[^}]*height:\s*calc\([\s\S]*?100cqw[\s\S]*?var\(--image-splitter-preview-ratio\)/, 'the source ratio and gap-adjusted container width must size one shared row');
});

test('常见比例的预览完整展开，只有超长图使用宽度自适应的高度上限', () => {
  const layout = styles.match(/\.image-splitter-preview-layout\s*\{([^}]+)\}/)?.[1];
  const viewportRules = [...styles.matchAll(/\.image-splitter-preview-viewport\s*\{([^}]+)\}/g)];
  const heightLimits = viewportRules.flatMap((rule) => [...rule[1].matchAll(/max-height:\s*([^;]+);/g)]);

  assert.ok(layout, '预览布局容器必须存在');
  assert.match(layout, /container-type:\s*inline-size/, '高度上限的容器单位必须取自预览布局宽度');
  assert.equal(heightLimits.length, 1, '各断点必须共用自适应上限，不能另加更严格的手机高度限制');
  const responsiveLimit = heightLimits[0][1].match(/^max\(\s*([\d.]+)vh\s*,\s*([\d.]+)cqw\s*\)$/);
  assert.ok(responsiveLimit, '高度保护值应取视口高度与预览宽度计算值中的较大值');

  for (const [width, height] of [[1133, 846], [300, 852], [600, 360]]) {
    const maxHeight = Math.max(height * Number(responsiveLimit[1]) / 100, width * Number(responsiveLimit[2]) / 100);
    assert.ok(maxHeight >= height, '不得把普通图片限高在一屏以内');
    for (const ratio of [4 / 3, 3 / 4, 9 / 16]) {
      assert.ok(maxHeight >= width / ratio + 12, '常见横图和竖图应容纳完整图像及三片间隙、内边距');
    }
    assert.ok(maxHeight < width * 12, '超长图仍应有有限高度的内部滚动区');
  }
});

test('横向薄片连续预览的高度不受右侧保存栏的按钮高度影响', () => {
  const preview = sourceBetween(component, 'function SplitPreview(', 'function SlicePreview(', 'split preview');
  const imageList = styles.match(/\.image-splitter-preview-list--horizontal\s*\{([^}]+)\}/)?.[1];
  const saveRail = styles.match(/\.image-splitter-preview-layout--horizontal > \.image-splitter-preview-save-grid\s*\{([^}]+)\}/)?.[1];
  const layout = styles.match(/\.image-splitter-preview-layout--horizontal\s*\{([^}]+)\}/)?.[1];

  assert.match(preview, /image-splitter-preview-layout--\$\{geometry\.direction\}/, '两种方向必须共用图片轨道和操作轨道的布局容器');
  assert.ok(imageList, '横向图片轨道的样式必须存在');
  assert.match(imageList, /gap:\s*var\(--image-splitter-preview-gap\)/, '横向薄片使用与纵向一致的固定图片间隙');
  assert.ok(saveRail, '右侧保存栏必须有独立布局');
  assert.match(saveRail, /contain:\s*size/, '按钮的固有高度不得参与图片轨道的尺寸计算');
  assert.match(saveRail, /min-height:\s*0/, '保存栏必须能收缩到预览高度');
  assert.match(saveRail, /overflow-y:\s*auto/, '超出预览高度的按钮必须仍可独立滚动访问');
  assert.match(saveRail, /display:\s*flex/, '右栏必须按按钮换行后的实际高度排布，避免隐式网格行小于按钮');
  assert.match(saveRail, /flex-direction:\s*column/, '右栏保持独立的单列按钮流');
  assert.match(styles, /\.image-splitter-preview-layout--horizontal \.image-splitter-preview-save-grid > button\s*\{[^}]*flex:\s*none/s, '按钮不得因保存栏高度受限而被压缩或重叠');
  assert.match(layout, /min-height:\s*calc\(2\.75rem\s*\+\s*0\.5rem\)/, '极矮图片的保存栏仍需容纳一枚完整按钮及上下内边距');
  assert.match(styles, /\.image-splitter-preview-save-grid > button\s*\{[^}]*min-height:\s*2\.75rem/s, '不能通过缩小触控目标来挤进薄片行');
});

test('独立保存栏按精确片序在预览内部显示聚焦或悬停的切片', () => {
  const preview = sourceBetween(component, 'function SplitPreview(', 'function SlicePreview(', 'split preview');

  assert.match(preview, /className="image-splitter-preview-viewport"\s+ref=\{previewViewportRef\}/, '显示目标只作用于当前预览滚动区');
  assert.match(preview, /querySelector<HTMLElement>\(`#image-splitter-slice-\$\{index\}`\)/, '滚动目标必须使用保存按钮的精确片序');
  assert.match(preview, /viewport\.scrollTop\s*\+=/, '目标移出可见范围时只调整预览自己的滚动位置');
  for (const event of ['onPointerEnter', 'onFocus']) {
    assert.match(preview, new RegExp(`${event}=\\{\\(\\) => \\{[^}]*revealSlice\\(slice\\.index\\)`), '鼠标和键盘都应显示对应切片');
  }
  assert.match(preview, /onPointerLeave=\{\(\) => \{[^}]*revealSlice\(focusedSlice\)/, '悬停结束后回到原焦点片时也必须同步显示该片');
});

test('右侧保存栏按实际图片与按钮尺寸选择居中或紧凑排列', () => {
  const preview = sourceBetween(component, 'function SplitPreview(', 'function SlicePreview(', 'split preview');

  assert.match(preview, /getSaveRailLayout\(\{/, '必须用布局计算判断是否能逐片居中，不能始终从顶部堆叠');
  assert.match(preview, /buttonHeights:\s*buttons\.map\(\(button\) => button\.getBoundingClientRect\(\)\.height\)/, '换行或字体变化后必须使用按钮实际高度');
  assert.match(preview, /new ResizeObserver\(measureSaveRail\)/, '视口或内容尺寸变化后必须重新判断排列方式');
  assert.match(preview, /observer\.disconnect\(\)/, '切换配置及卸载时必须清理尺寸监听');
  assert.match(preview, /marginTop:\s*saveRailLayout\?\.margins\[slice\.index\]/, '计算出的留白必须应用到精确片序的保存按钮');
  assert.match(preview, /saveRailLayout\?\.mode !== 'aligned'/, '只有居中模式可以联动左右滚动，紧凑模式仍需独立访问全部按钮');
});

function railMeasurements(sliceHeights, buttonHeights = sliceHeights.map(() => 44)) {
  let offset = 0;
  const sliceCenters = sliceHeights.map((height) => {
    const center = offset + height / 2;
    offset += height + 3;
    return center;
  });
  return { sliceCenters, buttonHeights, gap: 8.8, padding: 4, contentHeight: offset - 3 + 5.6 };
}

function assertCenteredRail(measurements, layout) {
  assert.equal(layout.mode, 'aligned');
  let bottom = measurements.padding - measurements.gap;
  for (let index = 0; index < layout.margins.length; index += 1) {
    const top = bottom + measurements.gap + layout.margins[index];
    const height = measurements.buttonHeights[index];
    assert.ok(layout.margins[index] >= 0, '按钮之间只能增加留白，不得重叠');
    assert.ok(Math.abs(top + height / 2 - measurements.sliceCenters[index]) < 1e-5, '按钮必须命中自己图片的实际中心');
    bottom = top + height;
  }
  assert.ok(Math.abs(bottom + layout.trailingSpace + measurements.padding - measurements.contentHeight) < 1e-5, '两栏内容高度相同，滚动后才能继续对齐');
}

test('六片空间充足时逐片居中，不把按钮均匀分散到错误的行', () => {
  const measurements = railMeasurements(Array(6).fill(60.6796875));
  const layout = getSaveRailLayout(measurements);
  assertCenteredRail(measurements, layout);
});

test('自由裁切按照不等高子图的真实中心排列', () => {
  const measurements = railMeasurements([100, 65, 160]);
  assertCenteredRail(measurements, getSaveRailLayout(measurements));
});

test('十五与三十二张薄片保持紧密按钮排列', () => {
  for (const count of [15, 32]) {
    const layout = getSaveRailLayout(railMeasurements(Array(count).fill(360 / count)));
    assert.deepEqual(layout, { mode: 'compact', margins: Array(count).fill(0), trailingSpace: 0, minimumHeight: 52 });
  }
});

test('自由裁切总空间够但局部目标相撞时也回退紧凑排列', () => {
  const measurements = railMeasurements([100, 1, 1, 230]);
  assert.ok(measurements.contentHeight > 4 * 44 + 3 * measurements.gap + 2 * measurements.padding);
  assert.equal(getSaveRailLayout(measurements).mode, 'compact');
});

test('临界间距刚好够时居中，少于最小间距时紧凑', () => {
  const measurements = { sliceCenters: [26, 78.8], buttonHeights: [44, 44], gap: 8.8, padding: 4, contentHeight: 104.8 };
  assertCenteredRail(measurements, getSaveRailLayout(measurements));
  assert.equal(getSaveRailLayout({ ...measurements, sliceCenters: [26, 78.55] }).mode, 'compact');
  assert.equal(getSaveRailLayout({ ...measurements, contentHeight: 104.55 }).mode, 'compact');
});

test('按实际按钮高度及缩放后的图片尺寸重新判断', () => {
  const normal = railMeasurements([70, 70, 70]);
  assertCenteredRail(normal, getSaveRailLayout(normal));
  const wrapped = railMeasurements([100, 100, 100], [44, 68, 44]);
  assertCenteredRail(wrapped, getSaveRailLayout(wrapped));
  assert.equal(getSaveRailLayout({ ...normal, buttonHeights: [44, 108, 44] }).mode, 'compact');
  assert.equal(getSaveRailLayout(railMeasurements([35, 35, 35])).mode, 'compact');
  assertCenteredRail(normal, getSaveRailLayout(normal));
});

test('末片很高时用轨道内部留白补齐滚动范围，不增大外栏内边距', () => {
  const measurements = railMeasurements([70, 70, 3000]);
  const layout = getSaveRailLayout(measurements);
  assertCenteredRail(measurements, layout);
  assert.ok(layout.trailingSpace > 1000);
});

test('极矮图片的独立保存栏仍能完整显示换行后的按钮', () => {
  const measurements = railMeasurements([0.06, 0.06], [66, 66]);
  const layout = getSaveRailLayout(measurements);
  assert.equal(layout.mode, 'compact');
  assert.equal(layout.minimumHeight, 74, '保存栏最小高度应包含实际最高按钮及上下内边距');
  assert.match(component, /minHeight:\s*saveRailLayout\?\.minimumHeight/, '最小高度应传入独立两栏布局，不得修改单张图片的高度');
});

test('空白或暂不可测的布局安全回退，不产生无效留白', () => {
  const measurements = railMeasurements([70, 70]);
  for (const overrides of [
    { sliceCenters: [] },
    { sliceCenters: [NaN, 100] },
    { buttonHeights: [0, 44] },
    { buttonHeights: [44] },
    { contentHeight: Infinity },
    { gap: NaN },
  ]) {
    const layout = getSaveRailLayout({ ...measurements, ...overrides });
    assert.equal(layout.mode, 'compact');
    assert.ok(layout.margins.every((margin) => margin === 0));
  }
});
