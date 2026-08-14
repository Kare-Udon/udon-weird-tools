export type TokenCostCoverage = 'complete' | 'partial' | 'unknown';

export type TokenCostEstimate = {
  amountUsd: number | null;
  coverage: TokenCostCoverage;
  unknownModels: string[];
};

export type PricingSnapshotMetadata = {
  fetchedAt: string;
  sourceUrl: string;
  modelDirectoryUrl: string;
  currency: 'USD';
  unit: 'USD / 1M text tokens';
  serviceTier: 'Standard';
  gpt56LongContextThresholdTokens: 272000;
};

export type CostUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
};

export type TokenRates = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export type ResolvedModelPrice = {
  requestedModel: string;
  canonicalModel: string;
  source: 'pricing' | 'model-detail/deprecated-detail';
  context: 'short' | 'long' | 'single';
  rates: TokenRates;
};

export const CODEX_PRICING_SNAPSHOT = {
  fetchedAt: '2026-08-14T11:58:31+08:00',
  sourceUrl: 'https://developers.openai.com/api/docs/pricing',
  modelDirectoryUrl: 'https://developers.openai.com/api/docs/models/all',
  currency: 'USD',
  unit: 'USD / 1M text tokens',
  serviceTier: 'Standard',
  gpt56LongContextThresholdTokens: 272000,
} as const satisfies PricingSnapshotMetadata;

const GPT56_SHORT_RATES: Record<string, TokenRates> = {
  'gpt-5.6-sol': { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 },
  'gpt-5.6-terra': { inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.2, outputUsdPerMillion: 12 },
  'gpt-5.6-luna': { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.2 },
};

const GPT56_LONG_RATES: Record<string, TokenRates> = {
  'gpt-5.6-sol': { inputUsdPerMillion: 10, cachedInputUsdPerMillion: 1, outputUsdPerMillion: 45 },
  'gpt-5.6-terra': { inputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.4, outputUsdPerMillion: 18 },
  'gpt-5.6-luna': { inputUsdPerMillion: 0.4, cachedInputUsdPerMillion: 0.04, outputUsdPerMillion: 1.8 },
};

const SINGLE_RATES: Record<string, TokenRates> = {
  'gpt-5.3-codex': { inputUsdPerMillion: 1.75, cachedInputUsdPerMillion: 0.175, outputUsdPerMillion: 14 },
  'gpt-5.5': { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 },
  'gpt-5.4': { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  'gpt-5.4-mini': { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
  'gpt-5.4-nano': { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.25 },
  'gpt-5.2': { inputUsdPerMillion: 1.75, cachedInputUsdPerMillion: 0.175, outputUsdPerMillion: 14 },
  'gpt-5.1': { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10 },
  'gpt-5': { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10 },
  'gpt-5-mini': { inputUsdPerMillion: 0.25, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 2 },
  'gpt-5-nano': { inputUsdPerMillion: 0.05, cachedInputUsdPerMillion: 0.005, outputUsdPerMillion: 0.4 },
  'gpt-5.2-codex': { inputUsdPerMillion: 1.75, cachedInputUsdPerMillion: 0.175, outputUsdPerMillion: 14 },
  'gpt-5.1-codex': { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10 },
  'gpt-5.1-codex-max': { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10 },
  'gpt-5.1-codex-mini': { inputUsdPerMillion: 0.25, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 2 },
  'gpt-5-codex': { inputUsdPerMillion: 1.25, cachedInputUsdPerMillion: 0.125, outputUsdPerMillion: 10 },
  'codex-mini-latest': { inputUsdPerMillion: 1.5, cachedInputUsdPerMillion: 0.375, outputUsdPerMillion: 6 },
};

const MODEL_ALIASES: Record<string, string> = {
  'gpt-5.6': 'gpt-5.6-sol',
  'gpt-5.5-2026-04-23': 'gpt-5.5',
  'gpt-5.4-2026-03-05': 'gpt-5.4',
  'gpt-5.2-2025-12-11': 'gpt-5.2',
  'gpt-5-2025-08-07': 'gpt-5',
};

const MODEL_DETAIL_IDS = new Set([
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5-codex',
  'codex-mini-latest',
]);

export function resolveModelPrice(model: string, inputTokens: number): ResolvedModelPrice | null {
  const canonicalModel = MODEL_ALIASES[model] ?? model;
  const isGpt56 = Boolean(GPT56_SHORT_RATES[canonicalModel]);
  const shortRates = GPT56_SHORT_RATES[canonicalModel];
  const longRates = GPT56_LONG_RATES[canonicalModel];
  const singleRates = SINGLE_RATES[canonicalModel];
  const rates = isGpt56 ? (inputTokens > CODEX_PRICING_SNAPSHOT.gpt56LongContextThresholdTokens ? longRates : shortRates) : singleRates;
  if (!rates) return null;

  return {
    requestedModel: model,
    canonicalModel,
    source: MODEL_DETAIL_IDS.has(canonicalModel) ? 'model-detail/deprecated-detail' : 'pricing',
    context: isGpt56 ? (inputTokens > CODEX_PRICING_SNAPSHOT.gpt56LongContextThresholdTokens ? 'long' : 'short') : 'single',
    rates,
  };
}

export function estimateTokenCost(model: string, usage: CostUsage): TokenCostEstimate {
  const price = resolveModelPrice(model, usage.inputTokens);
  if (!price) return unknownTokenCost(model);

  const inputTokens = nonNegative(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegative(usage.cachedInputTokens));
  const uncachedInputTokens = Math.min(inputTokens, nonNegative(usage.uncachedInputTokens));
  const outputTokens = nonNegative(usage.outputTokens);
  const amountUsd =
    (uncachedInputTokens * price.rates.inputUsdPerMillion +
      cachedInputTokens * price.rates.cachedInputUsdPerMillion +
      outputTokens * price.rates.outputUsdPerMillion) /
    1_000_000;

  return Number.isFinite(amountUsd)
    ? { amountUsd, coverage: 'complete', unknownModels: [] }
    : unknownTokenCost(model);
}

export function mergeTokenCosts(costs: TokenCostEstimate[]): TokenCostEstimate {
  let amountUsd = 0;
  let hasKnownAmount = false;
  const unknownModels = new Set<string>();

  for (const cost of costs) {
    const isNeutralZero = cost.amountUsd === 0 && cost.coverage === 'complete' && cost.unknownModels.length === 0;
    if (!isNeutralZero && cost.amountUsd !== null && Number.isFinite(cost.amountUsd)) {
      amountUsd += cost.amountUsd;
      hasKnownAmount = true;
    }
    for (const model of cost.unknownModels) unknownModels.add(model);
  }

  const sortedUnknownModels = [...unknownModels].sort();
  if (sortedUnknownModels.length === 0) {
    return { amountUsd: Number.isFinite(amountUsd) ? amountUsd : null, coverage: 'complete', unknownModels: [] };
  }
  if (!hasKnownAmount) return { amountUsd: null, coverage: 'unknown', unknownModels: sortedUnknownModels };
  return { amountUsd: Number.isFinite(amountUsd) ? amountUsd : null, coverage: 'partial', unknownModels: sortedUnknownModels };
}

export function zeroTokenCost(): TokenCostEstimate {
  return { amountUsd: 0, coverage: 'complete', unknownModels: [] };
}

function unknownTokenCost(model: string): TokenCostEstimate {
  return { amountUsd: null, coverage: 'unknown', unknownModels: [model || 'unknown'] };
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
