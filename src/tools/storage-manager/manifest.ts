import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'storage-manager',
  version: '1.0.0',
  category: 'dev',
  tags: ['storage', 'cleanup', 'local'],
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
      'zh-CN': '存储管理',
      en: 'Storage Manager',
      ja: 'ストレージ管理',
    },
    description: {
      'zh-CN': '查看当前站点的浏览器端占用，按数据库条目和文件模型组清理本地数据。',
      en: 'Inspect this site’s browser storage and clean local data by database entry or file model group.',
      ja: 'このサイトのブラウザ内ストレージを確認し、DB 項目またはファイルモデル単位で削除します。',
    },
  },
} as const satisfies ToolManifest;
