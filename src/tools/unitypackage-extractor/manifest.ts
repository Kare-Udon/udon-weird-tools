import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'unitypackage-extractor',
  version: '1.1.0',
  category: 'dev',
  tags: ['unity', 'unitypackage', 'assets', 'archive', 'VRChat'],
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
      'zh-CN': 'Unitypackage 解包器',
      en: 'Unitypackage Extractor',
      ja: 'Unitypackage 展開ツール',
    },
    description: {
      'zh-CN': '在浏览器本地把 .unitypackage 还原成 Assets 目录结构；兼容时流式写入新建磁盘子目录，不兼容时回退为 ZIP 下载。',
      en: 'Restore a .unitypackage into its Assets folder structure locally; stream to a new disk subdirectory when supported, or fall back to a ZIP download.',
      ja: '.unitypackage をブラウザ内で Assets の構造に戻します。対応ブラウザでは新しいディスクのサブフォルダーへストリーミングし、非対応時は ZIP ダウンロードに戻ります。',
    },
  },
} as const satisfies ToolManifest;
