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
    },
    placeholder: {
      'zh-CN': '例如 user profile page',
      en: 'For example user profile page',
    },
  },
  {
    name: 'targetCase',
    type: 'select',
    defaultValue: 'camel',
    label: {
      'zh-CN': '目标格式',
      en: 'Target case',
    },
    options: [
      { value: 'camel', label: { 'zh-CN': 'camelCase', en: 'camelCase' } },
      { value: 'pascal', label: { 'zh-CN': 'PascalCase', en: 'PascalCase' } },
      { value: 'snake', label: { 'zh-CN': 'snake_case', en: 'snake_case' } },
      { value: 'kebab', label: { 'zh-CN': 'kebab-case', en: 'kebab-case' } },
      { value: 'constant', label: { 'zh-CN': 'CONSTANT_CASE', en: 'CONSTANT_CASE' } },
    ],
  },
  {
    name: 'perLine',
    type: 'checkbox',
    defaultValue: true,
    label: {
      'zh-CN': '逐行转换',
      en: 'Convert line by line',
    },
  },
] as const satisfies ToolField[];
