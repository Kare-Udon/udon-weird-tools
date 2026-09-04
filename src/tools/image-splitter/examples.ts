import type { ToolExample } from '../_types';
import type { ImageSplitterInput } from './run';

export const examples = [
  {
    name: {
      'zh-CN': '十字形图像的三等分',
      en: 'Three equal vertical slices',
      ja: '画像を縦に三等分',
    },
    input: {
      width: 120,
      height: 80,
      direction: 'vertical',
      count: 3,
      mode: 'equal',
    },
  },
  {
    name: {
      'zh-CN': '自定义横向分片',
      en: 'Custom horizontal cuts',
      ja: '横方向のカスタム分割',
    },
    input: {
      width: 80,
      height: 120,
      direction: 'horizontal',
      count: 4,
      mode: 'free',
      cuts: [24, 62, 96],
    },
  },
] satisfies ToolExample<ImageSplitterInput>[];
