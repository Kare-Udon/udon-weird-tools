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
      ja: 'JSON またはテキスト断片',
    },
    placeholder: {
      'zh-CN': '粘贴 JSON、伪 JSON 或日志中的对象片段…',
      en: 'Paste JSON, pseudo JSON, or an object snippet from logs…',
      ja: 'JSON、疑似 JSON、ログ内のオブジェクト断片を貼り付け...',
    },
  },
  {
    name: 'mode',
    type: 'select',
    defaultValue: 'loose',
    label: {
      'zh-CN': '解析模式',
      en: 'Parse mode',
      ja: '解析モード',
    },
    options: [
      {
        value: 'loose',
        label: {
          'zh-CN': '宽松：尝试修复常见问题',
          en: 'Loose: repair common issues',
          ja: '緩い: よくある問題を修正',
        },
      },
      {
        value: 'strict',
        label: {
          'zh-CN': '严格：只接受合法 JSON',
          en: 'Strict: valid JSON only',
          ja: '厳密: 正しい JSON のみ',
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
      ja: 'インデント',
    },
    options: [
      { value: '2', label: { 'zh-CN': '2 个空格', en: '2 spaces', ja: 'スペース 2 個' } },
      { value: '4', label: { 'zh-CN': '4 个空格', en: '4 spaces', ja: 'スペース 4 個' } },
      { value: 'tab', label: { 'zh-CN': 'Tab', en: 'Tab', ja: 'タブ' } },
      { value: 'compact', label: { 'zh-CN': '压缩', en: 'Compact', ja: '圧縮' } },
    ],
  },
  {
    name: 'sortKeys',
    type: 'checkbox',
    defaultValue: false,
    label: {
      'zh-CN': '按 key 排序',
      en: 'Sort object keys',
      ja: 'キーで並べ替え',
    },
  },
] as const satisfies ToolField[];
