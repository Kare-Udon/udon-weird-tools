import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'photoFile',
    type: 'file',
    required: true,
    accept: '.png,image/png',
    maxSizeBytes: 80 * 1024 * 1024,
    label: {
      'zh-CN': 'VRChat PNG 照片',
      en: 'VRChat PNG photo',
      ja: 'VRChat PNG 写真',
    },
    helperText: {
      'zh-CN': '选择文件后会自动解析；照片只在浏览器本地读取，不会上传。',
      en: 'The photo is parsed automatically after selection and stays local in your browser.',
      ja: '選択後に自動で解析します。写真はブラウザ内だけで読み取られ、アップロードされません。',
    },
  },
] as const satisfies ToolField[];
