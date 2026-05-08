import type { Locale } from '@/i18n/config';

export const speechToTextUi = {
  model: {
    en: 'Model',
    ja: 'モデル',
    'zh-CN': '模型',
  },
  backend: {
    en: 'Backend',
    ja: 'バックエンド',
    'zh-CN': '后端',
  },
  cache: {
    en: 'Cache',
    ja: 'キャッシュ',
    'zh-CN': '缓存',
  },
  ready: {
    en: 'Ready',
    ja: '準備完了',
    'zh-CN': '就绪',
  },
  downloaded: {
    en: 'Downloaded',
    ja: 'ダウンロード済み',
    'zh-CN': '已下载',
  },
  partial: {
    en: 'Partial',
    ja: '一部のみ',
    'zh-CN': '部分已下载',
  },
  empty: {
    en: 'Empty',
    ja: '未缓存',
    'zh-CN': '未缓存',
  },
  loading: {
    en: 'Loading',
    ja: '読み込み中',
    'zh-CN': '加载中',
  },
  preload: {
    en: 'Preload',
    ja: 'プリロード',
    'zh-CN': '预载',
  },
  deleteModel: {
    en: 'Delete model',
    ja: 'モデルを削除',
    'zh-CN': '删除模型',
  },
  audio: {
    en: 'Audio',
    ja: '音声',
    'zh-CN': '音频',
  },
  language: {
    en: 'Language',
    ja: '言語',
    'zh-CN': '语言',
  },
  timestamps: {
    en: 'Timestamps',
    ja: 'タイムスタンプ',
    'zh-CN': '时间戳',
  },
  transcribe: {
    en: 'Transcribe',
    ja: '文字起こし',
    'zh-CN': '转写',
  },
  record: {
    en: 'Record',
    ja: '録音',
    'zh-CN': '录音',
  },
  recordAudio: {
    en: 'Record audio',
    ja: '音声を録音',
    'zh-CN': '录制音频',
  },
  stopRecording: {
    en: 'Stop',
    ja: '停止',
    'zh-CN': '停止',
  },
  recording: {
    en: 'Recording',
    ja: '録音中',
    'zh-CN': '录音中',
  },
  microphoneUnavailable: {
    en: 'Microphone is unavailable.',
    ja: 'マイクを使用できません。',
    'zh-CN': '麦克风不可用。',
  },
  transcribing: {
    en: 'Transcribing',
    ja: '文字起こし中',
    'zh-CN': '转写中',
  },
  decoding: {
    en: 'Decoding',
    ja: 'デコード中',
    'zh-CN': '解码中',
  },
  output: {
    en: 'Transcript',
    ja: '文字起こし結果',
    'zh-CN': '转写结果',
  },
  copy: {
    en: 'Copy',
    ja: 'コピー',
    'zh-CN': '复制',
  },
  chooseFile: {
    en: 'Choose audio',
    ja: '音声を選択',
    'zh-CN': '选择音频',
  },
  uploadAudio: {
    en: 'Upload audio',
    ja: '音声をアップロード',
    'zh-CN': '上传音频',
  },
  noFile: {
    en: 'No audio selected',
    ja: '音声未選択',
    'zh-CN': '未选择音频',
  },
  webgpu: {
    en: 'WebGPU',
    ja: 'WebGPU',
    'zh-CN': 'WebGPU',
  },
  wasm: {
    en: 'WASM',
    ja: 'WASM',
    'zh-CN': 'WASM',
  },
  auto: {
    en: 'Auto',
    ja: '自動',
    'zh-CN': '自动',
  },
  failed: {
    en: 'Failed',
    ja: '失敗',
    'zh-CN': '失败',
  },
  deleted: {
    en: 'Deleted',
    ja: '削除済み',
    'zh-CN': '已删除',
  },
  idleOutput: {
    en: '...',
    ja: '...',
    'zh-CN': '...',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export function sttText(locale: Locale, key: keyof typeof speechToTextUi): string {
  return speechToTextUi[key][locale] ?? speechToTextUi[key].en;
}
