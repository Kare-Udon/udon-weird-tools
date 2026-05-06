import type { ToolManifest } from '../_types';

export const manifest = {
  slug: 'unitypackage-extractor',
  version: '1.0.0',
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
      'zh-CN': '在浏览器本地把 .unitypackage 还原成 Assets 目录结构，并生成可下载 ZIP。',
      en: 'Restore a .unitypackage into its Assets folder structure locally in the browser, then generate a ZIP download.',
      ja: '.unitypackage をブラウザ内で Assets のディレクトリ構造に戻し、ZIP としてダウンロードできます。',
    },
  },
} as const satisfies ToolManifest;
