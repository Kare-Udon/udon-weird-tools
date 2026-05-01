import type { ToolExample } from '../_types';
import type { CaseConverterInput } from './run';

export const examples = [
  {
    name: {
      'zh-CN': '组件名',
      en: 'Component name',
    },
    input: {
      text: 'user profile card',
      targetCase: 'pascal',
      perLine: true,
    },
  },
] satisfies ToolExample<CaseConverterInput>[];
