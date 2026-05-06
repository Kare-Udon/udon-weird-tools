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
      'zh-CN': '文件只在浏览器本地处理。第一版限制上传文件不超过 80 MiB，解包后 ZIP 不超过 160 MiB。',
      en: 'The file is processed only in your browser. This first version limits uploads to 80 MiB and the generated ZIP to 160 MiB.',
      ja: 'ファイルはブラウザ内だけで処理されます。初版ではアップロードは 80 MiB、生成 ZIP は 160 MiB までです。',
    },
  },
] as const satisfies ToolField[];
