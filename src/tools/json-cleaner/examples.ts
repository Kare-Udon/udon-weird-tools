import type { ToolExample } from '../_types';
import type { JsonCleanerInput } from './run';

export const examples = [
  {
    name: {
      'zh-CN': '带尾逗号的对象',
      en: 'Object with trailing commas',
    },
    input: {
      text: '{ user: "udon", active: true, tags: ["tool", "json",], }',
      mode: 'loose',
      indent: '2',
      sortKeys: true,
    },
  },
] satisfies ToolExample<JsonCleanerInput>[];
