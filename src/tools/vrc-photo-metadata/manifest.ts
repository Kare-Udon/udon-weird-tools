import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'vrc-photo-metadata',
  version: '1.0.0',
  category: 'data',
  tags: ['VRChat', 'VRC', 'metadata', 'PNG', 'XMP'],
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
      'zh-CN': 'VRC 照片信息解析器',
      en: 'VRC Photo Metadata Parser',
      ja: 'VRC 写真メタデータ解析',
    },
    description: {
      'zh-CN': '在浏览器本地读取 VRChat 相机 PNG 的 XMP metadata，解析用户名、世界 ID、世界名和作者 ID。',
      en: 'Read VRChat camera PNG XMP metadata locally in the browser and extract username, world ID, world name, and author ID.',
      ja: 'VRChat カメラ PNG の XMP メタデータをブラウザ内で読み取り、ユーザー名、ワールド ID、ワールド名、作者 ID を抽出します。',
    },
  },
} as const satisfies ToolManifest;
