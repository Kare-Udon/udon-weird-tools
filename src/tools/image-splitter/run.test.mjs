import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImageSplitterError, run } from './run.ts';

test('vertical equal splitting uses integer floor cuts and exact coverage', () => {
  const result = run({
    width: 10,
    height: 4,
    direction: 'vertical',
    count: 3,
    mode: 'equal',
  });

  assert.deepEqual(result.cuts, [3, 6]);
  assert.deepEqual(result.slices, [
    { index: 0, x: 0, y: 0, width: 3, height: 4 },
    { index: 1, x: 3, y: 0, width: 3, height: 4 },
    { index: 2, x: 6, y: 0, width: 4, height: 4 },
  ]);
  assertPartition(result);
});

test('horizontal equal splitting maps cuts to y and preserves remainder order', () => {
  const result = run({
    width: 5,
    height: 10,
    direction: 'horizontal',
    count: 4,
    mode: 'equal',
  });

  assert.deepEqual(result.cuts, [2, 5, 7]);
  assert.deepEqual(result.slices, [
    { index: 0, x: 0, y: 0, width: 5, height: 2 },
    { index: 1, x: 0, y: 2, width: 5, height: 3 },
    { index: 2, x: 0, y: 5, width: 5, height: 2 },
    { index: 3, x: 0, y: 7, width: 5, height: 3 },
  ]);
  assertPartition(result);
});

test('every valid count and a range of axis lengths form ordered, non-overlapping partitions', () => {
  for (const direction of ['vertical', 'horizontal']) {
    for (let axisLength = 2; axisLength <= 65; axisLength += 1) {
      const maxCount = Math.min(32, axisLength);

      for (let count = 2; count <= maxCount; count += 1) {
        const result = run({
          width: direction === 'vertical' ? axisLength : 17,
          height: direction === 'vertical' ? 17 : axisLength,
          direction,
          count,
          mode: 'equal',
        });

        assert.equal(result.count, count);
        assert.equal(result.cuts.length, count - 1);
        assertPartition(result);
      }
    }
  }
});

test('free cuts are retained exactly while rectangles follow the selected direction', () => {
  const vertical = run({
    width: 11,
    height: 7,
    direction: 'vertical',
    count: 4,
    mode: 'free',
    cuts: [1, 6, 9],
  });
  const horizontal = run({
    width: 7,
    height: 11,
    direction: 'horizontal',
    count: 4,
    mode: 'free',
    cuts: [1, 6, 9],
  });

  assert.deepEqual(vertical.cuts, [1, 6, 9]);
  assert.deepEqual(horizontal.cuts, [1, 6, 9]);
  assertPartition(vertical);
  assertPartition(horizontal);
});

test('deterministic pseudo-random ordered free cuts preserve coverage for both directions and all counts', () => {
  const axisLength = 97;

  for (const direction of ['vertical', 'horizontal']) {
    for (let count = 2; count <= 32; count += 1) {
      const cuts = createPseudoRandomCuts(axisLength, count, count * 17 + direction.length);
      const result = run({
        width: direction === 'vertical' ? axisLength : 19,
        height: direction === 'vertical' ? 19 : axisLength,
        direction,
        count,
        mode: 'free',
        cuts,
      });

      assert.deepEqual(result.cuts, cuts);
      assertPartition(result);
    }
  }
});

test('rejects unsafe dimensions and keeps exact one-pixel remainder spread at the largest safe axis', () => {
  for (const unsafeWidth of [Number.MAX_VALUE, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => run({
        width: unsafeWidth,
        height: 3,
        direction: 'vertical',
        count: 3,
        mode: 'equal',
      }),
      (error) => error instanceof ImageSplitterError && error.code === 'invalid-dimensions',
    );
  }

  const axisLength = Number.MAX_SAFE_INTEGER;
  const expectedCuts = [
    1501199875790165,
    3002399751580330,
    4503599627370495,
    6004799503160660,
    7505999378950825,
  ];

  for (const direction of ['vertical', 'horizontal']) {
    const result = run({
      width: direction === 'vertical' ? axisLength : 3,
      height: direction === 'vertical' ? 3 : axisLength,
      direction,
      count: 6,
      mode: 'equal',
    });
    const sizes = result.slices.map((slice) => (direction === 'vertical' ? slice.width : slice.height));

    assert.deepEqual(result.cuts, expectedCuts);
    assert.equal(Math.max(...sizes) - Math.min(...sizes), 1);
    assertPartition(result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
});

test('run output is JSON-serializable and does not contain zero-sized slices', () => {
  const result = run({
    width: 2,
    height: 3,
    direction: 'vertical',
    count: 2,
    mode: 'equal',
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.ok(result.slices.every((slice) => slice.width > 0 && slice.height > 0));
});

test('a one-pixel split axis is rejected instead of producing an empty or zero-pixel slice', () => {
  for (const direction of ['vertical', 'horizontal']) {
    assert.throws(
      () => run({
        width: direction === 'vertical' ? 1 : 8,
        height: direction === 'vertical' ? 8 : 1,
        direction,
        count: 2,
        mode: 'equal',
      }),
      (error) => error instanceof ImageSplitterError && error.code === 'axis-too-short',
    );
  }
});

test('invalid dimensions, direction, count, mode, and free cuts expose stable error codes', () => {
  const base = {
    width: 10,
    height: 10,
    direction: 'vertical',
    count: 3,
    mode: 'equal',
  };
  const cases = [
    [{ ...base, width: 0 }, 'invalid-dimensions'],
    [{ ...base, height: 2.5 }, 'invalid-dimensions'],
    [{ ...base, direction: 'diagonal' }, 'invalid-direction'],
    [{ ...base, count: 1 }, 'invalid-count'],
    [{ ...base, count: 33 }, 'invalid-count'],
    [{ ...base, mode: 'fixed' }, 'invalid-mode'],
    [{ ...base, mode: 'free' }, 'missing-cuts'],
    [{ ...base, mode: 'free', cuts: [3] }, 'cut-count-mismatch'],
    [{ ...base, mode: 'free', cuts: [3, 3] }, 'cuts-not-ordered'],
    [{ ...base, mode: 'free', cuts: [3.5, 7] }, 'cuts-not-integer'],
    [{ ...base, mode: 'free', cuts: [0, 7] }, 'cuts-out-of-range'],
    [{ ...base, mode: 'free', cuts: [3, 11] }, 'cuts-out-of-range'],
    [{ ...base, mode: 'free', cuts: [7, 3] }, 'cuts-not-ordered'],
    [{ ...base, count: 11 }, 'count-exceeds-axis'],
  ];

  for (const [input, code] of cases) {
    assert.throws(
      () => run(input),
      (error) => error instanceof ImageSplitterError && error.code === code,
      `expected ${code}`,
    );
  }
});

function assertPartition(result) {
  const axisLength = result.direction === 'vertical' ? result.width : result.height;
  let cursor = 0;

  assert.equal(result.slices.length, result.count);
  assert.equal(result.cuts.length, result.count - 1);
  assert.deepEqual(result.cuts, result.cuts.toSorted((left, right) => left - right));

  for (const [index, slice] of result.slices.entries()) {
    assert.equal(slice.index, index);
    assert.ok(Number.isInteger(slice.x));
    assert.ok(Number.isInteger(slice.y));
    assert.ok(Number.isInteger(slice.width));
    assert.ok(Number.isInteger(slice.height));
    assert.ok(slice.width > 0);
    assert.ok(slice.height > 0);

    if (result.direction === 'vertical') {
      assert.equal(slice.y, 0);
      assert.equal(slice.height, result.height);
      assert.equal(slice.x, cursor);
      cursor += slice.width;
    } else {
      assert.equal(slice.x, 0);
      assert.equal(slice.width, result.width);
      assert.equal(slice.y, cursor);
      cursor += slice.height;
    }
  }

  assert.equal(cursor, axisLength);
}

function createPseudoRandomCuts(axisLength, count, seed) {
  const positions = Array.from({ length: axisLength - 1 }, (_, index) => index + 1);

  for (let index = positions.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [positions[index], positions[swapIndex]] = [positions[swapIndex], positions[index]];
  }

  return positions.slice(0, count - 1).toSorted((left, right) => left - right);
}
