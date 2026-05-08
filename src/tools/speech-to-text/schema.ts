import type { ToolField } from '../_types';

export const inputFields: ToolField[] = [
  {
    name: 'audioFile',
    type: 'file',
    accept: 'audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm',
    maxSizeBytes: 30 * 1024 * 1024,
    label: {
      en: 'Audio file',
      ja: '音声ファイル',
      'zh-CN': '音频文件',
    },
    helperText: {
      en: 'Audio is decoded and transcribed in the browser.',
      ja: '音声はブラウザー内でデコードして文字起こしします。',
      'zh-CN': '音频会在浏览器内解码并转写。',
    },
    required: true,
  },
];
