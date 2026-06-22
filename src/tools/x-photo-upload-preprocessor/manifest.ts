import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'x-photo-upload-preprocessor',
  version: '1.0.0',
  category: 'data',
  tags: ['X', 'Twitter', 'JPEG', '4K', 'photo'],
  status: 'experimental',
  runtime: 'client',
  execution: {
    mode: 'sync',
    worker: false,
    pure: true,
  },
  ui: {
    resultType: 'download',
  },
  i18n: {
    name: {
      'zh-CN': 'X 照片上传前处理',
      en: 'X Photo Upload Preprocessor',
      ja: 'X 写真アップロード前処理',
    },
    description: {
      'zh-CN': '预处理上传 X 的照片，减少上传后被二次压缩的概率。',
      en: 'Preprocess photos for X uploads to reduce the chance of recompression.',
      ja: 'X へアップロードする写真を前処理し、再圧縮される可能性を減らします。',
    },
  },
} as const satisfies ToolManifest;
