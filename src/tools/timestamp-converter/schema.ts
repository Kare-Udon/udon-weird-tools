import type { ToolField } from '../_types';

export const inputFields = [
  {
    name: 'value',
    type: 'text',
    required: true,
    label: {
      'zh-CN': '时间值',
      en: 'Time value',
    },
    placeholder: {
      'zh-CN': '例如 1714550400、1714550400000、2026-05-01T12:00:00+09:00',
      en: 'For example 1714550400, 1714550400000, 2026-05-01T12:00:00+09:00',
    },
  },
  {
    name: 'displayLocale',
    type: 'select',
    defaultValue: 'auto',
    label: {
      'zh-CN': '显示语言',
      en: 'Display locale',
    },
    options: [
      { value: 'auto', label: { 'zh-CN': '跟随页面语言', en: 'Follow page language' } },
      { value: 'zh-CN', label: { 'zh-CN': '简体中文', en: 'Simplified Chinese' } },
      { value: 'en-US', label: { 'zh-CN': 'English (US)', en: 'English (US)' } },
      { value: 'ja-JP', label: { 'zh-CN': '日本語', en: 'Japanese' } },
    ],
  },
] as const satisfies ToolField[];
