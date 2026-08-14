import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCodexRollouts } from './run.ts';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function line(timestamp, type, payload, ordinal) {
  return JSON.stringify({ timestamp, ordinal, type, payload });
}

function usage(inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens = 0) {
  return { inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens };
}

function makeRollout({ id, cwd = '/Users/udon/project-costs', steps, day = '2026-08-14' }) {
  const rows = [
    line(`${day}T00:00:00.000Z`, 'session_meta', { id, cwd, originator: 'Codex Desktop' }, 1),
    line(`${day}T00:00:01.000Z`, 'event_msg', { type: 'task_started', turn_id: `${id}-turn` }, 2),
    line(`${day}T00:00:01.001Z`, 'turn_context', { turn_id: `${id}-turn`, model: steps[0].model, effort: 'medium' }, 3),
  ];
  let cumulative = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
  let ordinal = 4;

  for (const [index, step] of steps.entries()) {
    if (index > 0) {
      rows.push(
        line(`${day}T00:00:${String(1 + index).padStart(2, '0')}.000Z`, 'event_msg', {
          type: 'model_reroute',
          to_model: step.model,
        }, ordinal++),
      );
    }
    cumulative = {
      inputTokens: cumulative.inputTokens + step.delta.inputTokens,
      cachedInputTokens: cumulative.cachedInputTokens + step.delta.cachedInputTokens,
      outputTokens: cumulative.outputTokens + step.delta.outputTokens,
      reasoningOutputTokens: cumulative.reasoningOutputTokens + step.delta.reasoningOutputTokens,
    };
    rows.push(
      line(`${day}T00:00:${String(1 + index).padStart(2, '0')}.500Z`, 'event_msg', {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: cumulative.inputTokens,
            cached_input_tokens: cumulative.cachedInputTokens,
            output_tokens: cumulative.outputTokens,
            reasoning_output_tokens: cumulative.reasoningOutputTokens,
            total_tokens: cumulative.inputTokens + cumulative.outputTokens,
          },
        },
      }, ordinal++),
    );
  }

  rows.push(
    line(`${day}T00:00:10.000Z`, 'event_msg', {
      type: 'task_complete',
      turn_id: `${id}-turn`,
      duration_ms: 9000,
    }, ordinal),
  );
  return { path: `sessions/2026/08/14/rollout-${id}.jsonl`, text: rows.join('\n') };
}

function analyzeOne(model, tokenUsage) {
  return analyzeCodexRollouts(
    { rollouts: [makeRollout({ id: `single-${model}`, steps: [{ model, delta: tokenUsage }] })] },
    NOW,
  );
}

function assertAmount(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `expected ${expected}, got ${actual}`);
}

test('prices all three GPT-5.6 models at short and long context thresholds', () => {
  const shortCases = [
    ['gpt-5.6-sol', 5, 0.5, 30],
    ['gpt-5.6-terra', 2, 0.2, 12],
    ['gpt-5.6-luna', 0.2, 0.02, 1.2],
  ];
  const longCases = [
    ['gpt-5.6-sol', 10, 1, 45],
    ['gpt-5.6-terra', 4, 0.4, 18],
    ['gpt-5.6-luna', 0.4, 0.04, 1.8],
  ];

  for (const [model, inputRate, cachedRate, outputRate] of shortCases) {
    const result = analyzeOne(model, usage(272000, 72000, 1000));
    assert.equal(result.totals.cost.coverage, 'complete');
    assertAmount(result.totals.cost.amountUsd, (200000 * inputRate + 72000 * cachedRate + 1000 * outputRate) / 1000000);
  }
  for (const [model, inputRate, cachedRate, outputRate] of longCases) {
    const result = analyzeOne(model, usage(272001, 72000, 1000));
    assert.equal(result.totals.cost.coverage, 'complete');
    assertAmount(result.totals.cost.amountUsd, (200001 * inputRate + 72000 * cachedRate + 1000 * outputRate) / 1000000);
  }
});

test('uses only exact aliases and official dated snapshots', () => {
  const aliases = [
    ['gpt-5.6', 'gpt-5.6-sol', 10],
    ['gpt-5.5-2026-04-23', 'gpt-5.5', 5],
    ['gpt-5.4-2026-03-05', 'gpt-5.4', 2.5],
    ['gpt-5.2-2025-12-11', 'gpt-5.2', 1.75],
    ['gpt-5-2025-08-07', 'gpt-5', 1.25],
  ];
  for (const [inputModel, canonicalModel, inputRate] of aliases) {
    const result = analyzeOne(inputModel, usage(1000000, 0, 0));
    assert.equal(result.sessions[0].turns[0].requests[0].model, inputModel);
    assertAmount(result.totals.cost.amountUsd, inputRate);
    assert.deepEqual(result.totals.cost.unknownModels, []);
    assert.ok(result.pricingSnapshot);
    assert.equal(result.pricingSnapshot.serviceTier, 'Standard');
    assert.equal(result.pricingSnapshot.fetchedAt, '2026-08-14T11:58:31+08:00');
    assert.equal(canonicalModel.length > 0, true);
  }
});

test('does not infer prices from suffixes, dates, or model prefixes', () => {
  for (const model of ['gpt-5.6-sol-fast', 'gpt-5.6-sol-2026-08-14', 'gpt-5.6-sol-custom', 'gpt-5.3-codex-spark']) {
    const result = analyzeOne(model, usage(1000000, 0, 1000));
    assert.equal(result.totals.cost.amountUsd, null, model);
    assert.equal(result.totals.cost.coverage, 'unknown', model);
    assert.deepEqual(result.totals.cost.unknownModels, [model]);
  }
});

test('charges cached input once and ignores reasoning subset changes', () => {
  const cached = analyzeOne('gpt-5.3-codex', usage(1000000, 800000, 100000, 10));
  const changedReasoning = analyzeOne('gpt-5.3-codex', usage(1000000, 800000, 100000, 99999));
  const expected = (200000 * 1.75 + 800000 * 0.175 + 100000 * 14) / 1000000;
  assertAmount(cached.totals.cost.amountUsd, expected);
  assertAmount(changedReasoning.totals.cost.amountUsd, expected);
  assert.equal(cached.totals.cost.coverage, 'complete');
});

test('propagates request cost through turn, session, project, totals, model, and daily aggregates', () => {
  const known = makeRollout({
    id: 'known',
    steps: [
      { model: 'gpt-5.6-sol', delta: usage(1000000, 500000, 100000) },
      { model: 'gpt-5.6-luna', delta: usage(200000, 100000, 20000) },
    ],
  });
  const unknown = makeRollout({
    id: 'unknown',
    steps: [
      { model: 'gpt-zebra', delta: usage(1000, 0, 100) },
      { model: 'gpt-alpha', delta: usage(1000, 0, 100) },
      { model: 'gpt-zebra', delta: usage(1000, 0, 100) },
    ],
  });
  const result = analyzeCodexRollouts({ rollouts: [known, unknown] }, NOW);
  const knownSubtotal = 10.0 + 0.046;

  assert.equal(result.sessions.length, 2);
  assert.equal(result.projects.length, 1);
  assert.equal(result.sessions[0].turns[0].model, 'gpt-5.6-luna');
  assert.deepEqual(result.sessions[0].turns[0].requests.map((request) => request.model), ['gpt-5.6-sol', 'gpt-5.6-luna']);
  assert.equal(result.sessions[0].cost.coverage, 'complete');
  assertAmount(result.sessions[0].cost.amountUsd, knownSubtotal);
  assert.equal(result.sessions[1].cost.amountUsd, null);
  assert.equal(result.sessions[1].cost.coverage, 'unknown');

  const daily = result.dailyStats.find((day) => day.date === '2026-08-14');
  assert.ok(daily);
  for (const aggregate of [result.totals, result.projects[0].totals, daily]) {
    assert.equal(aggregate.cost.coverage, 'partial');
    assertAmount(aggregate.cost.amountUsd, knownSubtotal);
    assert.deepEqual(aggregate.cost.unknownModels, ['gpt-alpha', 'gpt-zebra']);
  }

  const sol = result.modelStats.find((stat) => stat.model === 'gpt-5.6-sol');
  const luna = result.modelStats.find((stat) => stat.model === 'gpt-5.6-luna');
  const zebra = result.modelStats.find((stat) => stat.model === 'gpt-zebra');
  assert.ok(sol && luna && zebra);
  assertAmount(sol.cost.amountUsd, 10.0);
  assertAmount(luna.cost.amountUsd, 0.046);
  assert.equal(zebra.cost.amountUsd, null);
  assert.deepEqual(zebra.cost.unknownModels, ['gpt-zebra']);

  const serialized = JSON.parse(JSON.stringify(result));
  assert.deepEqual(serialized.pricingSnapshot, result.pricingSnapshot);
  assert.deepEqual(serialized.totals.cost, result.totals.cost);
  assert.deepEqual(serialized.dailyStats.find((day) => day.date === '2026-08-14').cost, result.dailyStats.find((day) => day.date === '2026-08-14').cost);
});

test('empty usage is a neutral zero and unknown-only totals never render as zero', () => {
  const empty = analyzeCodexRollouts(
    { rollouts: [makeRollout({ id: 'empty', steps: [{ model: 'gpt-5.6-sol', delta: usage(0, 0, 0) }] })] },
    NOW,
  );
  assert.deepEqual(empty.totals.cost, { amountUsd: 0, coverage: 'complete', unknownModels: [] });

  const unknown = analyzeOne('not-an-official-model', usage(1, 0, 0));
  assert.equal(unknown.totals.cost.amountUsd, null);
  assert.notEqual(unknown.totals.cost.amountUsd, 0);
});

test('daily aggregation preserves unknown-only, partial, and neutral costs independently by date', () => {
  const known = makeRollout({
    id: 'daily-known',
    day: '2026-08-14',
    steps: [{ model: 'gpt-5.6-sol', delta: usage(1000000, 500000, 100000) }],
  });
  const unknown = makeRollout({
    id: 'daily-unknown',
    day: '2026-08-14',
    steps: [{ model: 'gpt-daily-unknown', delta: usage(1000, 0, 100) }],
  });
  const unknownOnly = makeRollout({
    id: 'daily-unknown-only',
    day: '2026-08-13',
    steps: [{ model: 'gpt-daily-only', delta: usage(1000, 0, 100) }],
  });

  const result = analyzeCodexRollouts({ rollouts: [known, unknown, unknownOnly] }, NOW);
  const daily = new Map(result.dailyStats.map((day) => [day.date, day]));
  const knownAndUnknownDay = daily.get('2026-08-14');
  const unknownOnlyDay = daily.get('2026-08-13');
  const emptyDay = daily.get('2026-08-12');

  assert.ok(knownAndUnknownDay && unknownOnlyDay && emptyDay);
  assert.equal(knownAndUnknownDay.cost.coverage, 'partial');
  assertAmount(knownAndUnknownDay.cost.amountUsd, 10);
  assert.deepEqual(knownAndUnknownDay.cost.unknownModels, ['gpt-daily-unknown']);

  assert.equal(unknownOnlyDay.cost.amountUsd, null);
  assert.equal(unknownOnlyDay.cost.coverage, 'unknown');
  assert.deepEqual(unknownOnlyDay.cost.unknownModels, ['gpt-daily-only']);

  assert.deepEqual(emptyDay.cost, { amountUsd: 0, coverage: 'complete', unknownModels: [] });
});
