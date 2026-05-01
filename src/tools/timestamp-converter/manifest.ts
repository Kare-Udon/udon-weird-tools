import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'timestamp-converter',
  version: '1.0.0',
  category: 'date',
  tags: ['time', 'timestamp', 'date'],
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
      'zh-CN': '时间戳转换器',
      en: 'Timestamp Converter',
    },
    description: {
      'zh-CN': '在 Unix 秒、毫秒、ISO 字符串和本地时间之间转换。',
      en: 'Convert between Unix seconds, milliseconds, ISO strings, and local time.',
    },
  },
} as const satisfies ToolManifest;
