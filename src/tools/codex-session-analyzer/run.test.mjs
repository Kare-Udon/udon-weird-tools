import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeCodexRollouts } from './run.ts';

function line(timestamp, type, payload, ordinal) {
  return JSON.stringify({ timestamp, ordinal, type, payload });
}

const now = new Date('2026-07-11T12:00:00.000Z');

test('uses cumulative token deltas, deduplicates repeated snapshots, and pairs tools', () => {
  const rollout = [
    line('2026-07-11T00:00:00.000Z', 'session_meta', {
      id: 'thread-1',
      cwd: '/Users/udon/project-alpha',
      originator: 'Codex Desktop',
      cli_version: '0.144.0-alpha.4',
    }, 1),
    line('2026-07-11T00:00:10.000Z', 'event_msg', {
      type: 'task_started',
      turn_id: 'turn-1',
    }, 2),
    line('2026-07-11T00:00:10.001Z', 'turn_context', {
      turn_id: 'turn-1',
      model: 'gpt-5.6-luna',
      effort: 'medium',
    }, 3),
    line('2026-07-11T00:00:10.100Z', 'event_msg', {
      type: 'user_message',
      message: 'Implement the dashboard',
    }, 4),
    line('2026-07-11T00:00:12.000Z', 'response_item', {
      type: 'function_call',
      name: 'exec_command',
      call_id: 'shell-1',
      arguments: '{}',
    }, 5),
    line('2026-07-11T00:00:13.000Z', 'response_item', {
      type: 'function_call_output',
      call_id: 'shell-1',
      output: 'Process exited with code 0',
    }, 6),
    line('2026-07-11T00:00:14.000Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 1000,
          cached_input_tokens: 800,
          output_tokens: 100,
          reasoning_output_tokens: 60,
          total_tokens: 1100,
        },
      },
    }, 7),
    line('2026-07-11T00:00:15.000Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 1000,
          cached_input_tokens: 800,
          output_tokens: 100,
          reasoning_output_tokens: 60,
          total_tokens: 1100,
        },
      },
    }, 8),
    line('2026-07-11T00:00:15.500Z', 'response_item', {
      type: 'function_call',
      name: 'js',
      call_id: 'mcp-1',
      arguments: '{}',
    }, 9),
    line('2026-07-11T00:00:16.000Z', 'response_item', {
      type: 'function_call_output',
      call_id: 'mcp-1',
      output: '{}',
    }, 10),
    line('2026-07-11T00:00:16.000Z', 'event_msg', {
      type: 'mcp_tool_call_end',
      call_id: 'mcp-1',
      invocation: {
        server: 'node_repl',
        tool: 'js',
        arguments: {},
      },
      duration: {
        secs: 0,
        nanos: 500000000,
      },
      result: { Ok: {} },
    }, 11),
    line('2026-07-11T00:00:18.000Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 1500,
          cached_input_tokens: 1200,
          output_tokens: 160,
          reasoning_output_tokens: 90,
          total_tokens: 1660,
        },
      },
    }, 12),
    line('2026-07-11T00:00:20.000Z', 'event_msg', {
      type: 'task_complete',
      turn_id: 'turn-1',
      completed_at: '2026-07-11T00:00:20.000Z',
      duration_ms: 10000,
      time_to_first_token_ms: 900,
    }, 13),
  ].join('\n');

  const result = analyzeCodexRollouts(
    {
      rollouts: [{ path: 'sessions/2026/07/11/rollout-thread-1.jsonl', text: rollout }],
      sessionIndexText: JSON.stringify({
        id: 'thread-1',
        thread_name: 'Dashboard implementation',
        updated_at: '2026-07-11T00:00:20.000Z',
      }),
      options: { lookbackDays: 7 },
    },
    now,
  );

  assert.equal(result.totals.projectCount, 1);
  assert.equal(result.totals.sessionCount, 1);
  assert.equal(result.totals.turnCount, 1);
  assert.equal(result.totals.requestCount, 2);
  assert.equal(result.totals.toolCallCount, 2);
  assert.deepEqual(result.totals.usage, {
    inputTokens: 1500,
    cachedInputTokens: 1200,
    uncachedInputTokens: 300,
    outputTokens: 160,
    reasoningOutputTokens: 90,
    totalTokens: 1660,
  });

  const session = result.sessions[0];
  assert.equal(session.title, 'Dashboard implementation');
  assert.equal(session.projectName, 'project-alpha');
  assert.equal(session.turns[0].timeToFirstTokenMs, 900);

  const requests = session.turns[0].requests;
  assert.equal(requests[0].generationDurationMs, 3000);
  assert.equal(requests[1].generationDurationMs, 3500);
  assert.ok(Math.abs(requests[0].outputTokensPerSecond - 100 / 3) < 0.001);
  assert.ok(Math.abs(requests[1].outputTokensPerSecond - 60 / 3.5) < 0.001);

  const shell = session.turns[0].tools.find((tool) => tool.id === 'shell-1');
  const mcp = session.turns[0].tools.find((tool) => tool.id === 'mcp-1');
  assert.deepEqual(
    { name: shell.name, category: shell.category, durationMs: shell.durationMs, success: shell.success },
    { name: 'exec_command', category: 'shell', durationMs: 1000, success: true },
  );
  assert.deepEqual(
    { name: mcp.name, category: mcp.category, durationMs: mcp.durationMs, success: mcp.success },
    { name: 'node_repl.js', category: 'mcp', durationMs: 500, success: true },
  );
});

test('filters archived subagent sessions and counts malformed JSON without failing', () => {
  const rollout = [
    line('2026-07-10T00:00:00.000Z', 'session_meta', {
      id: 'subagent-thread',
      parent_thread_id: 'parent-thread',
      cwd: '/Users/udon/project-beta',
      source: { subagent: { other: 'guardian' } },
    }, 1),
    '{not-json',
    line('2026-07-10T00:00:01.000Z', 'event_msg', {
      type: 'task_started',
      turn_id: 'turn-subagent',
    }, 2),
    line('2026-07-10T00:00:02.000Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          output_tokens: 20,
          reasoning_output_tokens: 10,
        },
      },
    }, 3),
    line('2026-07-10T00:00:03.000Z', 'event_msg', {
      type: 'task_complete',
      turn_id: 'turn-subagent',
      duration_ms: 2000,
    }, 4),
  ].join('\n');

  const included = analyzeCodexRollouts(
    {
      rollouts: [{ path: 'archived_sessions/2026/07/10/rollout-subagent-thread.jsonl', text: rollout }],
      options: { lookbackDays: 7, includeArchived: true, includeSubagents: true },
    },
    now,
  );
  assert.equal(included.totals.sessionCount, 1);
  assert.equal(included.parseIssueCount, 1);
  assert.equal(included.sessions[0].isSubagent, true);
  assert.equal(included.sessions[0].archived, true);

  const excluded = analyzeCodexRollouts(
    {
      rollouts: [{ path: 'archived_sessions/2026/07/10/rollout-subagent-thread.jsonl', text: rollout }],
      options: { lookbackDays: 7, includeArchived: false, includeSubagents: false },
    },
    now,
  );
  assert.equal(excluded.totals.sessionCount, 0);
  assert.equal(excluded.skippedFileCount, 1);
});

test('ignores replayed parent history in forked session files', () => {
  const rollout = [
    line('2026-07-11T01:00:00.000Z', 'session_meta', {
      id: 'fork-thread',
      parent_thread_id: 'parent-thread',
      cwd: '/Users/udon/project-fork',
      source: 'fork',
    }, 1),
    line('2026-07-11T01:00:00.001Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 10000,
          cached_input_tokens: 9000,
          output_tokens: 1000,
          reasoning_output_tokens: 500,
        },
      },
    }, 2),
    line('2026-07-11T01:00:00.002Z', 'event_msg', {
      type: 'task_started',
      turn_id: 'replayed-turn',
    }, 3),
    line('2026-07-11T01:00:00.003Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 20000,
          cached_input_tokens: 18000,
          output_tokens: 2000,
          reasoning_output_tokens: 1000,
        },
      },
    }, 4),
    line('2026-07-11T01:00:00.010Z', 'event_msg', {
      type: 'task_started',
      turn_id: 'native-turn',
    }, 5),
    line('2026-07-11T01:00:00.020Z', 'turn_context', {
      turn_id: 'native-turn',
      model: 'gpt-5.6-sol',
      effort: 'high',
    }, 6),
    line('2026-07-11T01:00:02.010Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 20500,
          cached_input_tokens: 18400,
          output_tokens: 2100,
          reasoning_output_tokens: 1060,
        },
      },
    }, 7),
    line('2026-07-11T01:00:03.010Z', 'event_msg', {
      type: 'task_complete',
      turn_id: 'native-turn',
      duration_ms: 3000,
    }, 8),
  ].join('\n');

  const result = analyzeCodexRollouts(
    {
      rollouts: [{ path: 'sessions/2026/07/11/rollout-fork-thread.jsonl', text: rollout }],
      options: { lookbackDays: 7, includeSubagents: true },
    },
    now,
  );

  assert.equal(result.totals.sessionCount, 1);
  assert.equal(result.totals.turnCount, 1);
  assert.equal(result.totals.requestCount, 1);
  assert.equal(result.sessions[0].isSubagent, false);
  assert.equal(result.sessions[0].turns[0].id, 'native-turn');
  assert.equal(result.sessions[0].turns[0].model, 'gpt-5.6-sol');
  assert.deepEqual(result.totals.usage, {
    inputTokens: 500,
    cachedInputTokens: 400,
    uncachedInputTokens: 100,
    outputTokens: 100,
    reasoningOutputTokens: 60,
    totalTokens: 600,
  });
});
