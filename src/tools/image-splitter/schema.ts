import type { ToolField } from '../_types';
import type { ImageSplitterInput, SplitDirection, SplitMode } from './run';

export const inputFields = [
  {
    name: 'width',
    type: 'number',
    required: true,
    min: 1,
    step: 1,
    label: {
      'zh-CN': '原图宽度',
      en: 'Source width',
      ja: '元画像の幅',
    },
  },
  {
    name: 'height',
    type: 'number',
    required: true,
    min: 1,
    step: 1,
    label: {
      'zh-CN': '原图高度',
      en: 'Source height',
      ja: '元画像の高さ',
    },
  },
  {
    name: 'direction',
    type: 'select',
    defaultValue: 'vertical',
    label: {
      'zh-CN': '切分方向',
      en: 'Split direction',
      ja: '分割方向',
    },
    options: [
      {
        value: 'vertical',
        label: {
          'zh-CN': '纵向（左右分片）',
          en: 'Vertical (left to right)',
          ja: '縦（左から右）',
        },
      },
      {
        value: 'horizontal',
        label: {
          'zh-CN': '横向（上下分片）',
          en: 'Horizontal (top to bottom)',
          ja: '横（上から下）',
        },
      },
    ],
  },
  {
    name: 'count',
    type: 'number',
    defaultValue: 3,
    min: 2,
    max: 32,
    step: 1,
    label: {
      'zh-CN': '切分数量',
      en: 'Number of slices',
      ja: '分割数',
    },
  },
  {
    name: 'mode',
    type: 'select',
    defaultValue: 'equal',
    label: {
      'zh-CN': '切分比率',
      en: 'Split ratio',
      ja: '分割比率',
    },
    options: [
      {
        value: 'equal',
        label: {
          'zh-CN': '均等切分',
          en: 'Equal slices',
          ja: '均等分割',
        },
      },
      {
        value: 'free',
        label: {
          'zh-CN': '自由切分',
          en: 'Free cuts',
          ja: '自由分割',
        },
      },
    ],
  },
] as const satisfies ToolField[];

export type ImageSplitterFormValues = {
  width: number;
  height: number;
  direction: SplitDirection;
  count: number;
  mode: SplitMode;
  cuts?: number[];
};

export function toImageSplitterInput(values: ImageSplitterFormValues): ImageSplitterInput {
  const input: ImageSplitterInput = {
    width: values.width,
    height: values.height,
    direction: values.direction,
    count: values.count,
    mode: values.mode,
  };

  if (values.mode === 'free' && values.cuts !== undefined) input.cuts = [...values.cuts];
  return input;
}
