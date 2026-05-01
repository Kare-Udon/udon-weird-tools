import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'json-cleaner',
  version: '1.0.0',
  category: 'data',
  tags: ['json', 'formatter', 'parser'],
  status: 'stable',
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
      'zh-CN': 'JSON 清洗器',
      en: 'JSON Cleaner',
    },
    description: {
      'zh-CN': '整理伪 JSON、日志片段或带尾逗号的 JSON，并输出格式化结果。',
      en: 'Clean pseudo JSON, log snippets, or trailing commas, then format the result.',
    },
  },
} as const satisfies ToolManifest;
