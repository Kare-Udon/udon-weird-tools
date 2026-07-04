import type { LocalizedText } from '../_types';

export const base64Ui = {
  inputNote: {
    'zh-CN': '数据只在浏览器本地处理。',
    en: 'Data is processed locally in your browser.',
    ja: 'データはブラウザ内だけで処理されます。',
  },
  encode: {
    'zh-CN': '编码',
    en: 'Encode',
    ja: 'エンコード',
  },
  decode: {
    'zh-CN': '解码',
    en: 'Decode',
    ja: 'デコード',
  },
  placeholderEncode: {
    'zh-CN': '粘贴要编码的文本…',
    en: 'Paste text to encode…',
    ja: 'エンコードするテキストを貼り付け...',
  },
  placeholderDecode: {
    'zh-CN': '粘贴要解码的 Base64…',
    en: 'Paste Base64 to decode…',
    ja: 'デコードする Base64 を貼り付け...',
  },
  readClipboard: {
    'zh-CN': '读取剪贴板',
    en: 'Read clipboard',
    ja: 'クリップボードを読む',
  },
  clipboardLoaded: {
    'zh-CN': '已读取',
    en: 'Loaded',
    ja: '読み取り済み',
  },
  clipboardReadFailed: {
    'zh-CN': '读取失败',
    en: 'Read failed',
    ja: '読み取り失敗',
  },
  options: {
    'zh-CN': '选项',
    en: 'Options',
    ja: 'オプション',
  },
  encoding: {
    'zh-CN': '字符编码',
    en: 'Character encoding',
    ja: '文字エンコーディング',
  },
  urlSafe: {
    'zh-CN': 'URL-safe Base64',
    en: 'URL-safe Base64',
    ja: 'URL-safe Base64',
  },
  wrap: {
    'zh-CN': '76 字符换行',
    en: 'Wrap at 76 characters',
    ja: '76 文字で折り返す',
  },
  outputNote: {
    'zh-CN': '输入变化时实时更新。',
    en: 'Updated as input changes.',
    ja: '入力に合わせて更新されます。',
  },
  copied: {
    'zh-CN': '已复制',
    en: 'Copied',
    ja: 'コピー済み',
  },
  copyFailed: {
    'zh-CN': '复制失败',
    en: 'Copy failed',
    ja: 'コピー失敗',
  },
  emptyOutput: {
    'zh-CN': '输入内容后结果会显示在这里。',
    en: 'The result will appear here after you type.',
    ja: '入力すると結果がここに表示されます。',
  },
  inputBytes: {
    'zh-CN': '输入',
    en: 'Input',
    ja: '入力',
  },
  outputChars: {
    'zh-CN': '输出',
    en: 'Output',
    ja: '出力',
  },
  mode: {
    'zh-CN': '模式',
    en: 'Mode',
    ja: 'モード',
  },
  bytes: {
    'zh-CN': '字节',
    en: 'bytes',
    ja: 'バイト',
  },
  chars: {
    'zh-CN': '字符',
    en: 'chars',
    ja: '文字',
  },
} as const satisfies Record<string, LocalizedText>;
