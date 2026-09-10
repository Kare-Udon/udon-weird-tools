import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'packageFile',
    type: 'file',
    required: true,
    accept: '.unitypackage,application/gzip,application/x-gzip,application/octet-stream',
    maxSizeBytes: 80 * 1024 * 1024,
    label: {
      'zh-CN': 'Unitypackage 文件',
      en: 'Unitypackage file',
      ja: 'Unitypackage ファイル',
    },
    helperText: {
      'zh-CN': '文件只在浏览器本地处理。兼容时会流式写入新建磁盘子目录；不兼容时保留 ZIP 回退，输入限制 80 MiB、生成 ZIP 限制 160 MiB。',
      en: 'The file is processed only in your browser. Supported browsers stream into a new disk subdirectory; the ZIP fallback keeps the 80 MiB input and 160 MiB ZIP limits.',
      ja: 'ファイルはブラウザ内だけで処理されます。対応ブラウザでは新しいディスクのサブフォルダーへストリーミングし、ZIP フォールバックでは入力 80 MiB、生成 ZIP 160 MiB の上限を維持します。',
    },
  },
] as const satisfies ToolField[];
