import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../../components/CodexSessionAnalyzerTool.tsx', import.meta.url), 'utf8');

test('all Token display points call the shared token+cost formatter', () => {
  const coverage = [
    ['overview total metric', 'formatTokenMetric(totals.usage, totals.cost'],
    ['overview composition detail', 'tokenComposition(totals.usage, totals.cost'],
    ['model usage row', 'formatTokenMetric(model.usage, model.cost'],
    ['project detail total metric', 'formatTokenMetric(project.totals.usage, project.totals.cost'],
    ['project list', 'formatTokenMetric(project.totals.usage, project.totals.cost'],
    ['session detail total metric', 'formatTokenMetric(session.usage, session.cost'],
    ['session list', 'formatTokenMetric(session.usage, session.cost'],
    ['turn summary', 'formatTokenMetric(turn.usage, turn.cost'],
    ['request row', 'formatTokenMetric(request.usage, request.cost'],
  ];

  for (const [label, marker] of coverage) {
    assert.ok(component.includes(marker), `${label} is not bound to the shared token+cost formatter`);
  }

  const dailyChartStart = component.indexOf('function DailyActivityChart');
  const dailyChartEnd = component.indexOf('function ModelUsageChart', dailyChartStart);
  assert.ok(dailyChartStart >= 0 && dailyChartEnd > dailyChartStart, 'daily chart source range is missing');
  const dailyChart = component.slice(dailyChartStart, dailyChartEnd);
  const tooltipMarker = 'title={`${formatDate(day.date, locale)} · ${formatTokenMetric(day.usage, day.cost, locale, copy)}`}';
  const visibleMarker = '<strong>{formatTokenMetric(day.usage, day.cost, locale, copy)}</strong>';
  assert.ok(dailyChart.includes(tooltipMarker), 'daily tooltip is not bound to the shared token+cost formatter');
  assert.ok(dailyChart.includes(visibleMarker), 'daily visible value is not bound to the shared token+cost formatter');
  assert.notEqual(dailyChart.indexOf(tooltipMarker), dailyChart.indexOf(visibleMarker), 'daily tooltip and visible value need independent source markers');
});

test('the component does not retain raw total-token formatting at dashboard display points', () => {
  assert.doesNotMatch(component, /formatCompact\((?:totals|project\.totals|session|turn|request|day|model)\.usage\.totalTokens/);
});
