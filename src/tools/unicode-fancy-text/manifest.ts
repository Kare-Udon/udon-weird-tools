import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'unicode-fancy-text',
  version: '1.0.0',
  category: 'text',
  tags: ['text', 'unicode', 'fancy'],
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
      'zh-CN': 'Unicode 花体文字生成器',
      en: 'Unicode Fancy Text Generator',
      ja: 'Unicode 装飾文字ジェネレーター',
    },
    description: {
      'zh-CN': '把普通英文字母和数字转换成可复制粘贴的 Unicode 花体文字，其他字符默认保留。',
      en: 'Convert plain Latin letters and digits into copyable Unicode fancy text while preserving other characters.',
      ja: '通常の英数字をコピー可能な Unicode 装飾文字に変換し、その他の文字は保持します。',
    },
  },
} as const satisfies ToolManifest;
