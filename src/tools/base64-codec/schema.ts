import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'text',
    type: 'textarea',
    rows: 12,
    required: true,
    label: {
      'zh-CN': '输入文本',
      en: 'Input text',
      ja: '入力テキスト',
    },
  },
  {
    name: 'mode',
    type: 'select',
    defaultValue: 'encode',
    label: {
      'zh-CN': '模式',
      en: 'Mode',
      ja: 'モード',
    },
    options: [
      { value: 'encode', label: { 'zh-CN': '编码', en: 'Encode', ja: 'エンコード' } },
      { value: 'decode', label: { 'zh-CN': '解码', en: 'Decode', ja: 'デコード' } },
    ],
  },
  {
    name: 'encoding',
    type: 'select',
    defaultValue: 'utf-8',
    label: {
      'zh-CN': '字符编码',
      en: 'Character encoding',
      ja: '文字エンコーディング',
    },
    options: [
      { value: 'utf-8', label: { 'zh-CN': 'UTF-8', en: 'UTF-8', ja: 'UTF-8' } },
      { value: 'latin1', label: { 'zh-CN': 'Latin-1', en: 'Latin-1', ja: 'Latin-1' } },
    ],
  },
  {
    name: 'urlSafe',
    type: 'checkbox',
    defaultValue: false,
    label: {
      'zh-CN': '使用 URL-safe Base64',
      en: 'Use URL-safe Base64',
      ja: 'URL-safe Base64 を使う',
    },
  },
  {
    name: 'wrap',
    type: 'checkbox',
    defaultValue: false,
    label: {
      'zh-CN': '按 76 字符换行',
      en: 'Wrap at 76 characters',
      ja: '76 文字で折り返す',
    },
  },
] as const satisfies ToolField[];
