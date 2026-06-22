import type { LocalizedText } from '../_types';

type XPhotoUiText = Record<string, LocalizedText>;

export const xPhotoUi = {
  outputNoteAuto: {
    'zh-CN': '结果自动下载。',
    en: 'Result downloads automatically.',
    ja: '結果は自動でダウンロードされます。',
  },
  outputNoteManual: {
    'zh-CN': '关闭自动下载时，请使用保存图片。',
    en: 'Use Save Image when automatic download is off.',
    ja: '自動ダウンロードがオフの場合は「画像を保存」を使います。',
  },
  outputNoteMobileManual: {
    'zh-CN': '移动端请处理完成后手动保存图片。',
    en: 'On mobile, use Save Image after processing.',
    ja: 'モバイルでは処理後に「画像を保存」を使います。',
  },
  selectPhoto: {
    'zh-CN': '选择照片',
    en: 'Choose photo',
    ja: '写真を選択',
  },
  dropTitle: {
    'zh-CN': '拖入照片，或点击选择文件',
    en: 'Drop a photo here, or choose a file',
    ja: '写真をドロップ、またはファイルを選択',
  },
  dropHint: {
    'zh-CN': '支持浏览器可解码的 JPEG / PNG / WebP / AVIF；输出固定为 JPEG。',
    en: 'Supports browser-decodable JPEG / PNG / WebP / AVIF inputs; output is always JPEG.',
    ja: 'ブラウザでデコードできる JPEG / PNG / WebP / AVIF に対応し、出力は常に JPEG です。',
  },
  privacyNote: {
    'zh-CN': '本地处理，不上传。Canvas 重编码会自然去除大多数 EXIF / metadata。',
    en: 'Processed locally. Canvas re-encoding naturally strips most EXIF / metadata.',
    ja: 'ローカル処理です。Canvas の再エンコードにより、多くの EXIF / メタデータは自然に除去されます。',
  },
  advanced: {
    'zh-CN': '高级设置',
    en: 'Advanced settings',
    ja: '詳細設定',
  },
  targetSizeMb: {
    'zh-CN': '目标大小（MB）',
    en: 'Target size (MB)',
    ja: '目標サイズ（MB）',
  },
  toleranceMb: {
    'zh-CN': '容差（MB）',
    en: 'Tolerance (MB)',
    ja: '許容差（MB）',
  },
  resizeMode: {
    'zh-CN': '尺寸策略',
    en: 'Resize mode',
    ja: 'リサイズ方針',
  },
  resizeXFriendly4k: {
    'zh-CN': 'X 友好 4K',
    en: 'X-friendly 4K',
    ja: 'X 向け 4K',
  },
  resizeKeepOriginal: {
    'zh-CN': '保持原始尺寸',
    en: 'Keep original dimensions',
    ja: '元の寸法を維持',
  },
  resizeCustomLongEdge: {
    'zh-CN': '自定义最长边',
    en: 'Custom long edge',
    ja: '長辺を指定',
  },
  customLongEdge: {
    'zh-CN': '最长边像素',
    en: 'Long edge pixels',
    ja: '長辺ピクセル',
  },
  minQuality: {
    'zh-CN': '最低 JPEG 质量',
    en: 'Minimum JPEG quality',
    ja: '最低 JPEG 品質',
  },
  maxQuality: {
    'zh-CN': '最高 JPEG 质量',
    en: 'Maximum JPEG quality',
    ja: '最高 JPEG 品質',
  },
  allowDimensionFallback: {
    'zh-CN': '质量降到下限仍超目标时，允许继续缩小尺寸',
    en: 'Allow extra downscaling if minimum quality is still above target',
    ja: '最低品質でも目標を超える場合、追加の縮小を許可',
  },
  autoDownload: {
    'zh-CN': '处理完成后自动下载',
    en: 'Download automatically after processing',
    ja: '処理後に自動ダウンロード',
  },
  mobileManualSaveNote: {
    'zh-CN': '移动端浏览器需要用户点击保存，不能自动写入相册。',
    en: 'Mobile browsers require a tap to save; pages cannot write to the photo library automatically.',
    ja: 'モバイルブラウザでは保存にタップ操作が必要で、ページから写真ライブラリへ自動保存はできません。',
  },
  backgroundColor: {
    'zh-CN': '透明区域底色',
    en: 'Transparent area background',
    ja: '透明部分の背景色',
  },
  resetSettings: {
    'zh-CN': '恢复默认参数',
    en: 'Reset settings',
    ja: '設定を初期化',
  },
  downloadJpeg: {
    'zh-CN': '保存图片',
    en: 'Save Image',
    ja: '画像を保存',
  },
  waitingAuto: {
    'zh-CN': '选择一张照片后会自动处理并下载。',
    en: 'Choose a photo to process and download it automatically.',
    ja: '写真を選択すると自動で処理してダウンロードします。',
  },
  waitingManual: {
    'zh-CN': '选择一张照片后会自动处理；完成后请使用保存图片。',
    en: 'Choose a photo to process, then use Save Image.',
    ja: '写真を選択して処理し、完了後に「画像を保存」を使います。',
  },
  waitingMobileManual: {
    'zh-CN': '选择一张照片后会自动处理；移动端请完成后手动保存图片。',
    en: 'Choose a photo to process, then save it manually on mobile.',
    ja: '写真を選択して処理し、モバイルでは完了後に手動で保存します。',
  },
  processing: {
    'zh-CN': '正在处理照片…',
    en: 'Processing photo…',
    ja: '写真を処理中…',
  },
  completed: {
    'zh-CN': '处理完成',
    en: 'Done',
    ja: '完了',
  },
  original: {
    'zh-CN': '原图',
    en: 'Original',
    ja: '元画像',
  },
  output: {
    'zh-CN': '输出',
    en: 'Output',
    ja: '出力',
  },
  size: {
    'zh-CN': '大小',
    en: 'Size',
    ja: 'サイズ',
  },
  dimensions: {
    'zh-CN': '尺寸',
    en: 'Dimensions',
    ja: '寸法',
  },
  jpegQuality: {
    'zh-CN': 'JPEG 质量',
    en: 'JPEG quality',
    ja: 'JPEG 品質',
  },
  target: {
    'zh-CN': '目标',
    en: 'Target',
    ja: '目標',
  },
  settingsSaved: {
    'zh-CN': '高级参数会自动缓存到本机浏览器。',
    en: 'Advanced settings are cached in this browser automatically.',
    ja: '詳細設定はこのブラウザに自動保存されます。',
  },
  phaseDecoding: {
    'zh-CN': '解码图片',
    en: 'Decoding image',
    ja: '画像をデコード',
  },
  phaseResizing: {
    'zh-CN': '高质量缩放',
    en: 'High-quality resize',
    ja: '高品質リサイズ',
  },
  phaseEncoding: {
    'zh-CN': '搜索 JPEG 质量',
    en: 'Searching JPEG quality',
    ja: 'JPEG 品質を探索',
  },
  phaseFinalizing: {
    'zh-CN': '准备下载',
    en: 'Preparing download',
    ja: 'ダウンロードを準備',
  },
} satisfies XPhotoUiText;
