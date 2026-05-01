import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'text',
    type: 'textarea',
    rows: 12,
    required: true,
    label: {
      'zh-CN': 'JSON 或文本片段',
      en: 'JSON or text snippet',
    },
    placeholder: {
      'zh-CN': '粘贴 JSON、伪 JSON 或日志中的对象片段…',
      en: 'Paste JSON, pseudo JSON, or an object snippet from logs…',
    },
  },
  {
    name: 'mode',
    type: 'select',
    defaultValue: 'loose',
    label: {
      'zh-CN': '解析模式',
      en: 'Parse mode',
    },
    options: [
      {
        value: 'loose',
        label: {
          'zh-CN': '宽松：尝试修复常见问题',
          en: 'Loose: repair common issues',
        },
      },
      {
        value: 'strict',
        label: {
          'zh-CN': '严格：只接受合法 JSON',
          en: 'Strict: valid JSON only',
        },
      },
    ],
  },
  {
    name: 'indent',
    type: 'select',
    defaultValue: '2',
    label: {
      'zh-CN': '缩进',
      en: 'Indent',
    },
    options: [
      { value: '2', label: { 'zh-CN': '2 个空格', en: '2 spaces' } },
      { value: '4', label: { 'zh-CN': '4 个空格', en: '4 spaces' } },
      { value: 'tab', label: { 'zh-CN': 'Tab', en: 'Tab' } },
      { value: 'compact', label: { 'zh-CN': '压缩', en: 'Compact' } },
    ],
  },
  {
    name: 'sortKeys',
    type: 'checkbox',
    defaultValue: false,
    label: {
      'zh-CN': '按 key 排序',
      en: 'Sort object keys',
    },
  },
] as const satisfies ToolField[];
