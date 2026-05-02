import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'value',
    type: 'text',
    required: true,
    label: {
      'zh-CN': '时间值',
      en: 'Time value',
      ja: '時刻値',
    },
    placeholder: {
      'zh-CN': '例如 1714550400、1714550400000、2026-05-01T12:00:00+09:00',
      en: 'For example 1714550400, 1714550400000, 2026-05-01T12:00:00+09:00',
      ja: '例: 1714550400、1714550400000、2026-05-01T12:00:00+09:00',
    },
  },
  {
    name: 'displayLocale',
    type: 'select',
    defaultValue: 'auto',
    label: {
      'zh-CN': '显示语言',
      en: 'Display locale',
      ja: '表示言語',
    },
    options: [
      { value: 'auto', label: { 'zh-CN': '跟随页面语言', en: 'Follow page language', ja: 'ページ言語に合わせる' } },
      { value: 'zh-CN', label: { 'zh-CN': '简体中文', en: 'Simplified Chinese', ja: '簡体字中国語' } },
      { value: 'en-US', label: { 'zh-CN': 'English (US)', en: 'English (US)', ja: '英語 (US)' } },
      { value: 'ja-JP', label: { 'zh-CN': '日本語', en: 'Japanese', ja: '日本語' } },
    ],
  },
] as const satisfies ToolField[];
