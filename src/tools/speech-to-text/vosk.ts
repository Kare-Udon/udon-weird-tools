import type { Locale } from '@/i18n/config';
import { parseToolFileStoragePath, toolModelCachePath } from '../../lib/local/storage-contract.ts';
import type { SpeechLanguage } from './models.ts';
import { SPEECH_TO_TEXT_TOOL_SLUG } from './models.ts';
import type { VoskArchiveFormat } from './vosk-archive';

export type VoskTimelineModel = {
  language: SpeechLanguage;
  storageModelId: string;
  name: string;
  sizeLabel: string;
  modelUrl: string | null;
  archiveFormat: VoskArchiveFormat;
  labels: Record<Locale, string>;
};

const voskBrowserModelBase = 'https://ccoreilly.github.io/vosk-browser/models/';
const voskHuggingFaceModelBase = 'https://huggingface.co/localstack/vosk-models/resolve/main/';

export const voskTimelineModels: VoskTimelineModel[] = [
  {
    language: 'english',
    storageModelId: 'vosk-small-en',
    name: 'Vosk Small EN',
    sizeLabel: '~40 MB',
    modelUrl: `${voskBrowserModelBase}vosk-model-small-en-us-0.15.tar.gz`,
    archiveFormat: 'tar.gz',
    labels: {
      en: 'English timeline',
      ja: 'English timeline',
      'zh-CN': '英语时间轴',
    },
  },
  {
    language: 'chinese',
    storageModelId: 'vosk-small-zh',
    name: 'Vosk Small ZH',
    sizeLabel: '~42 MB',
    modelUrl: `${voskBrowserModelBase}vosk-model-small-cn-0.3.tar.gz`,
    archiveFormat: 'tar.gz',
    labels: {
      en: 'Chinese timeline',
      ja: '中文 timeline',
      'zh-CN': '中文时间轴',
    },
  },
  {
    language: 'japanese',
    storageModelId: 'vosk-small-ja',
    name: 'Vosk Small JA',
    sizeLabel: '~48 MB',
    modelUrl: `${voskHuggingFaceModelBase}vosk-model-small-ja-0.22.zip`,
    archiveFormat: 'zip',
    labels: {
      en: 'Japanese timeline',
      ja: '日本語 timeline',
      'zh-CN': '日语时间轴',
    },
  },
  {
    language: 'korean',
    storageModelId: 'vosk-small-ko',
    name: 'Vosk Small KO',
    sizeLabel: '~82 MB',
    modelUrl: `${voskHuggingFaceModelBase}vosk-model-small-ko-0.22.zip`,
    archiveFormat: 'zip',
    labels: {
      en: 'Korean timeline',
      ja: '韓国語 timeline',
      'zh-CN': '韩语时间轴',
    },
  },
];

export function getVoskTimelineModel(language: SpeechLanguage): VoskTimelineModel {
  return voskTimelineModels.find((option) => option.language === language) ?? voskTimelineModels[0];
}

export function getVoskModelCachePath(model: VoskTimelineModel): string {
  return toolModelCachePath(SPEECH_TO_TEXT_TOOL_SLUG, model.storageModelId, 'archive/model.tar.gz');
}

export function isVoskModelCacheUrl(url: string, model: VoskTimelineModel): boolean {
  const parsed = parseToolFileStoragePath(url);
  return parsed?.toolSlug === SPEECH_TO_TEXT_TOOL_SLUG && parsed.modelId === model.storageModelId && parsed.relativePath === 'archive/model.tar.gz';
}
