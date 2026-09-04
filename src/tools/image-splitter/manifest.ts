import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'image-splitter',
  version: '1.0.0',
  category: 'data',
  tags: ['image', 'split', 'crop', 'png'],
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
      'zh-CN': '图像切分',
      en: 'Image Splitter',
      ja: '画像分割',
    },
    description: {
      'zh-CN': '在浏览器本地按纵向或横向将图像切成整数像素分片。',
      en: 'Split an image into integer-pixel slices vertically or horizontally in the browser.',
      ja: 'ブラウザ内で画像を縦または横方向に整数ピクセルのスライスへ分割します。',
    },
  },
} as const satisfies ToolManifest;
