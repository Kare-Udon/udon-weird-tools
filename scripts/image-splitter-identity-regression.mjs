import { pathToFileURL } from 'node:url';

/**
 * 这个脚本不依赖浏览器自动化库。通过 Codex CUA 的 tab.capabilities.cdp
 * 执行 createProbeExpression()/createReadExpression()，再按 regressionSteps
 * 进行真实文件选择、键盘输入和鼠标拖动。
 */

const probeExpression = String.raw`(() => {
  window.__imageSplitterIdentityRegression?.cleanup?.();
  const state = {
    events: [],
    firstSlider: document.querySelector('[role="slider"]'),
    firstTrack: document.querySelector('.image-splitter-slider-track'),
    firstHandle: document.querySelector('[data-cut-line="true"]'),
    cleanup: null,
  };
  const describe = (node) => node?.matches?.('[data-cut-line="true"]') ? 'cut-handle' : node?.getAttribute?.('role') ?? node?.className ?? node?.tagName ?? null;
  const cuts = () => [...document.querySelectorAll('[role="slider"]')].map((node) => node.getAttribute('aria-valuenow'));
  const record = (phase, event) => {
    const target = event.target;
    const firstSlider = state.firstSlider;
    const firstTrack = state.firstTrack;
    const firstHandle = state.firstHandle;
    const pointerTargetIsHandle = target?.closest?.('[data-cut-line="true"]');
    const first = event.pointerId != null ? (pointerTargetIsHandle ? firstHandle : firstTrack) : firstSlider;
    state.events.push({
      phase,
      type: event.type,
      key: event.key ?? null,
      pointerId: event.pointerId ?? null,
      target: describe(target),
      targetIndex: target?.getAttribute?.('data-slider-index') ?? null,
      targetConnected: target?.isConnected ?? null,
      sameAsFirst: target === first,
      firstSliderConnected: firstSlider?.isConnected ?? null,
      firstTrackConnected: firstTrack?.isConnected ?? null,
      firstHandleConnected: firstHandle?.isConnected ?? null,
      firstHasCapture: first && event.pointerId != null ? first.hasPointerCapture(event.pointerId) : null,
      active: describe(document.activeElement),
      activeIndex: document.activeElement?.getAttribute?.('data-slider-index') ?? null,
      activeSameAsFirstSlider: document.activeElement === firstSlider,
      cuts: cuts(),
    });
  };
  const eventTypes = [
    'focusin', 'focusout', 'keydown',
    'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture',
  ];
  const listeners = new Map(eventTypes.map((type) => [type, (event) => record('event', event)]));
  for (const [type, listener] of listeners) document.addEventListener(type, listener, true);
  const observer = new MutationObserver(() => state.events.push({
    phase: 'mutation',
    type: 'childList',
    firstSliderConnected: state.firstSlider?.isConnected ?? null,
    firstTrackConnected: state.firstTrack?.isConnected ?? null,
    firstHandleConnected: state.firstHandle?.isConnected ?? null,
    active: describe(document.activeElement),
    activeIndex: document.activeElement?.getAttribute?.('data-slider-index') ?? null,
    activeSameAsFirstSlider: document.activeElement === state.firstSlider,
    cuts: cuts(),
  }));
  observer.observe(document.querySelector('main') ?? document.body, { subtree: true, childList: true });
  state.cleanup = () => {
    for (const [type, listener] of listeners) document.removeEventListener(type, listener, true);
    observer.disconnect();
  };
  window.__imageSplitterIdentityRegression = state;
  return {
    firstSliderConnected: state.firstSlider?.isConnected ?? false,
    firstTrackConnected: state.firstTrack?.isConnected ?? false,
    firstHandleConnected: state.firstHandle?.isConnected ?? false,
    initialCuts: cuts(),
  };
})()`;

const readExpression = String.raw`(() => {
  const state = window.__imageSplitterIdentityRegression;
  if (!state) throw new Error('identity regression probe is not installed');
  return {
    events: state.events.splice(0),
    current: {
      active: document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName,
      activeIndex: document.activeElement?.getAttribute('data-slider-index') ?? null,
      cuts: [...document.querySelectorAll('[role="slider"]')].map((node) => node.getAttribute('aria-valuenow')),
      sliderCount: document.querySelectorAll('[role="slider"]').length,
      firstSliderConnected: state.firstSlider?.isConnected ?? false,
      firstTrackConnected: state.firstTrack?.isConnected ?? false,
      firstHandleConnected: state.firstHandle?.isConnected ?? false,
    },
  };
})()`;

const cleanupExpression = String.raw`(() => {
  window.__imageSplitterIdentityRegression?.cleanup?.();
  delete window.__imageSplitterIdentityRegression;
  return true;
})()`;

export function createProbeExpression() {
  return probeExpression;
}

export function createReadExpression() {
  return readExpression;
}

export function createCleanupExpression() {
  return cleanupExpression;
}

export const regressionSteps = Object.freeze([
  '打开 /zh-CN/tools/image-splitter，上传一张 1200×900 的测试 PNG（本地样本为 .dev-runtime/image-splitter/qa/fixtures/layout-4x3.png），切换到“自由切分”。',
  '通过 CDP Runtime.evaluate 执行 createProbeExpression()，记录初始 slider 和 track。',
  '真实聚焦第一条 slider，发送一次 ArrowRight；执行 createReadExpression()。修复后旧 slider 必须仍 isConnected、activeIndex 仍为 0、值增加 1。',
  '在不重新聚焦的情况下再发送两次 ArrowRight；再次读取。read 会取走已记录事件，需合并两次读取的 events 并使用最后的 current，再调用 assertGreenKeyboardTrace；三次输入都必须作用于同一个 slider。',
  '重新加载并选择同一合成图，切换自由模式；重新安装 probe。对第一条 slider 执行一次 pointerdown 后至少五次连续 pointermove，再 pointerup；每次 move 都必须命中同一 track 并保持 hasPointerCapture。',
  '再重复一次把指针拖出轨道的多步拖动；pointerup 之前仍必须保持同一 track 的 capture，结束后才允许 lostpointercapture。',
  '重复上述 pointer 步骤，但从真实片缝 cut-handle 开始，纵向与横向各一次；每次 move 都必须保持原 handle connected/capture。',
  '通过 createCleanupExpression() 清理 probe；将两轮 read 结果与源码版本保存到 .dev-runtime/image-splitter/qa/identity-fix/。',
]);

export function assertGreenKeyboardTrace(trace) {
  const keydowns = trace.events.filter((event) => event.type === 'keydown' && event.key === 'ArrowRight');
  if (keydowns.length < 3) throw new Error(`键盘回归需要至少 3 次 ArrowRight，实际 ${keydowns.length} 次`);
  if (!keydowns.every((event) => event.target === 'slider' && event.targetConnected && event.activeSameAsFirstSlider)) {
    throw new Error('连续键盘输入没有保持同一个 slider 的 DOM identity/focus');
  }
  if (trace.current.active !== 'slider' || trace.current.activeIndex !== '0') {
    throw new Error('连续键盘输入结束后焦点没有留在第一条 slider');
  }
  if (trace.current.cuts.length < 2 || Number(trace.current.cuts[0]) <= Number(keydowns[0].cuts[0])) {
    throw new Error('连续键盘输入没有推进第一条切线');
  }
  return { keydownCount: keydowns.length, finalCuts: trace.current.cuts };
}

export function assertGreenPointerTrace(trace, { target = 'group', connectedField = 'firstTrackConnected' } = {}) {
  const downIndex = trace.events.findIndex((event) => event.type === 'pointerdown');
  const down = downIndex >= 0 ? trace.events[downIndex] : null;
  const postDownEvents = downIndex >= 0 ? trace.events.slice(downIndex + 1) : [];
  const moves = postDownEvents.filter((event) => event.type === 'pointermove');
  if (!down || moves.length < 5) throw new Error(`pointer 回归需要 1 次 pointerdown 和至少 5 次 pointermove，实际 ${moves.length} 次`);
  const firstLostCaptureIndex = postDownEvents.findIndex((event) => event.type === 'lostpointercapture');
  const firstMoveIndex = postDownEvents.findIndex((event) => event.type === 'pointermove' && event.sameAsFirst);
  const lastMoveIndex = postDownEvents.reduce((last, event, index) => event.type === 'pointermove' ? index : last, -1);
  if (!moves.every((event) => event.target === target && event.targetConnected && event[connectedField] && event.firstHasCapture)) {
    throw new Error('多步 pointermove 没有保持同一 track 的 DOM identity 或 pointer capture');
  }
  if (firstLostCaptureIndex >= 0 && firstLostCaptureIndex < lastMoveIndex) {
    throw new Error('pointer capture 在最后一次 pointermove 之前丢失');
  }
  if (firstMoveIndex < 0) throw new Error('没有观察到捕获到原始 track 的 pointermove');
  return { pointerDownCount: 1, pointerMoveCount: moves.length, lostCaptureAfterMoves: firstLostCaptureIndex < 0 || firstLostCaptureIndex > lastMoveIndex };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? '--steps';
  if (mode === '--probe') process.stdout.write(`${probeExpression}\n`);
  else if (mode === '--read') process.stdout.write(`${readExpression}\n`);
  else if (mode === '--cleanup') process.stdout.write(`${cleanupExpression}\n`);
  else process.stdout.write(`${regressionSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n`);
}
