import type { Locale } from '@/i18n/config';
import type { ToolRunContext } from '../_types';

export type SpeechToTextInput = {
  audioFile: File | null;
};

export type SpeechToTextOutput = {
  text: string;
};

const messages: Record<Locale, string> = {
  en: 'Use the browser speech-to-text panel to preload the model and transcribe an audio file.',
  ja: 'ブラウザーの音声文字起こしパネルでモデルをプリロードしてから音声ファイルを文字起こししてください。',
  'zh-CN': '请在浏览器语音转文字面板中预载模型并转写音频文件。',
};

export async function transcribeSpeechToText(_input: SpeechToTextInput, context: ToolRunContext): Promise<SpeechToTextOutput> {
  return {
    text: messages[context.locale],
  };
}
