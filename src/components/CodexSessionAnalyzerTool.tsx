import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { type Locale } from '@/i18n/config';
import { localize } from '@/i18n/utils';
import { toolLocalStorageKey } from '@/lib/local/storage-contract';
import {
  CODEX_ANALYZER_TOOL_SLUG,
  analyzeCodexRollouts,
  createCodexAnalysisFromSessions,
  type CodexAnalysisResult,
  type CodexAnalyzerOptions,
  type DailyStats,
  type ModelStats,
  type ProjectAnalysis,
  type SessionAnalysis,
  type SessionStatus,
  type TokenUsage,
  type ToolStats,
  type TurnAnalysis,
} from '@/tools/codex-session-analyzer/run';
import { codexAnalyzerUi, type CodexAnalyzerUiKey } from '@/tools/codex-session-analyzer/ui';

type CodexSessionAnalyzerToolProps = {
  locale: Locale;
};

type AnalyzerView =
  | { kind: 'overview' }
  | { kind: 'project'; projectId: string }
  | { kind: 'session'; sessionId: string };

type CachedSources = {
  folderName: string;
  fullAnalysis: CodexAnalysisResult;
  scannedLookbackDays: number;
};

type ScanProgress = {
  current: number;
  total: number;
};

type FileHandleLike = {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
};

type DirectoryHandleLike = {
  kind: 'directory';
  name: string;
  values: () => AsyncIterableIterator<FileHandleLike | DirectoryHandleLike>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<DirectoryHandleLike>;
};

const SETTINGS_STORAGE_KEY = toolLocalStorageKey(CODEX_ANALYZER_TOOL_SLUG, 'settings', 'analysis');
const DEFAULT_SETTINGS: CodexAnalyzerOptions = {
  lookbackDays: 7,
  includeArchived: true,
  includeSubagents: true,
};
const LOOKBACK_OPTIONS = [1, 3, 7, 14, 30];

export default function CodexSessionAnalyzerTool({ locale }: CodexSessionAnalyzerToolProps) {
  const [settings, setSettings] = useState<CodexAnalyzerOptions>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [directoryHandle, setDirectoryHandle] = useState<DirectoryHandleLike | null>(null);
  const [fallbackFiles, setFallbackFiles] = useState<File[]>([]);
  const [sources, setSources] = useState<CachedSources | null>(null);
  const [analysis, setAnalysis] = useState<CodexAnalysisResult | null>(null);
  const [view, setView] = useState<AnalyzerView>({ kind: 'overview' });
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [error, setError] = useState('');
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const copy = (key: CodexAnalyzerUiKey, variables?: Record<string, string | number>) => {
    let value = localize(codexAnalyzerUi[key], locale);
    for (const [name, replacement] of Object.entries(variables ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) setSettings(normalizeSettings(JSON.parse(raw) as Partial<CodexAnalyzerOptions>));
    } catch {
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be unavailable in private browsing or when site data is disabled.
    }
  }, [settings, settingsLoaded]);

  useEffect(() => {
    const input = fallbackInputRef.current;
    if (!input) return;
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    if (!sources) return;
    setAnalysis(
      createCodexAnalysisFromSessions(sources.fullAnalysis.sessions, settings, new Date(), {
        parseIssueCount: sources.fullAnalysis.parseIssueCount,
        skippedFileCount: sources.fullAnalysis.skippedFileCount,
      }),
    );
    setView({ kind: 'overview' });
  }, [settings.includeArchived, settings.includeSubagents, settings.lookbackDays, sources]);

  const selectedProject = useMemo(() => {
    if (!analysis || view.kind !== 'project') return null;
    return analysis.projects.find((project) => project.id === view.projectId) ?? null;
  }, [analysis, view]);

  const selectedSession = useMemo(() => {
    if (!analysis || view.kind !== 'session') return null;
    return analysis.sessions.find((session) => session.id === view.sessionId) ?? null;
  }, [analysis, view]);

  async function chooseFolder() {
    setError('');
    const picker = (window as PickerWindow).showDirectoryPicker;
    if (!picker) {
      fallbackInputRef.current?.click();
      return;
    }

    try {
      const handle = await picker({ mode: 'read' });
      setDirectoryHandle(handle);
      setFallbackFiles([]);
      await scanDirectory(handle);
    } catch (pickerError) {
      if (pickerError instanceof DOMException && pickerError.name === 'AbortError') return;
      setError(copy('readError', { message: errorMessage(pickerError) }));
    }
  }

  async function handleFallbackSelection(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;

    setDirectoryHandle(null);
    setFallbackFiles(files);
    await scanFileList(files);
  }

  async function rescan(options: CodexAnalyzerOptions = settings) {
    if (directoryHandle) {
      await scanDirectory(directoryHandle, options);
      return;
    }
    if (fallbackFiles.length > 0) {
      await scanFileList(fallbackFiles, options);
      return;
    }
    await chooseFolder();
  }

  async function scanDirectory(handle: DirectoryHandleLike, options: CodexAnalyzerOptions = settings) {
    setScanning(true);
    setProgress(null);
    setError('');

    try {
      const collected = await collectDirectoryEntries(handle, options.lookbackDays);
      const sessionIndexText = collected.sessionIndex ? await (await collected.sessionIndex.getFile()).text() : '';
      const scanNow = new Date();
      const parsedSessions: SessionAnalysis[] = [];
      let parseIssueCount = 0;
      let skippedFileCount = 0;
      setProgress({ current: 0, total: collected.rollouts.length });

      for (let index = 0; index < collected.rollouts.length; index += 1) {
        const entry = collected.rollouts[index];
        if (!entry) continue;
        const file = await entry.handle.getFile();
        const partial = analyzeCodexRollouts(
          {
            rollouts: [{ path: entry.path, text: await file.text(), lastModified: file.lastModified }],
            sessionIndexText,
            options: {
              lookbackDays: options.lookbackDays,
              includeArchived: true,
              includeSubagents: true,
            },
          },
          scanNow,
        );
        parsedSessions.push(...partial.sessions);
        parseIssueCount += partial.parseIssueCount;
        skippedFileCount += partial.skippedFileCount;
        setProgress({ current: index + 1, total: collected.rollouts.length });
        if (index % 4 === 3) await yieldToBrowser();
      }

      const fullAnalysis = createCodexAnalysisFromSessions(
        parsedSessions,
        {
          lookbackDays: options.lookbackDays,
          includeArchived: true,
          includeSubagents: true,
        },
        scanNow,
        { parseIssueCount, skippedFileCount },
      );
      setSources({
        folderName: handle.name,
        fullAnalysis,
        scannedLookbackDays: options.lookbackDays,
      });
    } catch (scanError) {
      setError(copy('readError', { message: errorMessage(scanError) }));
    } finally {
      setScanning(false);
    }
  }

  async function scanFileList(files: File[], options: CodexAnalyzerOptions = settings) {
    setScanning(true);
    setError('');

    try {
      const cutoff = Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000;
      const rolloutFiles = files.filter((file) => {
        const path = relativeFilePath(file);
        return isRolloutPath(path) && fileInRange(path, file.lastModified, cutoff);
      });
      const indexFile = files.find((file) => relativeFilePath(file).endsWith('session_index.jsonl'));
      const sessionIndexText = indexFile ? await indexFile.text() : '';
      const scanNow = new Date();
      const parsedSessions: SessionAnalysis[] = [];
      let parseIssueCount = 0;
      let skippedFileCount = 0;
      setProgress({ current: 0, total: rolloutFiles.length });

      for (let index = 0; index < rolloutFiles.length; index += 1) {
        const file = rolloutFiles[index];
        if (!file) continue;
        const partial = analyzeCodexRollouts(
          {
            rollouts: [{ path: relativeFilePath(file), text: await file.text(), lastModified: file.lastModified }],
            sessionIndexText,
            options: {
              lookbackDays: options.lookbackDays,
              includeArchived: true,
              includeSubagents: true,
            },
          },
          scanNow,
        );
        parsedSessions.push(...partial.sessions);
        parseIssueCount += partial.parseIssueCount;
        skippedFileCount += partial.skippedFileCount;
        setProgress({ current: index + 1, total: rolloutFiles.length });
        if (index % 4 === 3) await yieldToBrowser();
      }

      const rootName = relativeFilePath(files[0] ?? new File([], 'folder')).split('/')[0] || 'Codex';
      const fullAnalysis = createCodexAnalysisFromSessions(
        parsedSessions,
        {
          lookbackDays: options.lookbackDays,
          includeArchived: true,
          includeSubagents: true,
        },
        scanNow,
        { parseIssueCount, skippedFileCount },
      );
      setSources({
        folderName: rootName,
        fullAnalysis,
        scannedLookbackDays: options.lookbackDays,
      });
    } catch (scanError) {
      setError(copy('readError', { message: errorMessage(scanError) }));
    } finally {
      setScanning(false);
    }
  }

  function updateSettings(patch: Partial<CodexAnalyzerOptions>) {
    setSettings((current) => normalizeSettings({ ...current, ...patch }));
  }

  async function updateLookbackDays(lookbackDays: number) {
    const nextSettings = normalizeSettings({ ...settings, lookbackDays });
    setSettings(nextSettings);

    if (directoryHandle || fallbackFiles.length > 0) {
      await rescan(nextSettings);
    }
  }

  function exportAnalysis() {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `codex-analysis-${analysis.generatedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="codex-analyzer-tool">
      <section className="panel codex-source-panel">
        <div className="codex-source-main">
          <div>
            <span className="codex-eyebrow">{copy('sourceTitle')}</span>
            <strong>{sources?.folderName ?? copy('noFolder')}</strong>
            <p>{copy('sourceHint')}</p>
          </div>
          <div className="codex-source-actions">
            <button type="button" className="primary" onClick={() => void chooseFolder()} disabled={scanning}>
              {copy('selectFolder')}
            </button>
            {(directoryHandle || fallbackFiles.length > 0) && (
              <button type="button" onClick={() => void rescan()} disabled={scanning}>
                {copy('rescan')}
              </button>
            )}
            {analysis && (
              <button type="button" onClick={exportAnalysis} disabled={scanning}>
                {copy('exportJson')}
              </button>
            )}
          </div>
        </div>

        <input ref={fallbackInputRef} className="sr-only" type="file" multiple onChange={(event) => void handleFallbackSelection(event)} />

        <div className="codex-filter-row">
          <label className="codex-filter-control">
            <span>{copy('lookback')}</span>
            <select
              value={settings.lookbackDays}
              onChange={(event) => void updateLookbackDays(Number(event.currentTarget.value))}
              disabled={scanning}
            >
              {LOOKBACK_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} {copy('days')}
                </option>
              ))}
            </select>
          </label>
          <label className="codex-filter-check">
            <input
              type="checkbox"
              checked={settings.includeArchived}
              onChange={(event) => updateSettings({ includeArchived: event.currentTarget.checked })}
              disabled={scanning}
            />
            <span>{copy('includeArchived')}</span>
          </label>
          <label className="codex-filter-check">
            <input
              type="checkbox"
              checked={settings.includeSubagents}
              onChange={(event) => updateSettings({ includeSubagents: event.currentTarget.checked })}
              disabled={scanning}
            />
            <span>{copy('includeSubagents')}</span>
          </label>
          <span className="codex-filter-note">{copy('settingsSaved')}</span>
        </div>

        {scanning && (
          <div className="codex-scan-progress" role="status">
            <div>
              <strong>{copy('scanning')}</strong>
              {progress && <span>{copy('scanProgress', progress)}</span>}
            </div>
            <div className="codex-progress-track" aria-hidden="true">
              <span style={{ inlineSize: `${progress && progress.total > 0 ? (progress.current / progress.total) * 100 : 8}%` }} />
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="error-panel codex-error-panel" role="alert">
          {error}
        </div>
      )}

      {!analysis ? (
        <EmptyDashboard title={copy('emptyTitle')} hint={copy('emptyHint')} />
      ) : analysis.totals.sessionCount === 0 ? (
        <EmptyDashboard title={copy('noDataTitle')} hint={copy('emptyHint')} />
      ) : (
        <>
          <DashboardBreadcrumbs
            analysis={analysis}
            view={view}
            locale={locale}
            copy={copy}
            onOverview={() => setView({ kind: 'overview' })}
            onProject={(projectId) => setView({ kind: 'project', projectId })}
          />

          {view.kind === 'overview' && (
            <OverviewDashboard
              analysis={analysis}
              locale={locale}
              copy={copy}
              onProject={(projectId) => setView({ kind: 'project', projectId })}
              onSession={(sessionId) => setView({ kind: 'session', sessionId })}
            />
          )}

          {view.kind === 'project' && selectedProject && (
            <ProjectDashboard
              project={selectedProject}
              sessions={analysis.sessions.filter((session) => selectedProject.sessionIds.includes(session.id))}
              locale={locale}
              copy={copy}
              onSession={(sessionId) => setView({ kind: 'session', sessionId })}
            />
          )}

          {view.kind === 'session' && selectedSession && (
            <SessionDashboard session={selectedSession} locale={locale} copy={copy} />
          )}

          <div className="codex-scan-footer">
            <span>{copy('scanSummary', { sessions: analysis.totals.sessionCount, skipped: analysis.skippedFileCount })}</span>
            {analysis.parseIssueCount > 0 && <span>{copy('parseWarnings', { count: analysis.parseIssueCount })}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyDashboard({ title, hint }: { title: string; hint: string }) {
  return (
    <section className="panel codex-empty-dashboard">
      <div className="codex-empty-visual" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <strong>{title}</strong>
      <p>{hint}</p>
    </section>
  );
}

function DashboardBreadcrumbs({
  analysis,
  view,
  locale,
  copy,
  onOverview,
  onProject,
}: {
  analysis: CodexAnalysisResult;
  view: AnalyzerView;
  locale: Locale;
  copy: CopyFunction;
  onOverview: () => void;
  onProject: (projectId: string) => void;
}) {
  const session = view.kind === 'session' ? analysis.sessions.find((item) => item.id === view.sessionId) : null;
  const project =
    view.kind === 'project'
      ? analysis.projects.find((item) => item.id === view.projectId)
      : session
        ? analysis.projects.find((item) => item.path === session.projectPath)
        : null;

  return (
    <nav className="codex-breadcrumbs" aria-label="Breadcrumb">
      <button type="button" onClick={onOverview} aria-current={view.kind === 'overview' ? 'page' : undefined}>
        {copy('overview')}
      </button>
      {project && (
        <>
          <span>/</span>
          <button type="button" onClick={() => onProject(project.id)} aria-current={view.kind === 'project' ? 'page' : undefined}>
            {project.name}
          </button>
        </>
      )}
      {session && (
        <>
          <span>/</span>
          <span title={session.title}>{truncate(session.title, 42)}</span>
        </>
      )}
      <time dateTime={analysis.generatedAt}>{formatDateTime(analysis.generatedAt, locale)}</time>
    </nav>
  );
}

function OverviewDashboard({
  analysis,
  locale,
  copy,
  onProject,
  onSession,
}: {
  analysis: CodexAnalysisResult;
  locale: Locale;
  copy: CopyFunction;
  onProject: (projectId: string) => void;
  onSession: (sessionId: string) => void;
}) {
  const totals = analysis.totals;
  return (
    <div className="codex-dashboard-stack">
      <MetricGrid
        metrics={[
          { label: copy('projects'), value: formatInteger(totals.projectCount, locale), detail: `${totals.sessionCount} ${copy('sessions')}` },
          { label: copy('totalTokens'), value: formatCompact(totals.usage.totalTokens, locale), detail: tokenComposition(totals.usage, locale, copy) },
          { label: copy('requests'), value: formatInteger(totals.requestCount, locale), detail: `${totals.turnCount} ${copy('turns')}` },
          { label: copy('toolCalls'), value: formatInteger(totals.toolCallCount, locale), detail: `${totals.toolFailureCount} ${copy('failures')}` },
          { label: copy('activeTime'), value: formatDuration(totals.activeDurationMs), detail: `${copy('averageRequest')} ${formatDuration(averageModelDuration(analysis.modelStats))}` },
          { label: copy('cacheHit'), value: formatPercent(totals.cacheHitRate), detail: `${copy('averageTtft')} ${formatDuration(totals.averageTimeToFirstTokenMs)}` },
        ]}
      />

      <div className="codex-dashboard-grid codex-dashboard-grid--wide-left">
        <DashboardPanel title={copy('activity')}>
          <DailyActivityChart data={analysis.dailyStats} locale={locale} />
        </DashboardPanel>
        <DashboardPanel title={copy('toolUsage')}>
          <ToolUsageChart stats={analysis.toolStats} locale={locale} />
        </DashboardPanel>
      </div>

      <div className="codex-dashboard-grid">
        <DashboardPanel title={copy('modelUsage')}>
          <ModelUsageChart stats={analysis.modelStats} locale={locale} copy={copy} />
        </DashboardPanel>
        <DashboardPanel title={copy('projectActivity')}>
          <ProjectList projects={analysis.projects} locale={locale} copy={copy} onProject={onProject} />
        </DashboardPanel>
      </div>

      <DashboardPanel title={copy('sessions')} compact>
        <SessionList sessions={analysis.sessions.slice(0, 12)} locale={locale} copy={copy} onSession={onSession} />
      </DashboardPanel>
    </div>
  );
}

function ProjectDashboard({
  project,
  sessions,
  locale,
  copy,
  onSession,
}: {
  project: ProjectAnalysis;
  sessions: SessionAnalysis[];
  locale: Locale;
  copy: CopyFunction;
  onSession: (sessionId: string) => void;
}) {
  return (
    <div className="codex-dashboard-stack">
      <section className="panel codex-detail-heading">
        <div>
          <span className="codex-eyebrow">{copy('projects')}</span>
          <h2>{project.name}</h2>
          <code>{project.path}</code>
        </div>
        <StatusBadge status={project.status} copy={copy} />
      </section>

      <MetricGrid
        metrics={[
          { label: copy('sessions'), value: formatInteger(project.totals.sessionCount, locale), detail: formatDateTime(project.updatedAt, locale) },
          { label: copy('totalTokens'), value: formatCompact(project.totals.usage.totalTokens, locale), detail: tokenComposition(project.totals.usage, locale, copy) },
          { label: copy('requests'), value: formatInteger(project.totals.requestCount, locale), detail: `${project.totals.turnCount} ${copy('turns')}` },
          { label: copy('toolCalls'), value: formatInteger(project.totals.toolCallCount, locale), detail: `${project.totals.toolFailureCount} ${copy('failures')}` },
          { label: copy('activeTime'), value: formatDuration(project.totals.activeDurationMs), detail: `${copy('averageTtft')} ${formatDuration(project.totals.averageTimeToFirstTokenMs)}` },
          { label: copy('cacheHit'), value: formatPercent(project.totals.cacheHitRate), detail: `${copy('reasoning')} ${formatPercent(project.totals.reasoningRatio)}` },
        ]}
      />

      <div className="codex-dashboard-grid">
        <DashboardPanel title={copy('modelUsage')}>
          <ModelUsageChart stats={project.modelStats} locale={locale} copy={copy} />
        </DashboardPanel>
        <DashboardPanel title={copy('toolUsage')}>
          <ToolUsageChart stats={project.toolStats} locale={locale} />
        </DashboardPanel>
      </div>

      <DashboardPanel title={copy('sessions')} compact>
        <SessionList sessions={sessions} locale={locale} copy={copy} onSession={onSession} />
      </DashboardPanel>
    </div>
  );
}

function SessionDashboard({ session, locale, copy }: { session: SessionAnalysis; locale: Locale; copy: CopyFunction }) {
  return (
    <div className="codex-dashboard-stack">
      <section className="panel codex-detail-heading codex-session-heading">
        <div>
          <span className="codex-eyebrow">{copy('conversationDetail')}</span>
          <h2>{session.title}</h2>
          <code>{session.projectPath}</code>
          <div className="codex-badge-row">
            <span>{session.source}</span>
            {session.codexVersion && <span>Codex {session.codexVersion}</span>}
            {session.archived && <span>{copy('archived')}</span>}
            {session.isSubagent && <span>{copy('subagent')}</span>}
          </div>
        </div>
        <StatusBadge status={session.status} copy={copy} />
      </section>

      <MetricGrid
        metrics={[
          { label: copy('totalTokens'), value: formatCompact(session.usage.totalTokens, locale), detail: tokenComposition(session.usage, locale, copy) },
          { label: copy('turns'), value: formatInteger(session.turns.length, locale), detail: `${session.requestCount} ${copy('requests')}` },
          { label: copy('toolCalls'), value: formatInteger(session.toolCallCount, locale), detail: `${session.toolFailureCount} ${copy('failures')}` },
          { label: copy('activeTime'), value: formatDuration(session.activeDurationMs), detail: formatDateTime(session.updatedAt, locale) },
        ]}
        compact
      />

      <section className="panel codex-timing-note">{copy('requestTimingNote')}</section>

      <div className="codex-turn-list">
        {session.turns.map((turn) => (
          <TurnCard key={turn.id} turn={turn} locale={locale} copy={copy} />
        ))}
      </div>
    </div>
  );
}

function TurnCard({ turn, locale, copy }: { turn: TurnAnalysis; locale: Locale; copy: CopyFunction }) {
  const maxDuration = Math.max(1, ...turn.requests.map((request) => request.generationDurationMs ?? 0));
  return (
    <details className="panel codex-turn-card" open={turn.index === 1 && turn.requests.length <= 8}>
      <summary>
        <div className="codex-turn-summary-main">
          <span className="codex-turn-index">{copy('turn')} {turn.index}</span>
          <strong>{turn.model}</strong>
          {turn.reasoningEffort && <span>{turn.reasoningEffort}</span>}
          <StatusBadge status={turn.status} copy={copy} />
        </div>
        <div className="codex-turn-summary-metrics">
          <span>{formatCompact(turn.usage.totalTokens, locale)} {copy('tokens')}</span>
          <span>{turn.requests.length} {copy('requests')}</span>
          <span>{turn.tools.length} {copy('tools')}</span>
          <span>{formatDuration(turn.durationMs)}</span>
        </div>
      </summary>

      <div className="codex-turn-body">
        <div className="codex-turn-facts">
          <Fact label={copy('duration')} value={formatDuration(turn.durationMs)} />
          <Fact label={copy('ttft')} value={formatDuration(turn.timeToFirstTokenMs)} />
          <Fact label={copy('cacheHit')} value={formatPercent(turn.usage.inputTokens > 0 ? turn.usage.cachedInputTokens / turn.usage.inputTokens : null)} />
          <Fact label={copy('compactions')} value={formatInteger(turn.compactionCount, locale)} />
        </div>

        {turn.requests.length > 0 && (
          <div className="codex-request-list">
            {turn.requests.map((request) => {
              const duration = request.generationDurationMs ?? 0;
              return (
                <div className="codex-request-row" key={request.id}>
                  <div className="codex-request-title">
                    <strong>{copy('request')} {request.index}</strong>
                    <span>{request.model}</span>
                  </div>
                  <div className="codex-request-bar" aria-hidden="true">
                    <span style={{ inlineSize: `${Math.max(3, (duration / maxDuration) * 100)}%` }} />
                  </div>
                  <div className="codex-request-stats">
                    <span title={`${copy('duration')} · ${copy('estimated')}`}>≈ {formatDuration(request.generationDurationMs)}</span>
                    <span>{formatCompact(request.usage.totalTokens, locale)} tok</span>
                    <span>{formatSpeed(request.outputTokensPerSecond)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {turn.tools.length > 0 && (
          <div className="codex-tool-timeline">
            {turn.tools.map((tool) => (
              <div className="codex-tool-chip" key={tool.id} data-status={tool.success === false ? 'failed' : tool.success === true ? 'success' : 'unknown'}>
                <span>{tool.name}</span>
                <small>{formatDuration(tool.durationMs)}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function MetricGrid({ metrics, compact = false }: { metrics: Array<{ label: string; value: string; detail?: string }>; compact?: boolean }) {
  return (
    <div className={compact ? 'codex-metric-grid codex-metric-grid--compact' : 'codex-metric-grid'}>
      {metrics.map((metric) => (
        <section className="panel codex-metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail && <small>{metric.detail}</small>}
        </section>
      ))}
    </div>
  );
}

function DashboardPanel({ title, children, compact = false }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <section className={compact ? 'panel codex-dashboard-panel codex-dashboard-panel--compact' : 'panel codex-dashboard-panel'}>
      <div className="codex-panel-heading">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DailyActivityChart({ data, locale }: { data: DailyStats[]; locale: Locale }) {
  const maxTokens = Math.max(1, ...data.map((day) => day.usage.totalTokens));
  return (
    <div className="codex-activity-chart">
      {data.map((day) => (
        <div className="codex-activity-day" key={day.date} title={`${formatDate(day.date, locale)} · ${formatInteger(day.usage.totalTokens, locale)} tokens`}>
          <div className="codex-activity-bar">
            <span style={{ blockSize: `${Math.max(day.usage.totalTokens > 0 ? 5 : 0, (day.usage.totalTokens / maxTokens) * 100)}%` }} />
          </div>
          <strong>{formatCompact(day.usage.totalTokens, locale)}</strong>
          <span>{formatWeekday(day.date, locale)}</span>
        </div>
      ))}
    </div>
  );
}

function ModelUsageChart({ stats, locale, copy }: { stats: ModelStats[]; locale: Locale; copy: CopyFunction }) {
  const maxTokens = Math.max(1, ...stats.map((model) => model.usage.totalTokens));
  if (stats.length === 0) return <div className="codex-chart-empty">—</div>;

  return (
    <div className="codex-model-chart">
      {stats.map((model) => (
        <div className="codex-model-row" key={model.model}>
          <div className="codex-model-row-heading">
            <strong>{model.model}</strong>
            <span>{formatCompact(model.usage.totalTokens, locale)} tok</span>
          </div>
          <div className="codex-horizontal-track" aria-hidden="true">
            <span style={{ inlineSize: `${Math.max(2, (model.usage.totalTokens / maxTokens) * 100)}%` }} />
          </div>
          <div className="codex-model-meta">
            <span>{model.requestCount} req</span>
            <span>{copy('speed')} {formatSpeed(model.outputTokensPerSecond)}</span>
            <span>{copy('averageRequest')} {formatDuration(model.averageRequestDurationMs)}</span>
            <span>{copy('p95')} {formatDuration(model.p95RequestDurationMs)}</span>
            <span>{copy('cacheHit')} {formatPercent(model.cacheHitRate)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolUsageChart({ stats, locale }: { stats: ToolStats[]; locale: Locale }) {
  const visible = stats.slice(0, 8);
  const maxCount = Math.max(1, ...visible.map((tool) => tool.count));
  if (visible.length === 0) return <div className="codex-chart-empty">—</div>;

  return (
    <div className="codex-tool-chart">
      {visible.map((tool) => (
        <div className="codex-tool-row" key={`${tool.category}:${tool.name}`}>
          <div>
            <strong title={tool.name}>{truncate(tool.name, 26)}</strong>
            <span>{tool.category}</span>
          </div>
          <div className="codex-horizontal-track" aria-hidden="true">
            <span style={{ inlineSize: `${Math.max(3, (tool.count / maxCount) * 100)}%` }} />
          </div>
          <span>{formatInteger(tool.count, locale)}</span>
        </div>
      ))}
    </div>
  );
}

function ProjectList({ projects, locale, copy, onProject }: { projects: ProjectAnalysis[]; locale: Locale; copy: CopyFunction; onProject: (id: string) => void }) {
  return (
    <div className="codex-project-list">
      {projects.map((project) => (
        <button type="button" className="codex-project-card" key={project.id} onClick={() => onProject(project.id)}>
          <div>
            <strong>{project.name}</strong>
            <span title={project.path}>{truncate(project.path, 54)}</span>
          </div>
          <div className="codex-project-card-stats">
            <span>{project.totals.sessionCount} {copy('sessions')}</span>
            <span>{formatCompact(project.totals.usage.totalTokens, locale)} tok</span>
            <time dateTime={project.updatedAt}>{formatRelativeTime(project.updatedAt, locale)}</time>
          </div>
        </button>
      ))}
    </div>
  );
}

function SessionList({ sessions, locale, copy, onSession }: { sessions: SessionAnalysis[]; locale: Locale; copy: CopyFunction; onSession: (id: string) => void }) {
  return (
    <div className="codex-session-list">
      {sessions.map((session) => (
        <button type="button" className="codex-session-row" key={session.id} onClick={() => onSession(session.id)}>
          <div className="codex-session-row-title">
            <strong>{session.title}</strong>
            <span>{session.projectName}</span>
          </div>
          <div className="codex-session-row-flags">
            {session.isSubagent && <span>{copy('subagent')}</span>}
            {session.archived && <span>{copy('archived')}</span>}
            <StatusBadge status={session.status} copy={copy} />
          </div>
          <div className="codex-session-row-metrics">
            <span>{formatCompact(session.usage.totalTokens, locale)} tok</span>
            <span>{session.requestCount} req</span>
            <span>{session.toolCallCount} tools</span>
            <time dateTime={session.updatedAt}>{formatRelativeTime(session.updatedAt, locale)}</time>
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status, copy }: { status: SessionStatus; copy: CopyFunction }) {
  const label = status === 'completed' ? copy('statusCompleted') : status === 'aborted' ? copy('statusAborted') : copy('statusIncomplete');
  return <span className="codex-status-badge" data-status={status}>{label}</span>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="codex-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type CopyFunction = (key: CodexAnalyzerUiKey, variables?: Record<string, string | number>) => string;

async function collectDirectoryEntries(
  handle: DirectoryHandleLike,
  lookbackDays: number,
): Promise<{
  rollouts: Array<{ path: string; handle: FileHandleLike }>;
  sessionIndex: FileHandleLike | null;
}> {
  const rolloutEntries: Array<{ path: string; handle: FileHandleLike }> = [];
  let sessionIndex: FileHandleLike | null = null;
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const rootIsRolloutScope = handle.name === 'sessions' || handle.name === 'archived_sessions';

  async function walk(directory: DirectoryHandleLike, parentPath: string, rolloutScope: boolean) {
    for await (const entry of directory.values()) {
      const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        const nextScope = rolloutScope || entry.name === 'sessions' || entry.name === 'archived_sessions';
        if (nextScope) await walk(entry, path, true);
        continue;
      }
      if (entry.name === 'session_index.jsonl') sessionIndex = entry;
      if (!isRolloutPath(path)) continue;
      const file = await entry.getFile();
      if (fileInRange(path, file.lastModified, cutoff)) rolloutEntries.push({ path, handle: entry });
    }
  }

  await walk(handle, handle.name, rootIsRolloutScope);
  rolloutEntries.sort((left, right) => left.path.localeCompare(right.path));
  return { rollouts: rolloutEntries, sessionIndex };
}

function isRolloutPath(path: string): boolean {
  return /(?:^|\/)rollout-[^/]+\.jsonl$/i.test(path);
}

function fileInRange(path: string, lastModified: number, cutoff: number): boolean {
  const dateMatch = path.match(/(?:sessions|archived_sessions)\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const fileDayEnd = Date.UTC(Number(year), Number(month) - 1, Number(day) + 1);
    return fileDayEnd >= cutoff;
  }
  return !lastModified || lastModified >= cutoff;
}

function relativeFilePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function normalizeSettings(value: Partial<CodexAnalyzerOptions>): CodexAnalyzerOptions {
  const lookbackDays = Math.max(1, Math.min(30, Math.round(value.lookbackDays ?? DEFAULT_SETTINGS.lookbackDays)));
  return {
    lookbackDays,
    includeArchived: value.includeArchived ?? DEFAULT_SETTINGS.includeArchived,
    includeSubagents: value.includeSubagents ?? DEFAULT_SETTINGS.includeSubagents,
  };
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(value >= 0.1 ? 0 : 1)}%`;
}

function formatDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 1_000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`;
  if (value < 3_600_000) return `${(value / 60_000).toFixed(1)} min`;
  return `${(value / 3_600_000).toFixed(1)} h`;
}

function formatSpeed(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(value >= 10 ? 1 : 2)} tok/s`;
}

function formatDateTime(value: string, locale: Locale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatWeekday(value: string, locale: Locale): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' }).format(date);
}

function formatRelativeTime(value: string, locale: Locale): string {
  const delta = Date.parse(value) - Date.now();
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
  const absolute = Math.abs(delta);
  if (absolute < 60 * 60 * 1000) return formatter.format(Math.round(delta / (60 * 1000)), 'minute');
  if (absolute < 24 * 60 * 60 * 1000) return formatter.format(Math.round(delta / (60 * 60 * 1000)), 'hour');
  return formatter.format(Math.round(delta / (24 * 60 * 60 * 1000)), 'day');
}

function intlLocale(locale: Locale): string {
  return locale === 'zh-CN' ? 'zh-CN' : locale;
}

function tokenComposition(usage: TokenUsage, locale: Locale, copy: CopyFunction): string {
  return `${copy('input')} ${formatCompact(usage.inputTokens, locale)} · ${copy('output')} ${formatCompact(usage.outputTokens, locale)}`;
}

function averageModelDuration(stats: ModelStats[]): number | null {
  const durations = stats.filter((stat) => stat.averageRequestDurationMs !== null && stat.requestCount > 0);
  const requests = durations.reduce((sum, stat) => sum + stat.requestCount, 0);
  if (requests === 0) return null;
  return durations.reduce((sum, stat) => sum + (stat.averageRequestDurationMs ?? 0) * stat.requestCount, 0) / requests;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
