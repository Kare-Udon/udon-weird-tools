import type { Locale } from '@/i18n/config';
import { parseToolFileStoragePath, toolCacheName, toolModelCachePath } from '../../lib/local/storage-contract.ts';

export type SpeechLanguage = 'english' | 'chinese' | 'japanese' | 'korean';

export type SpeechModelOption = {
  language: SpeechLanguage;
  modelId: string;
  storageModelId: string;
  name: string;
  sizeLabel: string;
  requiredFiles: string[];
  labels: Record<Locale, string>;
};

export type SpeechModelCacheCoverage = {
  state: 'empty' | 'partial' | 'downloaded';
  downloadedFiles: number;
  totalFiles: number;
};

const moonshineRequiredFiles = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer_config.json',
  'tokenizer.json',
  'onnx/decoder_model_merged_quantized.onnx',
  'onnx/encoder_model_quantized.onnx',
];

export const SPEECH_TO_TEXT_TOOL_SLUG = 'speech-to-text';
export const SPEECH_MODEL_CACHE_NAME = toolCacheName(SPEECH_TO_TEXT_TOOL_SLUG);

export const speechModelOptions: SpeechModelOption[] = [
  {
    language: 'english',
    modelId: 'onnx-community/moonshine-tiny-ONNX',
    storageModelId: 'moonshine-tiny-en',
    name: 'Moonshine Tiny EN',
    sizeLabel: '< 50 MB',
    requiredFiles: moonshineRequiredFiles,
    labels: {
      en: 'English',
      ja: 'English',
      'zh-CN': 'English',
    },
  },
  {
    language: 'chinese',
    modelId: 'onnx-community/moonshine-base-zh-ONNX',
    storageModelId: 'moonshine-base-zh',
    name: 'Moonshine Base ZH',
    sizeLabel: '~65 MB',
    requiredFiles: moonshineRequiredFiles,
    labels: {
      en: '中文',
      ja: '中文',
      'zh-CN': '中文',
    },
  },
  {
    language: 'japanese',
    modelId: 'onnx-community/moonshine-base-ja-ONNX',
    storageModelId: 'moonshine-base-ja',
    name: 'Moonshine Base JA',
    sizeLabel: '~65 MB',
    requiredFiles: moonshineRequiredFiles,
    labels: {
      en: '日本語',
      ja: '日本語',
      'zh-CN': '日本語',
    },
  },
  {
    language: 'korean',
    modelId: 'onnx-community/moonshine-tiny-ko-ONNX',
    storageModelId: 'moonshine-tiny-ko',
    name: 'Moonshine Tiny KO',
    sizeLabel: '< 50 MB',
    requiredFiles: moonshineRequiredFiles,
    labels: {
      en: '한국어',
      ja: '한국어',
      'zh-CN': '한국어',
    },
  },
];

export function getSpeechModel(language: SpeechLanguage): SpeechModelOption {
  return speechModelOptions.find((option) => option.language === language) ?? speechModelOptions[0];
}

export function getDefaultSpeechLanguage(locale: Locale): SpeechLanguage {
  if (locale === 'zh-CN') return 'chinese';
  if (locale === 'ja') return 'japanese';
  return 'english';
}

export function getSpeechModelCacheCoverage(urls: string[], model: SpeechModelOption): SpeechModelCacheCoverage {
  const downloadedFiles = model.requiredFiles.filter((file) => urls.some((url) => getSpeechModelFileFromCacheUrl(url, model) === file)).length;

  if (downloadedFiles === 0) {
    return {
      state: 'empty',
      downloadedFiles,
      totalFiles: model.requiredFiles.length,
    };
  }

  return {
    state: downloadedFiles === model.requiredFiles.length ? 'downloaded' : 'partial',
    downloadedFiles,
    totalFiles: model.requiredFiles.length,
  };
}

export function isSpeechModelCacheUrl(url: string, modelId: string): boolean {
  const model = speechModelOptions.find((option) => option.modelId === modelId || option.storageModelId === modelId);
  return Boolean(model && getSpeechModelFileFromCacheUrl(url, model));
}

export function getSpeechModelFileCachePath(model: SpeechModelOption, relativePath: string): string {
  return toolModelCachePath(SPEECH_TO_TEXT_TOOL_SLUG, model.storageModelId, relativePath);
}

export function getSpeechModelFileFromCacheUrl(url: string, model: SpeechModelOption): string | null {
  const parsed = parseToolFileStoragePath(url);
  if (!parsed || parsed.toolSlug !== SPEECH_TO_TEXT_TOOL_SLUG || parsed.modelId !== model.storageModelId) return null;
  return parsed.relativePath || null;
}

export function getSpeechModelFileFromTransformersRequest(request: string, model: SpeechModelOption): string | null {
  const path = getUrlPath(request);
  const remotePrefix = `/${model.modelId}/resolve/main/`;
  const localPrefix = `/models/${model.modelId}/`;

  if (path.includes(remotePrefix)) return path.slice(path.indexOf(remotePrefix) + remotePrefix.length);
  if (path.includes(localPrefix)) return path.slice(path.indexOf(localPrefix) + localPrefix.length);
  return null;
}

function getUrlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return decodeURIComponent(url);
  }
}
