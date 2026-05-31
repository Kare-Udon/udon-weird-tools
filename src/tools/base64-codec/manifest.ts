import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'base64-codec',
  version: '1.0.0',
  category: 'text',
  tags: ['base64', 'encode', 'decode', 'text'],
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
      'zh-CN': 'Base64 编码解码',
      en: 'Base64 Encoder / Decoder',
      ja: 'Base64 エンコード / デコード',
    },
    description: {
      'zh-CN': '在浏览器本地实时进行 Base64 编码和解码，支持 URL-safe 格式和换行输出。',
      en: 'Encode and decode Base64 locally in the browser with URL-safe and wrapped-output options.',
      ja: 'ブラウザ内で Base64 のエンコードとデコードを行い、URL-safe 形式と折り返し出力に対応します。',
    },
  },
} as const satisfies ToolManifest;
