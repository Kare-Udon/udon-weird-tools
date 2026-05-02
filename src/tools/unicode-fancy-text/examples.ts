import type { ToolExample } from '../_types';
import type { UnicodeFancyTextInput } from './run';

export const examples = [
  {
    name: {
      'zh-CN': '花体用户名',
      en: 'Fancy username',
      ja: '装飾ユーザー名',
    },
    input: {
      text: 'Udon Weird Tools 123',
      unsupportedMode: 'preserve',
    },
  },
] satisfies ToolExample<UnicodeFancyTextInput>[];
