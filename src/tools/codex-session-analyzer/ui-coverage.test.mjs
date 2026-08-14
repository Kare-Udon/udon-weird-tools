import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../../components/CodexSessionAnalyzerTool.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');

function sourceBetween(startMarker, endMarker, label) {
  const start = component.indexOf(startMarker);
  assert.ok(start >= 0, `${label} source range is missing: ${startMarker}`);
  const end = component.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label} source range has no end marker: ${endMarker}`);
  return component.slice(start, end);
}

function namedComponentRange(name, label) {
  const declaration = component.match(new RegExp(`(?:function|const)\\s+${name}\\b`));
  assert.ok(declaration?.index !== undefined, `${label} component declaration is missing`);
  const start = declaration.index;
  const end = component.indexOf('\nfunction ', start + declaration[0].length);
  return component.slice(start, end >= 0 ? end : component.length);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function assertKeyboardOperable(source, label) {
  const hasNativeButton = /<button\b[^>]*type=["']button["']/.test(source);
  const hasAriaButton =
    /role=["']button["']/.test(source) &&
    /tabIndex=\{?\s*0\s*\}?/.test(source) &&
    /onKeyDown=/.test(source);

  assert.ok(hasNativeButton || hasAriaButton, `${label} is not keyboard operable`);
  assert.match(source, /onClick=/, `${label} is not clickable`);
}

function assertFlipFaces(source, label, { requireLargeCostBadge = false } = {}) {
  const tokenFace = source.match(/data-(?:face|view)=["'](?:token|tokens|front)["']/i);
  const costFace = source.match(/data-(?:face|view)=["'](?:cost|price|back)["']/i);
  assert.ok(tokenFace && costFace, `${label} must expose separate Token and price faces`);

  const tokenFaceSource = source.slice(tokenFace.index, costFace.index);
  const costFaceSource = source.slice(costFace.index);
  assert.match(
    tokenFaceSource,
    /(?:formatCompact|formatToken(?:Count|Value)|<Token(?:Value|Count)\b|\.usage\.totalTokens)/,
    `${label} Token face is not bound to a token value`,
  );
  assert.doesNotMatch(tokenFaceSource, /<CostBadge\b/, `${label} Token face contains the price badge`);
  assert.match(costFaceSource, /<CostBadge\b/, `${label} price face is not bound to the shared cost badge`);
  if (requireLargeCostBadge) {
    assert.match(
      costFaceSource,
      /<CostBadge\b(?=[^>]*\blarge(?:\s|=))[^>]*\/>/,
      `${label} price face must use the large shared cost badge`,
    );
  }
}

test('Data source contains no pricing explainer nodes', () => {
  const sourcePanel = sourceBetween('<section className="panel codex-source-panel">', '\n      {error &&', 'Data source panel');

  assert.doesNotMatch(
    sourcePanel,
    /(?:CODEX_PRICING_SNAPSHOT|codex-pricing|pricing(?:Title|Hint|Details|Limitations|FetchedAt|Source|ModelDirectory)|Estimated cost|估算费用|费用估算)/i,
    'Data source must not render a pricing explanation or snapshot note',
  );
});

test('Overview Total Tokens is an interactive Token/price flip card with one compact help affordance', () => {
  const overview = sourceBetween('function OverviewDashboard', 'function ProjectDashboard', 'Overview dashboard');
  assert.match(overview, /<TokenCostFlipCard\b/, 'Overview Total Tokens is not bound to the shared flip-card component');

  const flipCard = namedComponentRange('TokenCostFlipCard', 'TokenCostFlipCard');
  assertKeyboardOperable(flipCard, 'Overview Total Tokens flip card');
  assertFlipFaces(flipCard, 'Overview Total Tokens flip card', { requireLargeCostBadge: true });

  const rootOpening = flipCard.match(/<section\b[^>]*className="[^"]*\bpanel\b[^\"]*\bcodex-metric-card\b[^>]*>/);
  assert.ok(rootOpening, 'TokenCostFlipCard must render its own panel metric-card root');
  assert.match(rootOpening[0], /onClick=/, 'TokenCostFlipCard root card must own the click handler');

  const keyboardClass = flipCard.indexOf('className="codex-token-cost-flip"');
  const keyboardStart = flipCard.lastIndexOf('<', keyboardClass);
  const keyboardFirstChild = flipCard.indexOf('<span className="codex-token-cost-card-label"', keyboardStart);
  assert.ok(keyboardStart >= 0 && keyboardFirstChild > keyboardStart, 'TokenCostFlipCard keyboard target is missing');
  const keyboardTarget = flipCard.slice(keyboardStart, keyboardFirstChild);
  assert.match(keyboardTarget, /role="button"/, 'TokenCostFlipCard keyboard target must expose role=button');
  assert.match(keyboardTarget, /tabIndex=\{0\}/, 'TokenCostFlipCard keyboard target must be focusable');
  assert.match(keyboardTarget, /onClick=/, 'TokenCostFlipCard keyboard target must be clickable');
  assert.match(keyboardTarget, /onKeyDown=/, 'TokenCostFlipCard keyboard target must handle keyboard activation');

  const helpClass = flipCard.indexOf('className="codex-pricing-help"');
  const helpStart = flipCard.lastIndexOf('<', helpClass);
  assert.ok(keyboardStart >= 0 && helpStart > keyboardStart, 'pricing help must follow the flip target as a sibling');
  assert.match(flipCard.slice(keyboardStart, helpStart), /<\/div>\s*$/, 'pricing help must be a sibling of the internal keyboard target');

  assert.equal(countMatches(flipCard, /className="codex-pricing-help"/g), 1, 'the ? help control must be unique inside the flip card');
  assert.equal(countMatches(flipCard, /(?:^|\n)\s*\?\s*(?:\n|$)/gm), 1, 'the flip card must render exactly one ? help mark');
  const helpEnd = flipCard.indexOf('</button>', helpStart);
  assert.ok(helpEnd > helpStart, 'the ? help control must be a button');
  const helpButton = flipCard.slice(helpStart, helpEnd + '</button>'.length);
  assert.match(helpButton, /<button\b[^>]*type="button"/, 'the ? help control must be a button');
  assert.match(helpButton, /onClick=\{\s*\(\s*event\s*\)\s*=>\s*event\.stopPropagation\(\)\s*\}/, 'the ? help button must stop propagation');

  assert.equal(countMatches(component, /codex-pricing-help/g), 1, 'the pricing help affordance must be unique');
  assert.match(flipCard, /codex-pricing-help/, 'the unique pricing help affordance is not inside the Total Tokens card');
  assert.match(flipCard, /(?:\?|copy\(['"]pricingHelp['"]\))/, 'the pricing help affordance must expose a ? hint');
  assert.match(flipCard, /pricingLimitations/, 'the pricing help must state the estimation limitation');
  assert.match(flipCard, /pricingFetchedAt/, 'the pricing help must label the snapshot time');
  assert.match(flipCard, /CODEX_PRICING_SNAPSHOT\.fetchedAt/, 'the pricing help must show the snapshot time');

  const otherDashboardRanges = [
    sourceBetween('function DailyActivityChart', 'function ModelUsageChart', 'Daily activity chart'),
    sourceBetween('function ModelUsageChart', 'function ToolUsageChart', 'Model usage chart'),
    sourceBetween('function ProjectDashboard', 'function SessionDashboard', 'Project dashboard'),
    sourceBetween('function SessionDashboard', 'function TurnCard', 'Session dashboard'),
    sourceBetween('function TurnCard', 'function MetricGrid', 'Turn and request rows'),
    sourceBetween('function ProjectList', 'function SessionList', 'Project list'),
    sourceBetween('function SessionList', 'function StatusBadge', 'Session list'),
  ];
  for (const range of otherDashboardRanges) {
    assert.doesNotMatch(
      range,
      /(?:pricingTitle|pricingHint|pricingDetails|pricingLimitations|pricingFetchedAt|pricingSource|pricingModelDirectory)/,
      'pricing explanation copy must not be repeated outside the Total Tokens help affordance',
    );
  }
});

test('Daily activity is an interactive Token/price flip chart', () => {
  const dailyChart = sourceBetween('function DailyActivityChart', 'function ModelUsageChart', 'Daily activity chart');
  assertKeyboardOperable(dailyChart, 'Daily activity chart');

  const rootStart = dailyChart.lastIndexOf('<', dailyChart.indexOf('codex-activity-chart'));
  const rootEnd = dailyChart.indexOf('>', rootStart);
  assert.ok(rootStart >= 0 && rootEnd > rootStart, 'Daily activity chart root is missing');
  const rootOpening = dailyChart.slice(rootStart, rootEnd + 1);
  const isNativeButton = /^<button\b/.test(rootOpening);
  assert.ok(isNativeButton || /role=["']button["']/.test(rootOpening), 'the entire Daily activity chart must be the interactive target');
  assert.match(rootOpening, /onClick=/, 'the Daily activity chart root must toggle on click');
  if (!isNativeButton) {
    assert.match(rootOpening, /tabIndex=\{?\s*0\s*\}?/, 'the Daily activity chart root must be focusable');
    assert.match(rootOpening, /onKeyDown=/, 'the Daily activity chart root must toggle from the keyboard');
  }

  assertFlipFaces(dailyChart, 'Daily activity chart');
  const costBarRule = styles.match(/\.codex-activity-chart__face\[data-face=["']cost["']\]\s+\.codex-activity-bar\s+span\s*\{([\s\S]*?)\}/);
  assert.ok(costBarRule, 'Daily price face bar styling rule is missing');
  assert.match(costBarRule[1], /#8b5cf6/i, 'Daily price face bars must use the shared lavender color');
  assert.doesNotMatch(dailyChart, /\b(?:formatTokenMetric|formatTokenCost|tokenComposition)\b/, 'Daily activity must not use the legacy combined formatter');
});

test('All non-flip price displays use the shared compact CostBadge and disable legacy combined formatters', () => {
  assert.match(component, /(?:function|const)\s+CostBadge\b/, 'the shared CostBadge component is missing');
  const costBadge = namedComponentRange('CostBadge', 'CostBadge');
  assert.match(costBadge, /codex-cost-badge/, 'CostBadge must use the shared cost-badge styling hook');
  assert.match(costBadge, /large\s*=\s*false/, 'CostBadge must keep the normal compact variant as its default');
  assert.match(costBadge, /(?:formatUsd|formatCostBadge)\s*\(/, 'CostBadge must bind to a shared currency formatter');
  assert.doesNotMatch(costBadge, /(?:estimatedCost|Estimated cost|估算费用)/, 'CostBadge must not contain a long estimated-cost label');

  const formatUsd = namedComponentRange('formatUsd', 'formatUsd');
  assert.match(
    formatUsd,
    /amount\s*>\s*0[\s\S]*amount\s*<\s*(?:1e-8|0\.00000001)[\s\S]*toExponential/,
    'formatUsd must preserve non-zero scientific notation for amounts below 1e-8',
  );
  assert.doesNotMatch(formatUsd, /return\s+["'`]\$0["'`]/, 'formatUsd must not collapse the tiny positive branch to $0');

  assert.doesNotMatch(component, /\bformatTokenMetric\b/, 'legacy Token+cost formatter must be removed');
  assert.doesNotMatch(component, /\bformatTokenCost\b/, 'legacy long cost formatter must be removed');
  assert.doesNotMatch(component, /\btokenComposition\b/, 'legacy Token composition must not append a price sentence');
  assert.doesNotMatch(component, /copy\(['"]estimatedCost['"]\)/, 'Estimated cost copy must not be rendered at Token display points');

  const displayRanges = [
    [
      'Project dashboard totals',
      sourceBetween('function ProjectDashboard', 'function SessionDashboard', 'Project dashboard'),
      /project\.totals\.usage/,
    ],
    [
      'Session dashboard totals',
      sourceBetween('function SessionDashboard', 'function TurnCard', 'Session dashboard'),
      /session\.usage/,
    ],
    ['Model usage rows', sourceBetween('function ModelUsageChart', 'function ToolUsageChart', 'Model usage chart'), /model\.usage/],
    ['Turn and request rows', sourceBetween('function TurnCard', 'function MetricGrid', 'Turn and request rows'), /(?:turn|request)\.usage/],
    ['Project list rows', sourceBetween('function ProjectList', 'function SessionList', 'Project list'), /project\.totals\.usage/],
    ['Session list rows', sourceBetween('function SessionList', 'function StatusBadge', 'Session list'), /session\.usage/],
  ];
  for (const [label, range, usageMarker] of displayRanges) {
    assert.match(range, usageMarker, `${label} is not bound to Token usage data`);
    assert.match(range, /<CostBadge\b/, `${label} is not bound to the shared CostBadge`);
    assert.doesNotMatch(range, /\b(?:formatTokenMetric|formatTokenCost|tokenComposition)\b/, `${label} still uses a combined Token+price formatter`);
  }
});

test('Project and Session Total Tokens keep the large value token-only and attach CostBadge to the lower detail', () => {
  for (const [label, range] of [
    ['Project', sourceBetween('function ProjectDashboard', 'function SessionDashboard', 'Project dashboard')],
    ['Session', sourceBetween('function SessionDashboard', 'function TurnCard', 'Session dashboard')],
  ]) {
    const totalTokensStart = range.indexOf("label: copy('totalTokens')");
    assert.ok(totalTokensStart >= 0, `${label} Total Tokens metric is missing`);
    const metric = range.slice(totalTokensStart, totalTokensStart + 1_200);
    const valueMatch = metric.match(/value:\s*([\s\S]*?)(?=,\s*detail:)/);
    const detailMatch = metric.match(/detail:\s*([\s\S]*?)(?=\n\s*\},|\n\s*\])/);
    assert.ok(valueMatch, `${label} Total Tokens metric has no separable large value`);
    assert.ok(detailMatch, `${label} Total Tokens metric has no lower detail slot`);
    assert.doesNotMatch(valueMatch[1], /(?:cost|CostBadge|formatTokenMetric|formatTokenCost)/, `${label} large Token value contains price data`);
    assert.match(valueMatch[1], /(?:formatCompact|formatToken(?:Count|Value)|<Token(?:Value|Count)\b|\.usage\.totalTokens)/, `${label} large value is not bound to Token data`);
    assert.match(detailMatch[1], /<CostBadge\b/, `${label} lower Token detail is not bound to the shared CostBadge`);
  }
});
