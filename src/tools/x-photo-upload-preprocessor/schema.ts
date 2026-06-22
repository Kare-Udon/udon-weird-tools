import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'photoFile',
    type: 'file',
    required: true,
    accept: 'image/jpeg,image/png,image/webp,image/avif',
    maxSizeBytes: 80 * 1024 * 1024,
    label: {
      'zh-CN': '照片文件',
      en: 'Photo file',
      ja: '写真ファイル',
    },
    helperText: {
      'zh-CN': '选择照片后会自动处理；文件只在浏览器本地解码与压缩，不会上传。',
      en: 'The photo is processed automatically after selection and stays local in your browser.',
      ja: '選択後に自動で処理します。写真はブラウザ内だけでデコード・圧縮され、アップロードされません。',
    },
  },
] as const satisfies ToolField[];
