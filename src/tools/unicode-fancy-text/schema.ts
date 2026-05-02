import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'text',
    type: 'textarea',
    rows: 8,
    required: true,
    label: {
      'zh-CN': '文本',
      en: 'Text',
      ja: 'テキスト',
    },
    placeholder: {
      'zh-CN': '例如 Hello World 123',
      en: 'For example Hello World 123',
      ja: '例: Hello World 123',
    },
  },
  {
    name: 'unsupportedMode',
    type: 'select',
    defaultValue: 'preserve',
    label: {
      'zh-CN': '不支持字符',
      en: 'Unsupported characters',
      ja: '未対応文字',
    },
    options: [
      { value: 'preserve', label: { 'zh-CN': '保留原文', en: 'Preserve original', ja: '元の文字を保持' } },
      { value: 'omit', label: { 'zh-CN': '省略', en: 'Omit', ja: '省略' } },
    ],
  },
] as const satisfies ToolField[];
