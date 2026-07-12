import type { ToolRunContext } from '../_types';

export const CODEX_ANALYZER_TOOL_SLUG = 'codex-session-analyzer';

export type CodexAnalyzerOptions = {
  lookbackDays: number;
  includeArchived: boolean;
  includeSubagents: boolean;
};

export type CodexRolloutSource = {
  path: string;
  text: string;
  lastModified?: number;
};

export type CodexAnalyzerInput = {
  rollouts: CodexRolloutSource[];
  sessionIndexText?: string;
  options?: Partial<CodexAnalyzerOptions>;
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type ModelRequestAnalysis = {
  id: string;
  index: number;
  model: string;
  startedAt: string | null;
  completedAt: string;
  cycleDurationMs: number | null;
  toolBusyDurationMs: number;
  generationDurationMs: number | null;
  outputTokensPerSecond: number | null;
  usage: TokenUsage;
  timingKind: 'estimated';
};

export type ToolCategory =
  | 'shell'
  | 'mcp'
  | 'web'
  | 'patch'
  | 'collaboration'
  | 'plan'
  | 'image'
  | 'interaction'
  | 'other';

export type ToolCallAnalysis = {
  id: string;
  name: string;
  category: ToolCategory;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  success: boolean | null;
};

export type TurnStatus = 'completed' | 'aborted' | 'incomplete';

export type TurnAnalysis = {
  id: string;
  index: number;
  status: TurnStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  timeToFirstTokenMs: number | null;
  model: string;
  reasoningEffort: string | null;
  usage: TokenUsage;
  requests: ModelRequestAnalysis[];
  tools: ToolCallAnalysis[];
  userMessageCount: number;
  assistantCommentaryCount: number;
  assistantFinalCount: number;
  compactionCount: number;
  errorCount: number;
};

export type SessionStatus = 'completed' | 'aborted' | 'incomplete';

export type SessionAnalysis = {
  id: string;
  title: string;
  filePath: string;
  projectPath: string;
  projectName: string;
  source: string;
  codexVersion: string | null;
  parentThreadId: string | null;
  isSubagent: boolean;
  archived: boolean;
  startedAt: string;
  updatedAt: string;
  status: SessionStatus;
  usage: TokenUsage;
  turns: TurnAnalysis[];
  requestCount: number;
  toolCallCount: number;
  toolFailureCount: number;
  activeDurationMs: number;
  parseIssueCount: number;
};

export type ModelStats = {
  model: string;
  requestCount: number;
  turnCount: number;
  sessionCount: number;
  usage: TokenUsage;
  totalGenerationDurationMs: number;
  averageRequestDurationMs: number | null;
  p50RequestDurationMs: number | null;
  p95RequestDurationMs: number | null;
  outputTokensPerSecond: number | null;
  cacheHitRate: number | null;
  reasoningRatio: number | null;
  averageTimeToFirstTokenMs: number | null;
};

export type ToolStats = {
  name: string;
  category: ToolCategory;
  count: number;
  successCount: number;
  failureCount: number;
  unknownCount: number;
  totalDurationMs: number;
  averageDurationMs: number | null;
};

export type DailyStats = {
  date: string;
  sessionCount: number;
  turnCount: number;
  requestCount: number;
  toolCallCount: number;
  activeDurationMs: number;
  usage: TokenUsage;
};

export type AnalysisTotals = {
  projectCount: number;
  sessionCount: number;
  turnCount: number;
  completedTurnCount: number;
  abortedTurnCount: number;
  incompleteTurnCount: number;
  requestCount: number;
  toolCallCount: number;
  toolFailureCount: number;
  activeDurationMs: number;
  averageTurnDurationMs: number | null;
  averageTimeToFirstTokenMs: number | null;
  cacheHitRate: number | null;
  reasoningRatio: number | null;
  usage: TokenUsage;
};

export type ProjectAnalysis = {
  id: string;
  name: string;
  path: string;
  sessionIds: string[];
  updatedAt: string;
  status: SessionStatus;
  totals: Omit<AnalysisTotals, 'projectCount'>;
  modelStats: ModelStats[];
  toolStats: ToolStats[];
};

export type CodexAnalysisResult = {
  generatedAt: string;
  lookbackStart: string;
  options: CodexAnalyzerOptions;
  totals: AnalysisTotals;
  projects: ProjectAnalysis[];
  sessions: SessionAnalysis[];
  modelStats: ModelStats[];
  toolStats: ToolStats[];
  dailyStats: DailyStats[];
  parseIssueCount: number;
  skippedFileCount: number;
};

export type CodexAnalysisBuildMeta = {
  parseIssueCount?: number;
  skippedFileCount?: number;
};

type JsonObject = Record<string, unknown>;

type RolloutRow = {
  timestamp?: string;
  ordinal?: number;
  type?: string;
  payload?: JsonObject;
};

type ToolDraft = ToolCallAnalysis & {
  turnId: string;
};

type TurnDraft = TurnAnalysis & {
  requestBoundaryAt: string | null;
  currentModel: string;
  toolMap: Map<string, ToolDraft>;
};

type SessionIndexEntry = {
  title: string;
  updatedAt: number;
};

const DEFAULT_OPTIONS: CodexAnalyzerOptions = {
  lookbackDays: 7,
  includeArchived: true,
  includeSubagents: true,
};

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  uncachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const SHELL_TOOLS = new Set(['exec', 'exec_command', 'shell', 'write_stdin', 'read_thread_terminal']);
const COLLABORATION_TOOLS = new Set([
  'spawn_agent',
  'wait_agent',
  'followup_task',
  'send_message',
  'wait',
  'list_agents',
  'interrupt_agent',
]);
const PLAN_TOOLS = new Set(['update_plan', 'create_goal', 'update_goal', 'get_goal']);
const IMAGE_TOOLS = new Set(['view_image', 'image_generation', 'generate_image']);
const INTERACTION_TOOLS = new Set(['request_user_input', 'request_permissions']);

export function run(input: CodexAnalyzerInput, context: ToolRunContext): CodexAnalysisResult {
  return analyzeCodexRollouts(input, context.now());
}

export function analyzeCodexRollouts(input: CodexAnalyzerInput, now = new Date()): CodexAnalysisResult {
  const options = normalizeOptions(input.options);
  const sessionIndex = parseSessionIndex(input.sessionIndexText ?? '');
  const sessions: SessionAnalysis[] = [];
  let parseIssueCount = 0;
  let skippedFileCount = 0;

  for (const source of input.rollouts) {
    const archived = source.path.includes('/archived_sessions/') || source.path.startsWith('archived_sessions/');
    if (archived && !options.includeArchived) {
      skippedFileCount += 1;
      continue;
    }

    const parsed = parseSession(source, sessionIndex);
    parseIssueCount += parsed.parseIssueCount;
    sessions.push(parsed);
  }

  return createCodexAnalysisFromSessions(sessions, options, now, {
    parseIssueCount,
    skippedFileCount,
  });
}

export function createCodexAnalysisFromSessions(
  sourceSessions: SessionAnalysis[],
  rawOptions: Partial<CodexAnalyzerOptions> = DEFAULT_OPTIONS,
  now = new Date(),
  meta: CodexAnalysisBuildMeta = {},
): CodexAnalysisResult {
  const options = normalizeOptions(rawOptions);
  const lookbackStartDate = new Date(now.getTime() - options.lookbackDays * 24 * 60 * 60 * 1000);
  let skippedFileCount = meta.skippedFileCount ?? 0;
  const sessions = sourceSessions.filter((session) => {
    if (session.archived && !options.includeArchived) {
      skippedFileCount += 1;
      return false;
    }
    if (session.isSubagent && !options.includeSubagents) {
      skippedFileCount += 1;
      return false;
    }
    const updatedAt = Date.parse(session.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt < lookbackStartDate.getTime()) {
      skippedFileCount += 1;
      return false;
    }
    return true;
  });

  sessions.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));

  const modelStats = aggregateModelStats(sessions);
  const toolStats = aggregateToolStats(sessions);
  const dailyStats = aggregateDailyStats(sessions, lookbackStartDate, now);
  const projects = aggregateProjects(sessions);
  const totals = aggregateTotals(sessions, projects.length);

  return {
    generatedAt: now.toISOString(),
    lookbackStart: lookbackStartDate.toISOString(),
    options,
    totals,
    projects,
    sessions,
    modelStats,
    toolStats,
    dailyStats,
    parseIssueCount: meta.parseIssueCount ?? sessions.reduce((sum, session) => sum + session.parseIssueCount, 0),
    skippedFileCount,
  };
}

function parseSession(source: CodexRolloutSource, index: Map<string, SessionIndexEntry>): SessionAnalysis {
  const { rows, issueCount } = parseRows(source.text);
  const metadata = mergeSessionMetadata(rows);
  const sessionId = asString(metadata.id) || asString(metadata.session_id) || inferSessionId(source.path);
  const projectPath = asString(metadata.cwd) || '(unknown project)';
  const parentThreadId = asString(metadata.parent_thread_id) || null;
  const threadSource = asString(metadata.thread_source);
  const isSubagent = Boolean(
    getNested(metadata, ['source', 'subagent']) ||
      getNested(metadata, ['thread_source', 'subagent']) ||
      threadSource === 'subagent',
  );
  const nativeStartIndex = findNativeStartIndex(rows, Boolean(parentThreadId || isSubagent));
  const activityRows = nativeStartIndex > 0 ? rows.slice(nativeStartIndex) : rows;
  const firstTimestamp = firstValidTimestamp(activityRows) || asString(metadata.timestamp) || new Date(source.lastModified ?? 0).toISOString();
  const lastTimestamp = lastValidTimestamp(activityRows) || firstTimestamp;
  const titleFromIndex = index.get(sessionId)?.title;
  const fallbackTitle = findFirstUserMessage(activityRows) || `Session ${shortId(sessionId)}`;
  const turns: TurnDraft[] = [];
  const turnsById = new Map<string, TurnDraft>();
  const callTurnMap = new Map<string, TurnDraft>();
  let activeTurn: TurnDraft | null = null;
  let previousTotalUsage: TokenUsage | null = findLastTotalUsage(rows, nativeStartIndex);
  let pendingModel = 'unknown';
  let pendingEffort: string | null = null;

  for (const row of activityRows) {
    const payload = row.payload ?? {};
    const payloadType = asString(payload.type);
    const timestamp = normalizeTimestamp(row.timestamp) || lastTimestamp;

    if (row.type === 'turn_context') {
      const turnId = asString(payload.turn_id);
      const target = (turnId && turnsById.get(turnId)) || activeTurn;
      const model = asString(payload.model) || 'unknown';
      const effort = asString(payload.effort) || null;

      if (target) {
        target.model = model;
        target.currentModel = model;
        target.reasoningEffort = effort;
      } else {
        pendingModel = model;
        pendingEffort = effort;
      }
      continue;
    }

    if (row.type === 'event_msg' && (payloadType === 'task_started' || payloadType === 'turn_started')) {
      if (activeTurn) {
        activeTurn.status = 'incomplete';
        activeTurn.completedAt = timestamp;
        activeTurn.durationMs = durationBetween(activeTurn.startedAt, timestamp);
      }

      const turnId = asString(payload.turn_id) || `${sessionId}:turn:${turns.length + 1}`;
      activeTurn = createTurnDraft(turnId, turns.length + 1, timestamp, pendingModel, pendingEffort);
      turns.push(activeTurn);
      turnsById.set(turnId, activeTurn);
      pendingModel = 'unknown';
      pendingEffort = null;
      continue;
    }

    if (row.type === 'event_msg' && payloadType === 'model_reroute') {
      const target = activeTurn;
      const nextModel = asString(payload.to_model) || asString(payload.model);
      if (target && nextModel) {
        target.currentModel = nextModel;
        target.model = nextModel;
      }
      continue;
    }

    if (row.type === 'event_msg' && payloadType === 'token_count') {
      const currentTotal = readTokenUsage(getNested(payload, ['info', 'total_token_usage']));
      if (!currentTotal) continue;

      const delta = calculateUsageDelta(previousTotalUsage, currentTotal);
      previousTotalUsage = currentTotal;

      if (!activeTurn || !hasUsage(delta)) continue;

      const boundaryAt = activeTurn.requestBoundaryAt || activeTurn.startedAt;
      const cycleDurationMs = durationBetween(boundaryAt, timestamp);
      const toolBusyDurationMs = cycleDurationMs === null ? 0 : calculateToolBusyDuration(activeTurn.tools, boundaryAt, timestamp);
      const residualDurationMs = cycleDurationMs === null ? null : cycleDurationMs - toolBusyDurationMs;
      const generationDurationMs = residualDurationMs !== null && residualDurationMs >= 100 ? residualDurationMs : null;
      const speed = generationDurationMs && delta.outputTokens > 0 ? delta.outputTokens / (generationDurationMs / 1000) : null;
      const request: ModelRequestAnalysis = {
        id: `${activeTurn.id}:request:${activeTurn.requests.length + 1}`,
        index: activeTurn.requests.length + 1,
        model: activeTurn.currentModel || activeTurn.model || 'unknown',
        startedAt: boundaryAt,
        completedAt: timestamp,
        cycleDurationMs,
        toolBusyDurationMs,
        generationDurationMs,
        outputTokensPerSecond: finiteOrNull(speed),
        usage: delta,
        timingKind: 'estimated',
      };

      activeTurn.requests.push(request);
      activeTurn.usage = addUsage(activeTurn.usage, delta);
      activeTurn.requestBoundaryAt = timestamp;
      continue;
    }

    const turnForCall = resolveTurnForPayload(payload, activeTurn, turnsById, callTurnMap);

    if (isToolStart(row.type, payloadType) && turnForCall) {
      const callId = toolCallId(payload, `${turnForCall.id}:tool:${turnForCall.toolMap.size + 1}`);
      const tool = upsertTool(turnForCall, callId, {
        name: toolName(row.type, payloadType, payload),
        category: toolCategory(row.type, payloadType, payload),
        startedAt: timestamp,
      });
      callTurnMap.set(callId, turnForCall);
      if (!tool.startedAt) tool.startedAt = timestamp;
      continue;
    }

    if (isToolEnd(row.type, payloadType) && turnForCall) {
      const callId = toolCallId(payload, `${turnForCall.id}:tool:${turnForCall.toolMap.size + 1}`);
      const explicitDuration = readDurationMs(payload.duration);
      const startedAt = explicitDuration !== null ? new Date(Date.parse(timestamp) - explicitDuration).toISOString() : null;
      const tool = upsertTool(turnForCall, callId, {
        name: toolName(row.type, payloadType, payload),
        category: toolCategory(row.type, payloadType, payload),
        startedAt,
      });
      tool.completedAt = timestamp;
      tool.durationMs = explicitDuration ?? durationBetween(tool.startedAt, timestamp);
      tool.success = inferToolSuccess(payload);
      callTurnMap.set(callId, turnForCall);
      continue;
    }

    if (row.type === 'event_msg' && payloadType === 'user_message' && activeTurn) {
      activeTurn.userMessageCount += 1;
      continue;
    }

    if (row.type === 'event_msg' && payloadType === 'agent_message' && activeTurn) {
      const phase = asString(payload.phase);
      if (phase === 'final_answer' || phase === 'final') activeTurn.assistantFinalCount += 1;
      else activeTurn.assistantCommentaryCount += 1;
      continue;
    }

    if ((row.type === 'compacted' || payloadType === 'context_compacted') && activeTurn) {
      activeTurn.compactionCount += 1;
      continue;
    }

    if (row.type === 'event_msg' && isErrorEvent(payloadType) && activeTurn) {
      activeTurn.errorCount += 1;
      continue;
    }

    if (row.type === 'event_msg' && (payloadType === 'task_complete' || payloadType === 'turn_complete')) {
      const turnId = asString(payload.turn_id);
      const target = (turnId && turnsById.get(turnId)) || activeTurn;
      if (target) {
        target.status = 'completed';
        target.completedAt = normalizeTimestamp(asString(payload.completed_at)) || timestamp;
        target.durationMs = asFiniteNumber(payload.duration_ms) ?? durationBetween(target.startedAt, target.completedAt);
        target.timeToFirstTokenMs = asFiniteNumber(payload.time_to_first_token_ms);
      }
      if (!turnId || activeTurn?.id === turnId) activeTurn = null;
      continue;
    }

    if (row.type === 'event_msg' && payloadType === 'turn_aborted') {
      const turnId = asString(payload.turn_id);
      const target = (turnId && turnsById.get(turnId)) || activeTurn;
      if (target) {
        target.status = 'aborted';
        target.completedAt = normalizeTimestamp(asString(payload.completed_at)) || timestamp;
        target.durationMs = asFiniteNumber(payload.duration_ms) ?? durationBetween(target.startedAt, target.completedAt);
      }
      if (!turnId || activeTurn?.id === turnId) activeTurn = null;
    }
  }

  if (activeTurn) {
    activeTurn.status = 'incomplete';
    activeTurn.completedAt = lastTimestamp;
    activeTurn.durationMs = durationBetween(activeTurn.startedAt, lastTimestamp);
  }

  const finalizedTurns = turns.map(finalizeTurn);
  const usage = sumUsage(finalizedTurns.map((turn) => turn.usage));
  const tools = finalizedTurns.flatMap((turn) => turn.tools);
  const status = sessionStatus(finalizedTurns);

  return {
    id: sessionId,
    title: titleFromIndex || fallbackTitle,
    filePath: source.path,
    projectPath,
    projectName: pathBasename(projectPath),
    source: sourceLabel(metadata),
    codexVersion: asString(metadata.cli_version) || null,
    parentThreadId,
    isSubagent,
    archived: source.path.includes('archived_sessions'),
    startedAt: firstTimestamp,
    updatedAt: lastTimestamp,
    status,
    usage,
    turns: finalizedTurns,
    requestCount: finalizedTurns.reduce((sum, turn) => sum + turn.requests.length, 0),
    toolCallCount: tools.length,
    toolFailureCount: tools.filter((tool) => tool.success === false).length,
    activeDurationMs: finalizedTurns.reduce((sum, turn) => sum + (turn.durationMs ?? 0), 0),
    parseIssueCount: issueCount,
  };
}

function createTurnDraft(id: string, index: number, startedAt: string, model: string, effort: string | null): TurnDraft {
  return {
    id,
    index,
    status: 'incomplete',
    startedAt,
    completedAt: null,
    durationMs: null,
    timeToFirstTokenMs: null,
    model,
    reasoningEffort: effort,
    usage: emptyUsage(),
    requests: [],
    tools: [],
    userMessageCount: 0,
    assistantCommentaryCount: 0,
    assistantFinalCount: 0,
    compactionCount: 0,
    errorCount: 0,
    requestBoundaryAt: startedAt,
    currentModel: model,
    toolMap: new Map(),
  };
}

function finalizeTurn(turn: TurnDraft): TurnAnalysis {
  const tools = [...turn.toolMap.values()]
    .map(({ turnId: _turnId, ...tool }) => tool)
    .sort((left, right) => timestampValue(left.startedAt) - timestampValue(right.startedAt));

  return {
    id: turn.id,
    index: turn.index,
    status: turn.status,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    durationMs: turn.durationMs,
    timeToFirstTokenMs: turn.timeToFirstTokenMs,
    model: turn.model,
    reasoningEffort: turn.reasoningEffort,
    usage: turn.usage,
    requests: turn.requests,
    tools,
    userMessageCount: turn.userMessageCount,
    assistantCommentaryCount: turn.assistantCommentaryCount,
    assistantFinalCount: turn.assistantFinalCount,
    compactionCount: turn.compactionCount,
    errorCount: turn.errorCount,
  };
}

function resolveTurnForPayload(
  payload: JsonObject,
  activeTurn: TurnDraft | null,
  turnsById: Map<string, TurnDraft>,
  callTurnMap: Map<string, TurnDraft>,
): TurnDraft | null {
  const turnId = asString(payload.turn_id);
  if (turnId && turnsById.has(turnId)) return turnsById.get(turnId) ?? null;
  const callId = asString(payload.call_id) || asString(payload.id);
  if (callId && callTurnMap.has(callId)) return callTurnMap.get(callId) ?? null;
  return activeTurn;
}

function upsertTool(
  turn: TurnDraft,
  callId: string,
  patch: Pick<ToolCallAnalysis, 'name' | 'category' | 'startedAt'>,
): ToolDraft {
  const existing = turn.toolMap.get(callId);
  if (existing) {
    if (
      patch.name !== 'unknown' &&
      (existing.name === 'unknown' || (patch.category === 'mcp' && existing.category !== 'mcp'))
    ) {
      existing.name = patch.name;
    }
    if (existing.category === 'other' && patch.category !== 'other') existing.category = patch.category;
    if (!existing.startedAt && patch.startedAt) existing.startedAt = patch.startedAt;
    return existing;
  }

  const tool: ToolDraft = {
    id: callId,
    turnId: turn.id,
    name: patch.name,
    category: patch.category,
    startedAt: patch.startedAt,
    completedAt: null,
    durationMs: null,
    success: null,
  };
  turn.toolMap.set(callId, tool);
  turn.tools.push(tool);
  return tool;
}

function isToolStart(topType: string | undefined, payloadType: string): boolean {
  if (topType === 'response_item') {
    return ['function_call', 'custom_tool_call', 'tool_search_call'].includes(payloadType);
  }
  return [
    'exec_command_begin',
    'mcp_tool_call_begin',
    'web_search_begin',
    'patch_apply_begin',
    'image_generation_begin',
    'dynamic_tool_call_request',
  ].includes(payloadType);
}

function isToolEnd(topType: string | undefined, payloadType: string): boolean {
  if (topType === 'response_item') {
    return ['function_call_output', 'custom_tool_call_output', 'tool_search_output'].includes(payloadType);
  }
  return [
    'exec_command_end',
    'mcp_tool_call_end',
    'web_search_end',
    'patch_apply_end',
    'image_generation_end',
    'dynamic_tool_call_response',
    'view_image_tool_call',
  ].includes(payloadType);
}

function toolCallId(payload: JsonObject, fallback: string): string {
  return asString(payload.call_id) || asString(payload.id) || fallback;
}

function toolName(topType: string | undefined, payloadType: string, payload: JsonObject): string {
  const directName = asString(payload.name) || asString(payload.tool);
  if (directName) return directName;

  const invocation = asObject(payload.invocation);
  if (invocation) {
    const server = asString(invocation.server);
    const tool = asString(invocation.tool);
    if (server && tool) return `${server}.${tool}`;
    if (tool) return tool;
  }

  if (topType === 'response_item' && payloadType.endsWith('_output')) return 'unknown';
  if (payloadType.startsWith('exec_command')) return 'exec_command';
  if (payloadType.startsWith('web_search')) return 'web_search';
  if (payloadType.startsWith('patch_apply')) return 'apply_patch';
  if (payloadType.startsWith('image_generation')) return 'image_generation';
  if (payloadType === 'view_image_tool_call') return 'view_image';
  if (payloadType.startsWith('tool_search')) return 'tool_search';
  if (payloadType.startsWith('mcp_tool_call')) return 'mcp';
  return 'unknown';
}

function toolCategory(topType: string | undefined, payloadType: string, payload: JsonObject): ToolCategory {
  const name = toolName(topType, payloadType, payload);
  if (payloadType.startsWith('mcp_tool_call') || asObject(payload.invocation)?.server) return 'mcp';
  if (payloadType.startsWith('web_search') || name === 'web_search') return 'web';
  if (payloadType.startsWith('patch_apply') || name === 'apply_patch') return 'patch';
  if (payloadType.startsWith('image_generation') || name === 'view_image' || IMAGE_TOOLS.has(name)) return 'image';
  if (SHELL_TOOLS.has(name)) return 'shell';
  if (COLLABORATION_TOOLS.has(name)) return 'collaboration';
  if (PLAN_TOOLS.has(name)) return 'plan';
  if (INTERACTION_TOOLS.has(name)) return 'interaction';
  if (payloadType.startsWith('tool_search') || name === 'tool_search') return 'other';
  return 'other';
}

function inferToolSuccess(payload: JsonObject): boolean | null {
  const explicitSuccess = payload.success;
  if (typeof explicitSuccess === 'boolean') return explicitSuccess;

  const status = asString(payload.status)?.toLowerCase();
  if (status) {
    if (['completed', 'success', 'succeeded', 'ok'].includes(status)) return true;
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return false;
  }

  const result = payload.result;
  if (asObject(result)) {
    if ('Err' in (result as JsonObject) || 'error' in (result as JsonObject)) return false;
    if ('Ok' in (result as JsonObject) || 'result' in (result as JsonObject)) return true;
  }

  const output = payload.output;
  if (typeof output === 'string') {
    if (/process exited with code\s+0\b/i.test(output)) return true;
    if (/process exited with code\s+[1-9]\d*\b/i.test(output)) return false;
    if (/\b(error|failed|exception)\b/i.test(output)) return false;
  }

  if (typeof payload.exit_code === 'number') return payload.exit_code === 0;
  return null;
}

function calculateToolBusyDuration(tools: ToolCallAnalysis[], startAt: string, endAt: string): number {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  const intervals = tools
    .map((tool) => {
      const toolStart = timestampValue(tool.startedAt);
      const toolEnd = timestampValue(tool.completedAt);
      if (!Number.isFinite(toolStart) || !Number.isFinite(toolEnd)) return null;
      const clippedStart = Math.max(startMs, toolStart);
      const clippedEnd = Math.min(endMs, toolEnd);
      return clippedEnd > clippedStart ? ([clippedStart, clippedEnd] as const) : null;
    })
    .filter((interval): interval is readonly [number, number] => interval !== null)
    .sort((left, right) => left[0] - right[0]);

  let total = 0;
  let currentStart = 0;
  let currentEnd = 0;

  for (const [intervalStart, intervalEnd] of intervals) {
    if (currentEnd === 0) {
      currentStart = intervalStart;
      currentEnd = intervalEnd;
      continue;
    }
    if (intervalStart <= currentEnd) {
      currentEnd = Math.max(currentEnd, intervalEnd);
      continue;
    }
    total += currentEnd - currentStart;
    currentStart = intervalStart;
    currentEnd = intervalEnd;
  }

  if (currentEnd > currentStart) total += currentEnd - currentStart;
  return total;
}

function aggregateProjects(sessions: SessionAnalysis[]): ProjectAnalysis[] {
  const grouped = new Map<string, SessionAnalysis[]>();
  for (const session of sessions) {
    const current = grouped.get(session.projectPath) ?? [];
    current.push(session);
    grouped.set(session.projectPath, current);
  }

  return [...grouped.entries()]
    .map(([path, projectSessions]) => {
      const latest = projectSessions.reduce((current, session) => (session.updatedAt > current ? session.updatedAt : current), '');
      const status = projectSessions.some((session) => session.status === 'incomplete')
        ? 'incomplete'
        : projectSessions.some((session) => session.status === 'aborted')
          ? 'aborted'
          : 'completed';
      const projectTotals = aggregateTotals(projectSessions, 0);
      const { projectCount: _projectCount, ...totals } = projectTotals;

      return {
        id: stableId(path),
        name: pathBasename(path),
        path,
        sessionIds: projectSessions.map((session) => session.id),
        updatedAt: latest,
        status,
        totals,
        modelStats: aggregateModelStats(projectSessions),
        toolStats: aggregateToolStats(projectSessions),
      } satisfies ProjectAnalysis;
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function aggregateTotals(sessions: SessionAnalysis[], projectCount: number): AnalysisTotals {
  const turns = sessions.flatMap((session) => session.turns);
  const tools = turns.flatMap((turn) => turn.tools);
  const durations = turns.map((turn) => turn.durationMs).filter(isFiniteNumber);
  const ttfts = turns.map((turn) => turn.timeToFirstTokenMs).filter(isFiniteNumber);
  const usage = sumUsage(turns.map((turn) => turn.usage));

  return {
    projectCount,
    sessionCount: sessions.length,
    turnCount: turns.length,
    completedTurnCount: turns.filter((turn) => turn.status === 'completed').length,
    abortedTurnCount: turns.filter((turn) => turn.status === 'aborted').length,
    incompleteTurnCount: turns.filter((turn) => turn.status === 'incomplete').length,
    requestCount: turns.reduce((sum, turn) => sum + turn.requests.length, 0),
    toolCallCount: tools.length,
    toolFailureCount: tools.filter((tool) => tool.success === false).length,
    activeDurationMs: durations.reduce((sum, duration) => sum + duration, 0),
    averageTurnDurationMs: average(durations),
    averageTimeToFirstTokenMs: average(ttfts),
    cacheHitRate: usage.inputTokens > 0 ? usage.cachedInputTokens / usage.inputTokens : null,
    reasoningRatio: usage.outputTokens > 0 ? usage.reasoningOutputTokens / usage.outputTokens : null,
    usage,
  };
}

function aggregateModelStats(sessions: SessionAnalysis[]): ModelStats[] {
  type ModelBucket = {
    requests: ModelRequestAnalysis[];
    turnIds: Set<string>;
    sessionIds: Set<string>;
    ttfts: number[];
  };

  const buckets = new Map<string, ModelBucket>();

  for (const session of sessions) {
    for (const turn of session.turns) {
      const turnModels = new Set<string>();
      for (const request of turn.requests) {
        const bucket = buckets.get(request.model) ?? {
          requests: [],
          turnIds: new Set<string>(),
          sessionIds: new Set<string>(),
          ttfts: [],
        };
        bucket.requests.push(request);
        bucket.turnIds.add(turn.id);
        bucket.sessionIds.add(session.id);
        buckets.set(request.model, bucket);
        turnModels.add(request.model);
      }
      if (turn.timeToFirstTokenMs !== null) {
        for (const model of turnModels.size > 0 ? turnModels : new Set([turn.model])) {
          const bucket = buckets.get(model) ?? {
            requests: [],
            turnIds: new Set<string>(),
            sessionIds: new Set<string>(),
            ttfts: [],
          };
          bucket.ttfts.push(turn.timeToFirstTokenMs);
          bucket.turnIds.add(turn.id);
          bucket.sessionIds.add(session.id);
          buckets.set(model, bucket);
        }
      }
    }
  }

  return [...buckets.entries()]
    .map(([model, bucket]) => {
      const usage = sumUsage(bucket.requests.map((request) => request.usage));
      const durations = bucket.requests.map((request) => request.generationDurationMs).filter(isFiniteNumber);
      const totalGenerationDurationMs = durations.reduce((sum, duration) => sum + duration, 0);
      return {
        model,
        requestCount: bucket.requests.length,
        turnCount: bucket.turnIds.size,
        sessionCount: bucket.sessionIds.size,
        usage,
        totalGenerationDurationMs,
        averageRequestDurationMs: average(durations),
        p50RequestDurationMs: percentile(durations, 0.5),
        p95RequestDurationMs: percentile(durations, 0.95),
        outputTokensPerSecond:
          totalGenerationDurationMs > 0 ? usage.outputTokens / (totalGenerationDurationMs / 1000) : null,
        cacheHitRate: usage.inputTokens > 0 ? usage.cachedInputTokens / usage.inputTokens : null,
        reasoningRatio: usage.outputTokens > 0 ? usage.reasoningOutputTokens / usage.outputTokens : null,
        averageTimeToFirstTokenMs: average(bucket.ttfts),
      } satisfies ModelStats;
    })
    .sort((left, right) => right.usage.totalTokens - left.usage.totalTokens);
}

function aggregateToolStats(sessions: SessionAnalysis[]): ToolStats[] {
  const buckets = new Map<string, ToolCallAnalysis[]>();
  for (const tool of sessions.flatMap((session) => session.turns.flatMap((turn) => turn.tools))) {
    const key = `${tool.category}:${tool.name}`;
    const current = buckets.get(key) ?? [];
    current.push(tool);
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .map((tools) => {
      const durations = tools.map((tool) => tool.durationMs).filter(isFiniteNumber);
      return {
        name: tools[0]?.name ?? 'unknown',
        category: tools[0]?.category ?? 'other',
        count: tools.length,
        successCount: tools.filter((tool) => tool.success === true).length,
        failureCount: tools.filter((tool) => tool.success === false).length,
        unknownCount: tools.filter((tool) => tool.success === null).length,
        totalDurationMs: durations.reduce((sum, duration) => sum + duration, 0),
        averageDurationMs: average(durations),
      } satisfies ToolStats;
    })
    .sort((left, right) => right.count - left.count);
}

function aggregateDailyStats(sessions: SessionAnalysis[], start: Date, end: Date): DailyStats[] {
  const days = new Map<string, DailyStats & { sessionIds: Set<string> }>();
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  while (cursor <= endDay) {
    const date = cursor.toISOString().slice(0, 10);
    days.set(date, {
      date,
      sessionCount: 0,
      turnCount: 0,
      requestCount: 0,
      toolCallCount: 0,
      activeDurationMs: 0,
      usage: emptyUsage(),
      sessionIds: new Set(),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const session of sessions) {
    for (const turn of session.turns) {
      const date = turn.startedAt.slice(0, 10);
      const day = days.get(date);
      if (!day) continue;
      day.sessionIds.add(session.id);
      day.turnCount += 1;
      day.requestCount += turn.requests.length;
      day.toolCallCount += turn.tools.length;
      day.activeDurationMs += turn.durationMs ?? 0;
      day.usage = addUsage(day.usage, turn.usage);
    }
  }

  return [...days.values()].map(({ sessionIds, ...day }) => ({
    ...day,
    sessionCount: sessionIds.size,
  }));
}

function findNativeStartIndex(rows: RolloutRow[], forked: boolean): number {
  if (!forked) return 0;

  const contextIndex = rows.findIndex((row) => row.type === 'turn_context' && Boolean(asString(row.payload?.turn_id)));
  if (contextIndex < 0) return 0;

  const turnId = asString(rows[contextIndex]?.payload?.turn_id);
  for (let index = contextIndex; index >= 0; index -= 1) {
    const row = rows[index];
    const payloadType = asString(row?.payload?.type);
    if (
      row?.type === 'event_msg' &&
      (payloadType === 'task_started' || payloadType === 'turn_started') &&
      asString(row.payload?.turn_id) === turnId
    ) {
      return index;
    }
  }

  return contextIndex;
}

function findLastTotalUsage(rows: RolloutRow[], beforeIndex: number): TokenUsage | null {
  if (beforeIndex <= 0) return null;
  for (let index = Math.min(beforeIndex - 1, rows.length - 1); index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.type !== 'event_msg' || asString(row.payload?.type) !== 'token_count') continue;
    const usage = readTokenUsage(getNested(row.payload ?? {}, ['info', 'total_token_usage']));
    if (usage) return usage;
  }
  return null;
}

function parseRows(text: string): { rows: RolloutRow[]; issueCount: number } {
  const rows: RolloutRow[] = [];
  let issueCount = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as RolloutRow;
      if (parsed && typeof parsed === 'object') rows.push(parsed);
      else issueCount += 1;
    } catch {
      issueCount += 1;
    }
  }

  rows.sort((left, right) => {
    if (typeof left.ordinal === 'number' && typeof right.ordinal === 'number') return left.ordinal - right.ordinal;
    return timestampValue(left.timestamp ?? null) - timestampValue(right.timestamp ?? null);
  });

  return { rows, issueCount };
}

function parseSessionIndex(text: string): Map<string, SessionIndexEntry> {
  const entries = new Map<string, SessionIndexEntry>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as JsonObject;
      const id = asString(parsed.id) || asString(parsed.thread_id);
      const title = asString(parsed.thread_name) || asString(parsed.title);
      const updatedAt = Date.parse(asString(parsed.updated_at));
      if (!id || !title) continue;
      const previous = entries.get(id);
      if (!previous || !Number.isFinite(updatedAt) || updatedAt >= previous.updatedAt) {
        entries.set(id, { title, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 });
      }
    } catch {
      // A malformed index row does not invalidate rollout analysis.
    }
  }
  return entries;
}

function mergeSessionMetadata(rows: RolloutRow[]): JsonObject {
  return rows
    .filter((row) => row.type === 'session_meta')
    .reduce<JsonObject>((current, row) => ({ ...current, ...(row.payload ?? {}) }), {});
}

function findFirstUserMessage(rows: RolloutRow[]): string | null {
  for (const row of rows) {
    if (row.type !== 'event_msg' || asString(row.payload?.type) !== 'user_message') continue;
    const raw = row.payload?.message;
    const text = typeof raw === 'string' ? raw : extractText(raw);
    if (text.trim()) return truncateSingleLine(text, 88);
  }
  return null;
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join(' ');
  const object = asObject(value);
  if (!object) return '';
  return asString(object.text) || asString(object.content) || '';
}

function sourceLabel(metadata: JsonObject): string {
  const originator = asString(metadata.originator);
  if (originator) return originator;
  const source = metadata.source;
  if (typeof source === 'string') return source;
  const sourceObject = asObject(source);
  if (sourceObject) {
    const subagent = asObject(sourceObject.subagent);
    if (subagent) return `subagent:${asString(subagent.other) || asString(subagent.role) || 'unknown'}`;
    return Object.keys(sourceObject)[0] || 'unknown';
  }
  return 'unknown';
}

function sessionStatus(turns: TurnAnalysis[]): SessionStatus {
  const latest = turns.at(-1);
  if (!latest) return 'incomplete';
  return latest.status;
}

function normalizeOptions(options?: Partial<CodexAnalyzerOptions>): CodexAnalyzerOptions {
  const lookbackDays = Math.max(1, Math.min(30, Math.round(options?.lookbackDays ?? DEFAULT_OPTIONS.lookbackDays)));
  return {
    lookbackDays,
    includeArchived: options?.includeArchived ?? DEFAULT_OPTIONS.includeArchived,
    includeSubagents: options?.includeSubagents ?? DEFAULT_OPTIONS.includeSubagents,
  };
}

function readTokenUsage(value: unknown): TokenUsage | null {
  const object = asObject(value);
  if (!object) return null;
  const inputTokens = nonNegativeNumber(object.input_tokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeNumber(object.cached_input_tokens));
  const outputTokens = nonNegativeNumber(object.output_tokens);
  const reasoningOutputTokens = Math.min(outputTokens, nonNegativeNumber(object.reasoning_output_tokens));
  return {
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens),
    outputTokens,
    reasoningOutputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function calculateUsageDelta(previous: TokenUsage | null, current: TokenUsage): TokenUsage {
  if (!previous) return current;
  const reset =
    current.inputTokens < previous.inputTokens ||
    current.cachedInputTokens < previous.cachedInputTokens ||
    current.outputTokens < previous.outputTokens ||
    current.reasoningOutputTokens < previous.reasoningOutputTokens;
  if (reset) return current;

  const inputTokens = Math.max(0, current.inputTokens - previous.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, current.cachedInputTokens - previous.cachedInputTokens));
  const outputTokens = Math.max(0, current.outputTokens - previous.outputTokens);
  const reasoningOutputTokens = Math.min(
    outputTokens,
    Math.max(0, current.reasoningOutputTokens - previous.reasoningOutputTokens),
  );

  return {
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens),
    outputTokens,
    reasoningOutputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function sumUsage(values: TokenUsage[]): TokenUsage {
  return values.reduce(addUsage, emptyUsage());
}

function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  const inputTokens = left.inputTokens + right.inputTokens;
  const cachedInputTokens = left.cachedInputTokens + right.cachedInputTokens;
  const outputTokens = left.outputTokens + right.outputTokens;
  const reasoningOutputTokens = left.reasoningOutputTokens + right.reasoningOutputTokens;
  return {
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens),
    outputTokens,
    reasoningOutputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function emptyUsage(): TokenUsage {
  return { ...EMPTY_USAGE };
}

function hasUsage(usage: TokenUsage): boolean {
  return usage.inputTokens > 0 || usage.outputTokens > 0 || usage.cachedInputTokens > 0 || usage.reasoningOutputTokens > 0;
}

function firstValidTimestamp(rows: RolloutRow[]): string | null {
  for (const row of rows) {
    const timestamp = normalizeTimestamp(row.timestamp);
    if (timestamp) return timestamp;
  }
  return null;
}

function lastValidTimestamp(rows: RolloutRow[]): string | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const timestamp = normalizeTimestamp(rows[index]?.timestamp);
    if (timestamp) return timestamp;
  }
  return null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function durationBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const duration = Date.parse(end) - Date.parse(start);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function readDurationMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value < 1_000 ? value * 1_000 : value;
  }
  const object = asObject(value);
  if (object) {
    const secs = asFiniteNumber(object.secs) ?? asFiniteNumber(object.seconds) ?? 0;
    const nanos = asFiniteNumber(object.nanos) ?? asFiniteNumber(object.nanoseconds) ?? 0;
    const millis = asFiniteNumber(object.millis) ?? asFiniteNumber(object.milliseconds);
    if (millis !== null) return Math.max(0, millis);
    if (secs || nanos) return Math.max(0, secs * 1_000 + nanos / 1_000_000);
  }
  if (typeof value === 'string') {
    const milliseconds = value.match(/^([\d.]+)\s*ms$/i);
    if (milliseconds) return Number(milliseconds[1]);
    const seconds = value.match(/^([\d.]+)\s*s$/i);
    if (seconds) return Number(seconds[1]) * 1_000;
  }
  return null;
}

function isErrorEvent(type: string): boolean {
  return ['error', 'stream_error', 'turn_error', 'model_error'].includes(type);
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index] ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inferSessionId(path: string): string {
  const match = path.match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i);
  return match?.[1] ?? stableId(path);
}

function pathBasename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `p-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(-8) : value;
}

function truncateSingleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function timestampValue(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getNested(object: JsonObject, path: string[]): unknown {
  let current: unknown = object;
  for (const key of path) {
    const currentObject = asObject(current);
    if (!currentObject) return undefined;
    current = currentObject[key];
  }
  return current;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeNumber(value: unknown): number {
  const number = asFiniteNumber(value);
  return number === null ? 0 : Math.max(0, number);
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}
