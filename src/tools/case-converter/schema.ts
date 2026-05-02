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
      'zh-CN': '例如 user profile page',
      en: 'For example user profile page',
      ja: '例: user profile page',
    },
  },
  {
    name: 'targetCase',
    type: 'select',
    defaultValue: 'camel',
    label: {
      'zh-CN': '目标格式',
      en: 'Target case',
      ja: '目標ケース',
    },
    options: [
      { value: 'camel', label: { 'zh-CN': 'camelCase', en: 'camelCase', ja: 'camelCase' } },
      { value: 'pascal', label: { 'zh-CN': 'PascalCase', en: 'PascalCase', ja: 'PascalCase' } },
      { value: 'snake', label: { 'zh-CN': 'snake_case', en: 'snake_case', ja: 'snake_case' } },
      { value: 'kebab', label: { 'zh-CN': 'kebab-case', en: 'kebab-case', ja: 'kebab-case' } },
      { value: 'constant', label: { 'zh-CN': 'CONSTANT_CASE', en: 'CONSTANT_CASE', ja: 'CONSTANT_CASE' } },
    ],
  },
  {
    name: 'perLine',
    type: 'checkbox',
    defaultValue: true,
    label: {
      'zh-CN': '逐行转换',
      en: 'Convert line by line',
      ja: '行ごとに変換',
    },
  },
] as const satisfies ToolField[];
