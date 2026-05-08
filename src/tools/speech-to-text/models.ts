import type { Locale } from '@/i18n/config';

export type SpeechLanguage = 'english' | 'chinese' | 'japanese' | 'korean';

export type SpeechModelOption = {
  language: SpeechLanguage;
  modelId: string;
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

export const speechModelOptions: SpeechModelOption[] = [
  {
    language: 'english',
    modelId: 'onnx-community/moonshine-tiny-ONNX',
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
  const downloadedFiles = model.requiredFiles.filter((file) => urls.some((url) => isSpeechModelFileUrl(url, model.modelId, file))).length;

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
  return getUrlPath(url).includes(`/${modelId}/resolve/`);
}

function isSpeechModelFileUrl(url: string, modelId: string, file: string): boolean {
  const path = getUrlPath(url);
  return path.includes(`/${modelId}/resolve/`) && path.endsWith(`/${file}`);
}

function getUrlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return decodeURIComponent(url);
  }
}
