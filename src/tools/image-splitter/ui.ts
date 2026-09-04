import type { Locale } from '@/i18n/config';
import type { LocalizedText } from '../_types';
import type { ImageSplitterErrorCode as BrowserImageSplitterErrorCode } from '@/lib/image-splitter/errors';
import type { ImageSplitterErrorCode as CoreImageSplitterErrorCode } from './run';

export type ImageSplitterUiErrorCode = BrowserImageSplitterErrorCode | CoreImageSplitterErrorCode;

export const imageSplitterUi = {
  uploadLabel: {
    'zh-CN': '上传图像',
    en: 'Upload image',
    ja: '画像をアップロード',
  },
  chooseImage: {
    'zh-CN': '上传图像',
    en: 'Upload image',
    ja: '画像を選択',
  },
  replaceImage: {
    'zh-CN': '更换图像',
    en: 'Replace image',
    ja: '画像を変更',
  },
  chooseFromPhotos: {
    'zh-CN': '相册',
    en: 'Photos',
    ja: '写真',
  },
  chooseFromFiles: {
    'zh-CN': '文件',
    en: 'Files',
    ja: 'ファイル',
  },
  reset: {
    'zh-CN': '重置',
    en: 'Reset',
    ja: 'リセット',
  },
  directionLabel: {
    'zh-CN': '切分方向',
    en: 'Split direction',
    ja: '分割方向',
  },
  vertical: {
    'zh-CN': '纵向',
    en: 'Vertical',
    ja: '縦',
  },
  horizontal: {
    'zh-CN': '横向',
    en: 'Horizontal',
    ja: '横',
  },
  countLabel: {
    'zh-CN': '切分数量',
    en: 'Number of slices',
    ja: '分割数',
  },
  countThree: {
    'zh-CN': '3 张',
    en: '3 slices',
    ja: '3 分割',
  },
  countFour: {
    'zh-CN': '4 张',
    en: '4 slices',
    ja: '4 分割',
  },
  customCount: {
    'zh-CN': '自定',
    en: 'Custom',
    ja: 'カスタム',
  },
  decreaseCount: {
    'zh-CN': '减少切分数量',
    en: 'Decrease slice count',
    ja: '分割数を減らす',
  },
  increaseCount: {
    'zh-CN': '增加切分数量',
    en: 'Increase slice count',
    ja: '分割数を増やす',
  },
  countInputLabel: {
    'zh-CN': '自定义切分数量',
    en: 'Custom slice count',
    ja: 'カスタム分割数',
  },
  ratioLabel: {
    'zh-CN': '切分比率',
    en: 'Split ratio',
    ja: '分割比率',
  },
  equal: {
    'zh-CN': '均等切分',
    en: 'Equal slices',
    ja: '均等分割',
  },
  free: {
    'zh-CN': '自由切分',
    en: 'Free cuts',
    ja: '自由分割',
  },
  adjustCuts: {
    'zh-CN': '调整切线',
    en: 'Adjust cuts',
    ja: '切断位置を調整',
  },
  symmetric: {
    'zh-CN': '对称调节',
    en: 'Symmetric adjustment',
    ja: '対称調整',
  },
  preview: {
    'zh-CN': '切分预览',
    en: 'Split preview',
    ja: '分割プレビュー',
  },
  saveSlice: {
    'zh-CN': '保存 {index}',
    en: 'Save {index}',
    ja: '{index} を保存',
  },
  saveAll: {
    'zh-CN': '保存全部 {count} 张',
    en: 'Save all {count}',
    ja: '{count} 分割をすべて保存',
  },
  saveZip: {
    'zh-CN': '下载 ZIP',
    en: 'Download ZIP',
    ja: 'ZIP をダウンロード',
  },
  decoding: {
    'zh-CN': '正在读取图像…',
    en: 'Reading image…',
    ja: '画像を読み込み中…',
  },
  preparing: {
    'zh-CN': '正在准备切片…',
    en: 'Preparing slices…',
    ja: '分割画像を準備中…',
  },
  saving: {
    'zh-CN': '正在保存…',
    en: 'Saving…',
    ja: '保存中…',
  },
  selectedImageAlt: {
    'zh-CN': '已选图像缩略图',
    en: 'Selected image thumbnail',
    ja: '選択した画像のサムネイル',
  },
  sliceAlt: {
    'zh-CN': '第 {index} 个切片预览',
    en: 'Preview of slice {index}',
    ja: '{index} 番目の分割プレビュー',
  },
  cutLineLabel: {
    'zh-CN': '第 {index} 条切线',
    en: 'Cut line {index}',
    ja: '切断線 {index}',
  },
  sliderLabel: {
    'zh-CN': '第 {index} 条切线位置，共 {count} 条',
    en: 'Position of cut line {index} of {count}',
    ja: '全 {count} 本中 {index} 本目の切断線位置',
  },
  sliderValue: {
    'zh-CN': '源图像素位置 {value}',
    en: 'Source pixel position {value}',
    ja: '元画像のピクセル位置 {value}',
  },
  symmetricNoSolution: {
    'zh-CN': '这条对称切线没有可用位置，已保持原位置。',
    en: 'No valid symmetric position is available; the cuts were left unchanged.',
    ja: '対称条件で移動できる位置がないため、切断線は変更されていません。',
  },
  saveHandedToSystem: {
    'zh-CN': '已交给系统处理，写入位置取决于系统。',
    en: 'Handed to the system; the final save location is controlled by the system.',
    ja: 'システムに渡しました。保存先はシステム側で決まります。',
  },
  saveWritten: {
    'zh-CN': '已保存 {count} 个文件。',
    en: '{count} files saved.',
    ja: '{count} 個のファイルを保存しました。',
  },
  savePartial: {
    'zh-CN': '已写入 {written}/{total} 个文件。',
    en: '{written} of {total} files were written.',
    ja: '{total} 個中 {written} 個を書き込みました。',
  },
  saveCancelled: {
    'zh-CN': '已取消保存。',
    en: 'Save cancelled.',
    ja: '保存をキャンセルしました。',
  },
  errorTitle: {
    'zh-CN': '无法完成操作',
    en: 'The operation could not be completed',
    ja: '操作を完了できませんでした',
  },
  genericError: {
    'zh-CN': '请重试或选择另一张图像。',
    en: 'Try again or choose another image.',
    ja: 'もう一度試すか、別の画像を選択してください。',
  },
} as const satisfies Record<string, LocalizedText>;

export type ImageSplitterUiKey = keyof typeof imageSplitterUi;

export const imageSplitterErrorText = {
  'invalid-source': {
    'zh-CN': '图像来源无效。',
    en: 'The image source is invalid.',
    ja: '画像ソースが無効です。',
  },
  'invalid-dimensions': {
    'zh-CN': '图像尺寸无效。',
    en: 'The image dimensions are invalid.',
    ja: '画像サイズが無効です。',
  },
  'invalid-direction': {
    'zh-CN': '切分方向无效。',
    en: 'The split direction is invalid.',
    ja: '分割方向が無効です。',
  },
  'invalid-count': {
    'zh-CN': '切分数量无效。',
    en: 'The slice count is invalid.',
    ja: '分割数が無効です。',
  },
  'axis-too-short': {
    'zh-CN': '切分方向的图像长度不足 2 像素。',
    en: 'The active split axis is shorter than 2 pixels.',
    ja: '分割する軸の長さが 2 ピクセル未満です。',
  },
  'count-exceeds-axis': {
    'zh-CN': '切分数量不能超过图像长度。',
    en: 'The slice count cannot exceed the image length.',
    ja: '分割数は画像の長さを超えられません。',
  },
  'invalid-mode': {
    'zh-CN': '切分模式无效。',
    en: 'The split mode is invalid.',
    ja: '分割モードが無効です。',
  },
  'missing-cuts': {
    'zh-CN': '缺少自由切线位置。',
    en: 'Free-cut positions are missing.',
    ja: '自由分割の位置がありません。',
  },
  'cut-count-mismatch': {
    'zh-CN': '切线数量与切片数量不匹配。',
    en: 'The cut count does not match the slice count.',
    ja: '切断線の数が分割数と一致しません。',
  },
  'cuts-not-integer': {
    'zh-CN': '切线位置必须是整数像素。',
    en: 'Cut positions must be whole pixels.',
    ja: '切断位置は整数ピクセルである必要があります。',
  },
  'cuts-out-of-range': {
    'zh-CN': '切线不能超出图像范围。',
    en: 'A cut is outside the image range.',
    ja: '切断線が画像の範囲外です。',
  },
  'cuts-not-ordered': {
    'zh-CN': '切线顺序无效。',
    en: 'The cut positions are not ordered.',
    ja: '切断位置の順序が無効です。',
  },
  'empty-file': {
    'zh-CN': '所选文件为空。',
    en: 'The selected file is empty.',
    ja: '選択したファイルが空です。',
  },
  'file-too-large': {
    'zh-CN': '图像文件过大。',
    en: 'The image file is too large.',
    ja: '画像ファイルが大きすぎます。',
  },
  'unsupported-format': {
    'zh-CN': '不支持此图像格式。',
    en: 'This image format is not supported.',
    ja: 'この画像形式はサポートされていません。',
  },
  'animated-image': {
    'zh-CN': '暂不支持动图。',
    en: 'Animated images are not supported.',
    ja: 'アニメーション画像はサポートされていません。',
  },
  'invalid-image-header': {
    'zh-CN': '图像文件头无效。',
    en: 'The image header is invalid.',
    ja: '画像ヘッダーが無効です。',
  },
  'image-too-large': {
    'zh-CN': '图像尺寸超出限制。',
    en: 'The image dimensions exceed the limit.',
    ja: '画像サイズが上限を超えています。',
  },
  'unsupported-browser': {
    'zh-CN': '当前浏览器不支持图像处理。',
    en: 'This browser does not support image processing.',
    ja: 'このブラウザは画像処理に対応していません。',
  },
  'decode-failed': {
    'zh-CN': '图像读取失败。',
    en: 'The image could not be read.',
    ja: '画像を読み込めませんでした。',
  },
  'preview-failed': {
    'zh-CN': '图像预览生成失败。',
    en: 'The image preview could not be generated.',
    ja: '画像プレビューを生成できませんでした。',
  },
  'preview-type-invalid': {
    'zh-CN': '图像预览格式无效。',
    en: 'The image preview format is invalid.',
    ja: '画像プレビュー形式が無効です。',
  },
  'canvas-unavailable': {
    'zh-CN': '当前浏览器无法创建图像画布。',
    en: 'This browser cannot create an image canvas.',
    ja: 'このブラウザでは画像キャンバスを作成できません。',
  },
  cancelled: {
    'zh-CN': '操作已取消。',
    en: 'The operation was cancelled.',
    ja: '操作をキャンセルしました。',
  },
  'stale-task': {
    'zh-CN': '较早的图像任务已被丢弃。',
    en: 'An older image task was discarded.',
    ja: '古い画像処理タスクを破棄しました。',
  },
  'invalid-slice': {
    'zh-CN': '切片矩形无效。',
    en: 'A slice rectangle is invalid.',
    ja: '分割矩形が無効です。',
  },
  'canvas-context-unavailable': {
    'zh-CN': '无法取得图像画布。',
    en: 'The image canvas context is unavailable.',
    ja: '画像キャンバスのコンテキストを取得できません。',
  },
  'encode-failed': {
    'zh-CN': '切片编码失败。',
    en: 'The slices could not be encoded.',
    ja: '分割画像をエンコードできませんでした。',
  },
  'output-empty': {
    'zh-CN': '生成的切片为空。',
    en: 'A generated slice is empty.',
    ja: '生成された分割画像が空です。',
  },
  'output-type-invalid': {
    'zh-CN': '生成的切片格式无效。',
    en: 'A generated slice has an invalid format.',
    ja: '生成された分割画像の形式が無効です。',
  },
  'output-dimensions-invalid': {
    'zh-CN': '生成的切片尺寸无效。',
    en: 'A generated slice has invalid dimensions.',
    ja: '生成された分割画像のサイズが無効です。',
  },
  'output-set-too-large': {
    'zh-CN': '生成的切片总大小超出限制。',
    en: 'The generated slice set is too large.',
    ja: '生成された分割画像の合計サイズが上限を超えています。',
  },
  'file-constructor-unavailable': {
    'zh-CN': '当前浏览器无法创建文件。',
    en: 'This browser cannot create files.',
    ja: 'このブラウザではファイルを作成できません。',
  },
  'zip-input-empty': {
    'zh-CN': '没有可打包的切片。',
    en: 'There are no slices to package.',
    ja: 'パッケージする分割画像がありません。',
  },
  'zip-input-too-large': {
    'zh-CN': '待打包文件总大小超出限制。',
    en: 'The files to package are too large.',
    ja: 'パッケージするファイルの合計サイズが上限を超えています。',
  },
  'zip-entry-empty': {
    'zh-CN': 'ZIP 中包含空文件。',
    en: 'The ZIP input contains an empty file.',
    ja: 'ZIP 入力に空のファイルがあります。',
  },
  'zip-entry-name-invalid': {
    'zh-CN': 'ZIP 文件名无效。',
    en: 'A ZIP entry name is invalid.',
    ja: 'ZIP エントリ名が無効です。',
  },
  'zip-entry-name-too-long': {
    'zh-CN': 'ZIP 文件名过长。',
    en: 'A ZIP entry name is too long.',
    ja: 'ZIP エントリ名が長すぎます。',
  },
  'zip-too-many-entries': {
    'zh-CN': 'ZIP 文件包含过多条目。',
    en: 'The ZIP contains too many entries.',
    ja: 'ZIP のエントリ数が多すぎます。',
  },
  'zip-too-large': {
    'zh-CN': 'ZIP 文件过大。',
    en: 'The ZIP file is too large.',
    ja: 'ZIP ファイルが大きすぎます。',
  },
  'zip-read-failed': {
    'zh-CN': '读取 ZIP 输入失败。',
    en: 'The ZIP input could not be read.',
    ja: 'ZIP 入力を読み込めませんでした。',
  },
  'zip-encode-failed': {
    'zh-CN': 'ZIP 生成失败。',
    en: 'The ZIP could not be generated.',
    ja: 'ZIP を生成できませんでした。',
  },
  'save-busy': {
    'zh-CN': '已有保存操作进行中。',
    en: 'A save operation is already in progress.',
    ja: '保存処理がすでに進行中です。',
  },
  'empty-file-set': {
    'zh-CN': '没有可保存的文件。',
    en: 'There are no files to save.',
    ja: '保存するファイルがありません。',
  },
  'share-unavailable': {
    'zh-CN': '当前浏览器不支持分享此文件。',
    en: 'This browser cannot share this file.',
    ja: 'このブラウザではこのファイルを共有できません。',
  },
  'batch-share-unavailable': {
    'zh-CN': '当前设备不支持一次分享全部切片，请下载 ZIP。',
    en: 'This device cannot share all slices at once. Download the ZIP instead.',
    ja: 'この端末では分割画像を一度に共有できません。代わりに ZIP をダウンロードしてください。',
  },
  'share-failed': {
    'zh-CN': '分享失败。',
    en: 'Sharing failed.',
    ja: '共有に失敗しました。',
  },
  'directory-picker-unavailable': {
    'zh-CN': '当前浏览器不支持目录选择。',
    en: 'This browser does not support directory selection.',
    ja: 'このブラウザはフォルダー選択に対応していません。',
  },
  'file-picker-unavailable': {
    'zh-CN': '当前浏览器不支持文件保存选择。',
    en: 'This browser does not support file save selection.',
    ja: 'このブラウザは保存先ファイルの選択に対応していません。',
  },
  'picker-failed': {
    'zh-CN': '文件选择器操作失败。',
    en: 'The file picker operation failed.',
    ja: 'ファイル選択操作に失敗しました。',
  },
  'permission-denied': {
    'zh-CN': '没有获得写入权限。',
    en: 'Write permission was denied.',
    ja: '書き込み権限が拒否されました。',
  },
  'directory-write-failed': {
    'zh-CN': '写入目录失败。',
    en: 'Writing to the directory failed.',
    ja: 'フォルダーへの書き込みに失敗しました。',
  },
  'directory-partial': {
    'zh-CN': '目录写入只完成了一部分。',
    en: 'Only part of the directory write completed.',
    ja: 'フォルダーへの書き込みが一部しか完了していません。',
  },
  'file-write-failed': {
    'zh-CN': '写入文件失败。',
    en: 'Writing the file failed.',
    ja: 'ファイルへの書き込みに失敗しました。',
  },
  'download-unavailable': {
    'zh-CN': '当前浏览器不支持下载。',
    en: 'This browser cannot download files.',
    ja: 'このブラウザではファイルをダウンロードできません。',
  },
  'download-failed': {
    'zh-CN': '下载失败。',
    en: 'The download failed.',
    ja: 'ダウンロードに失敗しました。',
  },
  'zip-not-prepared': {
    'zh-CN': 'ZIP 尚未准备好。',
    en: 'The ZIP is not ready yet.',
    ja: 'ZIP の準備がまだ完了していません。',
  },
  'invalid-save-file': {
    'zh-CN': '待保存文件无效。',
    en: 'The file prepared for saving is invalid.',
    ja: '保存するファイルが無効です。',
  },
  'save-cancelled': {
    'zh-CN': '已取消保存。',
    en: 'Save cancelled.',
    ja: '保存をキャンセルしました。',
  },
} as const satisfies Record<ImageSplitterUiErrorCode, LocalizedText>;

export function getImageSplitterErrorText(code: string): LocalizedText {
  if (Object.prototype.hasOwnProperty.call(imageSplitterErrorText, code)) {
    return imageSplitterErrorText[code as ImageSplitterUiErrorCode];
  }

  return imageSplitterUi.genericError;
}

export function localizeImageSplitterError(code: string, locale: Locale): string {
  return getImageSplitterErrorText(code)[locale] ?? getImageSplitterErrorText(code).en;
}
