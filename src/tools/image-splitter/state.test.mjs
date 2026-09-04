import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createImageSplitterState,
  moveImageSplitterCuts,
  moveImageSplitterCut,
  resetImageSplitterState,
  setImageSplitterCount,
  setImageSplitterDirection,
  setImageSplitterMode,
  setImageSplitterSource,
  setImageSplitterSymmetric,
  toImageSplitterInput,
} from './state.ts';

const wideSource = { key: 'wide-image', width: 100, height: 80 };

test('initial state and reset use vertical, three, equal, and symmetry off defaults', () => {
  const initial = createImageSplitterState();

  assert.deepEqual(initial, {
    source: null,
    direction: 'vertical',
    count: 3,
    mode: 'equal',
    symmetric: false,
    cuts: [],
    rememberedFreeCuts: null,
    status: 'no-source',
  });
  assert.equal(toImageSplitterInput(initial), null);
  assert.deepEqual(resetImageSplitterState(), initial);
});

test('a source initializes equal cuts, and conversion omits cuts for equal mode', () => {
  const state = createImageSplitterState(wideSource);

  assert.equal(state.status, 'ready');
  assert.deepEqual(state.cuts, [33, 66]);
  assert.deepEqual(toImageSplitterInput(state), {
    width: 100,
    height: 80,
    direction: 'vertical',
    count: 3,
    mode: 'equal',
  });
});

test('equal to free to equal to free restores only the current source/direction/count free position', () => {
  let state = createImageSplitterState(wideSource);
  state = setImageSplitterMode(state, 'free');

  const moved = moveImageSplitterCut(state, 0, 20);
  assert.equal(moved.status, 'moved');
  state = moved.state;
  assert.deepEqual(state.cuts, [20, 66]);

  state = setImageSplitterMode(state, 'equal');
  assert.deepEqual(state.cuts, [33, 66]);
  assert.deepEqual(state.rememberedFreeCuts, [20, 66]);

  state = setImageSplitterMode(state, 'free');
  assert.deepEqual(state.cuts, [20, 66]);
  assert.deepEqual(toImageSplitterInput(state), {
    width: 100,
    height: 80,
    direction: 'vertical',
    count: 3,
    mode: 'free',
    cuts: [20, 66],
  });
});

test('changing source, direction, or count reinitializes equal cuts and does not reuse old free positions', () => {
  let state = setImageSplitterMode(createImageSplitterState(wideSource), 'free');
  state = moveImageSplitterCut(state, 0, 20).state;

  state = setImageSplitterSource(state, { key: 'new-image', width: 60, height: 40 });
  assert.equal(state.mode, 'free');
  assert.deepEqual(state.cuts, [20, 40]);
  assert.equal(state.rememberedFreeCuts, null);

  state = setImageSplitterDirection(state, 'horizontal');
  assert.deepEqual(state.cuts, [13, 26]);
  assert.equal(state.rememberedFreeCuts, null);

  state = setImageSplitterCount(state, 4);
  assert.deepEqual(state.cuts, [10, 20, 30]);
  assert.equal(state.rememberedFreeCuts, null);
});

test('count is clamped to the valid range and to the active split axis', () => {
  let state = createImageSplitterState({ key: 'short', width: 2, height: 10 });
  assert.equal(state.count, 2);
  assert.deepEqual(state.cuts, [1]);

  state = setImageSplitterCount(state, 100);
  assert.equal(state.count, 2);
  assert.deepEqual(state.cuts, [1]);

  state = setImageSplitterSource(state, { key: 'long', width: 100, height: 10 });
  state = setImageSplitterCount(state, 100);
  assert.equal(state.count, 32);
  assert.equal(state.cuts.length, 31);
});

test('a one-pixel active axis reports an error without generating cuts, then recovers after direction change', () => {
  let state = createImageSplitterState({ key: 'tall', width: 1, height: 80 });

  assert.equal(state.status, 'axis-too-short');
  assert.deepEqual(state.cuts, []);
  assert.equal(moveImageSplitterCut(state, 0, 1).status, 'axis-too-short');

  state = setImageSplitterDirection(state, 'horizontal');
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.cuts, [26, 53]);
});

test('toggling symmetry does not move current cuts, while paired movement updates both sides atomically', () => {
  let state = createImageSplitterState({ key: 'symmetric', width: 100, height: 50 }, { count: 5, mode: 'free' });
  state = moveImageSplitterCut(state, 0, 15).state;
  const cutsBeforeToggle = [...state.cuts];
  state = setImageSplitterSymmetric(state, true);

  assert.deepEqual(state.cuts, cutsBeforeToggle);
  const moved = moveImageSplitterCut(state, 0, 15);
  assert.equal(moved.status, 'moved');
  assert.deepEqual(moved.state.cuts, [15, 40, 60, 85]);
});

test('the middle cut of an odd number of cuts moves independently under symmetry', () => {
  const state = setImageSplitterSymmetric(
    createImageSplitterState({ key: 'middle', width: 100, height: 50 }, { count: 4, mode: 'free' }),
    true,
  );
  const moved = moveImageSplitterCut(state, 1, 47);

  assert.equal(moved.status, 'moved');
  assert.deepEqual(moved.state.cuts, [25, 47, 75]);
});

test('a symmetric pair with no shared legal interval remains unchanged and returns one status code', () => {
  const result = moveImageSplitterCuts([10, 20, 30, 40], 100, 1, 25, true);

  assert.equal(result.status, 'symmetric-no-solution');
  assert.equal(result.changed, false);
  assert.deepEqual(result.cuts, [10, 20, 30, 40]);
  assert.deepEqual(result.movedIndices, []);
});

test('symmetric movement clamps to the intersection of both neighboring legal ranges', () => {
  const result = moveImageSplitterCuts([10, 20, 80, 90], 100, 1, 60, true);

  assert.equal(result.status, 'clamped');
  assert.equal(result.changed, true);
  assert.deepEqual(result.cuts, [10, 49, 51, 90]);
  assert.deepEqual(result.movedIndices, [1, 2]);
});
