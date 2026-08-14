import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'codex-session-analyzer',
  version: '1.1.0',
  category: 'dev',
  tags: ['Codex', 'JSONL', 'tokens', 'analytics', 'local'],
  status: 'experimental',
  runtime: 'client',
  execution: {
    mode: 'sync',
    worker: false,
    pure: true,
  },
  ui: {
    resultType: 'json',
  },
  i18n: {
    name: {
      'zh-CN': 'Codex 对话分析器',
      en: 'Codex Session Analyzer',
      ja: 'Codex セッション分析',
    },
    description: {
      'zh-CN': '在浏览器本地分析近期 Codex rollout，按项目、对话和请求展示 Token、耗时、速度、工具调用与官方价格快照费用估算。',
      en: 'Analyze recent Codex rollouts locally and visualize tokens, timing, throughput, tool calls, and official price-snapshot cost estimates by project and session.',
      ja: '最近の Codex rollout をブラウザ内で解析し、プロジェクト・セッション・リクエスト別にトークン、時間、速度、ツール呼び出し、公式価格スナップショットによる費用推定を可視化します。',
    },
  },
} as const satisfies ToolManifest;
