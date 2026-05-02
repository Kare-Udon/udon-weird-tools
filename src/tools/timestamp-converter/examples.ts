import type { ToolExample } from '../_types';
import type { TimestampConverterInput } from './run';

export const examples = [
  {
    name: {
      'zh-CN': '毫秒时间戳',
      en: 'Millisecond timestamp',
      ja: 'ミリ秒タイムスタンプ',
    },
    input: {
      value: '1714550400000',
      displayLocale: 'auto',
    },
  },
] satisfies ToolExample<TimestampConverterInput>[];
