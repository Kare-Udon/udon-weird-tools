import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'case-converter',
  version: '1.0.0',
  category: 'text',
  tags: ['text', 'case', 'naming'],
  status: 'stable',
  runtime: 'client',
  execution: {
    mode: 'sync',
    worker: false,
    pure: true,
  },
  ui: {
    resultType: 'text',
  },
  i18n: {
    name: {
      'zh-CN': '命名风格转换器',
      en: 'Case Converter',
    },
    description: {
      'zh-CN': '把短语、变量名或多行文本转换成 camelCase、snake_case、kebab-case 等格式。',
      en: 'Convert phrases, variable names, or multiline text into camelCase, snake_case, kebab-case, and more.',
    },
  },
} as const satisfies ToolManifest;
