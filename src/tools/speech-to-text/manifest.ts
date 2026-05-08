import type { ToolManifest } from '../_types';

export const manifest: ToolManifest = {
  slug: 'speech-to-text',
  version: '0.1.0',
  category: 'text',
  tags: ['audio', 'stt', 'moonshine', 'webgpu'],
  status: 'experimental',
  runtime: 'client',
  execution: {
    mode: 'sync',
    worker: false,
    pure: true,
  },
  ui: {
    resultType: 'text',
  },
  i18n: {
    name: {
      en: 'Speech to Text',
      ja: '音声文字起こし',
      'zh-CN': '语音转文字',
    },
    description: {
      en: 'Transcribe local audio in the browser with cached Moonshine language models.',
      ja: 'キャッシュ済みの Moonshine 言語別モデルで、ローカル音声をブラウザー内で文字起こしします。',
      'zh-CN': '用可缓存的 Moonshine 语言模型在浏览器内转写本地音频。',
    },
  },
};
