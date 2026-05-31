import type { ToolExample } from '../_types';
import type { Base64CodecInput } from './run';

export const examples = [
  {
    name: {
      'zh-CN': '本地工具文本',
      en: 'Local tool text',
      ja: 'ローカルツールのテキスト',
    },
    input: {
      text: 'Udon Toolbox',
      mode: 'encode',
      encoding: 'utf-8',
      urlSafe: false,
      wrap: false,
    },
  },
] satisfies ToolExample<Base64CodecInput>[];
