import type { Locale } from '@/i18n/config';

export const speechToTextUi = {
  model: {
    en: 'Model',
    ja: 'モデル',
    'zh-CN': '模型',
  },
  transcriptionModel: {
    en: 'Transcription',
    ja: '文字起こし',
    'zh-CN': '转写模型',
  },
  alignmentModel: {
    en: 'Alignment',
    ja: 'アラインメント',
    'zh-CN': '对齐模型',
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
  timelineMode: {
    en: 'Timeline mode',
    ja: 'タイムラインモード',
    'zh-CN': '时间轴模式',
  },
  timelineOff: {
    en: 'Off',
    ja: 'オフ',
    'zh-CN': '关闭',
  },
  timelineOn: {
    en: 'Vosk word timestamps',
    ja: 'Vosk word timestamps',
    'zh-CN': 'Vosk 词级时间戳',
  },
  timelineUnavailable: {
    en: 'Unavailable for this language',
    ja: 'この言語では利用できません',
    'zh-CN': '当前语言暂不可用',
  },
  loadingTimeline: {
    en: 'Loading Vosk timeline model',
    ja: 'Vosk timeline model loading',
    'zh-CN': '正在加载 Vosk 时间轴模型',
  },
  downloadingTimeline: {
    en: 'Downloading Vosk timeline model',
    ja: 'Vosk timeline model downloading',
    'zh-CN': '正在下载 Vosk 时间轴模型',
  },
  initializingTimeline: {
    en: 'Initializing Vosk timeline model',
    ja: 'Vosk timeline model initializing',
    'zh-CN': '正在初始化 Vosk 时间轴模型',
  },
  aligningTimeline: {
    en: 'Building timeline',
    ja: 'タイムラインを生成中',
    'zh-CN': '正在生成时间轴',
  },
  timedTranscript: {
    en: 'Timeline',
    ja: 'タイムライン',
    'zh-CN': '时间轴',
  },
  sentenceTranscript: {
    en: 'Sentence transcript',
    ja: '文ごとの文字起こし',
    'zh-CN': '分句转写',
  },
  sentenceOnly: {
    en: 'Sentence editing',
    ja: '文ごとに編集',
    'zh-CN': '分句校对',
  },
  approximateSentenceTiming: {
    en: 'Approximate sentence timing',
    ja: '文単位のおおよその時刻',
    'zh-CN': '句子级近似时间',
  },
  noTiming: {
    en: 'No timing',
    ja: '時刻なし',
    'zh-CN': '无时间',
  },
  sentence: {
    en: 'Sentence',
    ja: '文',
    'zh-CN': '句子',
  },
  selected: {
    en: 'Selected',
    ja: '選択済み',
    'zh-CN': '已选择',
  },
  copySelected: {
    en: 'Copy selected',
    ja: '選択をコピー',
    'zh-CN': '复制选中',
  },
  copyAll: {
    en: 'Copy all',
    ja: 'すべてコピー',
    'zh-CN': '复制全部',
  },
  exportTranscript: {
    en: 'Export',
    ja: 'エクスポート',
    'zh-CN': '导出',
  },
  resetEdits: {
    en: 'Reset edits',
    ja: '編集をリセット',
    'zh-CN': '重置修改',
  },
  playSentence: {
    en: 'Play sentence',
    ja: '文を再生',
    'zh-CN': '播放句子',
  },
  copySentence: {
    en: 'Copy sentence',
    ja: '文をコピー',
    'zh-CN': '复制句子',
  },
  splitSentence: {
    en: 'Split sentence',
    ja: '文を分割',
    'zh-CN': '拆分句子',
  },
  mergeNext: {
    en: 'Merge next',
    ja: '次と結合',
    'zh-CN': '合并下一句',
  },
  copied: {
    en: 'Copied',
    ja: 'コピー済み',
    'zh-CN': '已复制',
  },
  copyFailed: {
    en: 'Copy failed',
    ja: 'コピー失敗',
    'zh-CN': '复制失败',
  },
  nothingToCopy: {
    en: 'Nothing to copy',
    ja: 'コピーする内容なし',
    'zh-CN': '无内容可复制',
  },
  exported: {
    en: 'Exported',
    ja: 'エクスポート済み',
    'zh-CN': '已导出',
  },
  reset: {
    en: 'Reset',
    ja: 'リセット済み',
    'zh-CN': '已重置',
  },
  confidence: {
    en: 'Confidence',
    ja: '信頼度',
    'zh-CN': '置信度',
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
  currentSource: {
    en: 'Current source',
    ja: '現在の音声',
    'zh-CN': '当前来源',
  },
  noRecording: {
    en: 'No recording',
    ja: '録音なし',
    'zh-CN': '未录音',
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
