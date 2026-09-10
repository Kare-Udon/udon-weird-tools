import type { Locale } from '../../i18n/config';
import type { LocalizedText } from '../_types';

export const unityPackageExtractorUi = {
  streamingModeTitle: {
    en: 'Streaming mode',
    ja: 'ストリーミングモード',
    'zh-CN': '流式模式',
  },
  streamingModeBadge: {
    en: 'Direct to disk',
    ja: 'ディスクへ直接保存',
    'zh-CN': '直接写入磁盘',
  },
  streamingModeDescription: {
    en: 'The package is processed locally and written into a new subdirectory of the folder you choose.',
    ja: 'パッケージはローカルで処理され、選択したフォルダー内の新しいサブフォルダーに書き込まれます。',
    'zh-CN': '文件只在浏览器本地处理，并写入你选择目录中的新建独立子目录。',
  },
  directoryLabel: {
    en: 'Output directory',
    ja: '出力フォルダー',
    'zh-CN': '输出目录',
  },
  chooseDirectory: {
    en: 'Choose output directory',
    ja: '出力フォルダーを選択',
    'zh-CN': '选择输出目录',
  },
  changeDirectory: {
    en: 'Change output directory',
    ja: '出力フォルダーを変更',
    'zh-CN': '更换输出目录',
  },
  directoryNotSelected: {
    en: 'Choose a directory before selecting a package.',
    ja: 'パッケージを選択する前にフォルダーを選択してください。',
    'zh-CN': '请先选择输出目录，再选择 package。',
  },
  directorySelected: {
    en: 'Selected: {directory}',
    ja: '選択済み: {directory}',
    'zh-CN': '已选择：{directory}',
  },
  packageLabel: {
    en: 'Unitypackage file',
    ja: 'Unitypackage ファイル',
    'zh-CN': 'Unitypackage 文件',
  },
  packageHelper: {
    en: 'Selecting a file starts extraction automatically. The site does not persist the input package or directory access.',
    ja: 'ファイルを選択すると自動的に展開を開始します。入力パッケージやフォルダーへのアクセス権はサイトに永続保存されません。',
    'zh-CN': '选择文件后会自动开始解包；网站不会持久保存输入包或目录授权。',
  },
  helpSummary: {
    en: 'How streaming mode works',
    ja: 'ストリーミングモードについて',
    'zh-CN': '流式模式说明',
  },
  helpChooseDirectory: {
    en: 'Choose an output directory, then select a package. Limits: 2 GiB input, 2 GiB per resource, 4 GiB total output, and 8 GiB of decompressed archive data.',
    ja: '出力フォルダーを選択してからパッケージを選択してください。上限は入力 2 GiB、各リソース 2 GiB、出力合計 4 GiB、展開したアーカイブ全体 8 GiB です。',
    'zh-CN': '先选择输出目录，再选择资源包。输入包上限 2 GiB，单个资源 2 GiB，总输出 4 GiB，完整归档展开数据 8 GiB。',
  },
  helpNewSubdirectory: {
    en: 'Each run creates a separate subdirectory and does not overwrite existing files.',
    ja: '実行ごとに別のサブフォルダーを作成し、既存ファイルは上書きしません。',
    'zh-CN': '每次运行都会创建独立子目录，不覆盖已有文件。',
  },
  helpCancel: {
    en: 'Cancel may leave partial output in the selected directory; only this run is stopped.',
    ja: 'キャンセル時は選択したフォルダーに途中の出力が残ることがあります。停止するのは今回の実行だけです。',
    'zh-CN': '取消后选定目录中可能留下部分输出；只会停止本次运行。',
  },
  outputTitle: {
    en: 'Streaming output',
    ja: 'ストリーミング出力',
    'zh-CN': '流式输出',
  },
  waitingForDirectory: {
    en: 'Choose an output directory to enable the package picker.',
    ja: '出力フォルダーを選択するとパッケージ選択が有効になります。',
    'zh-CN': '选择输出目录后才能选择 package。',
  },
  readyForPackage: {
    en: 'The output directory is ready. Select a .unitypackage file to start.',
    ja: '出力フォルダーの準備ができました。.unitypackage ファイルを選択すると開始します。',
    'zh-CN': '输出目录已准备好。选择 .unitypackage 文件即可开始。',
  },
  progressTitle: {
    en: 'Progress',
    ja: '進行状況',
    'zh-CN': '进度',
  },
  scanning: {
    en: 'Scanning package',
    ja: 'パッケージをスキャン中',
    'zh-CN': '正在扫描 package',
  },
  extracting: {
    en: 'Writing files',
    ja: 'ファイルを書き込み中',
    'zh-CN': '正在写入文件',
  },
  bytesRead: {
    en: 'Compressed bytes read',
    ja: '読み取った圧縮バイト',
    'zh-CN': '已读取压缩字节',
  },
  filesWritten: {
    en: 'Files written',
    ja: '書き込み済みファイル',
    'zh-CN': '已写入文件',
  },
  percentage: {
    en: '{value}%',
    ja: '{value}%',
    'zh-CN': '{value}%',
  },
  progressPercentLabel: {
    en: 'Progress percentage',
    ja: '進行率',
    'zh-CN': '进度百分比',
  },
  cancel: {
    en: 'Cancel',
    ja: 'キャンセル',
    'zh-CN': '取消',
  },
  reset: {
    en: 'Reset',
    ja: 'リセット',
    'zh-CN': '重置',
  },
  cancelling: {
    en: 'Cancelling…',
    ja: 'キャンセル中…',
    'zh-CN': '正在取消…',
  },
  complete: {
    en: 'Extraction complete',
    ja: '展開が完了しました',
    'zh-CN': '解包完成',
  },
  outputSubdirectory: {
    en: 'Completed subdirectory',
    ja: '完了したサブフォルダー',
    'zh-CN': '完成子目录',
  },
  statistics: {
    en: 'Statistics',
    ja: '統計',
    'zh-CN': '统计',
  },
  writtenFiles: {
    en: 'Files',
    ja: 'ファイル数',
    'zh-CN': '文件数',
  },
  writtenBytes: {
    en: 'Bytes written',
    ja: '書き込みバイト',
    'zh-CN': '已写入字节',
  },
  warnings: {
    en: 'Warnings',
    ja: '警告',
    'zh-CN': '警告',
  },
  entryPreview: {
    en: 'Entry preview',
    ja: 'エントリーのプレビュー',
    'zh-CN': '条目预览',
  },
  partialOutput: {
    en: 'Partial output may remain in the selected directory.',
    ja: '選択したフォルダーに途中の出力が残っている可能性があります。',
    'zh-CN': '选定目录中可能留下部分输出。',
  },
  errorTitle: {
    en: 'Extraction failed',
    ja: '展開に失敗しました',
    'zh-CN': '解包失败',
  },
  unknownError: {
    en: 'The extraction failed for an unknown reason.',
    ja: '原因不明のため展開に失敗しました。',
    'zh-CN': '解包因未知原因失败。',
  },
} as const satisfies Record<string, LocalizedText>;

export type UnityPackageExtractorUiKey = keyof typeof unityPackageExtractorUi;

const errorCopy: Record<string, LocalizedText> = {
  'missing-file': {
    en: 'Choose a .unitypackage file first.',
    ja: '.unitypackage ファイルを先に選択してください。',
    'zh-CN': '请先选择 .unitypackage 文件。',
  },
  unsupported: {
    en: 'This browser cannot use the streaming directory APIs.',
    ja: 'このブラウザではストリーミングのフォルダー API を利用できません。',
    'zh-CN': '当前浏览器不支持流式目录 API。',
  },
  'directory-required': {
    en: 'Choose and confirm an output directory before selecting a package.',
    ja: 'パッケージを選択する前に、出力フォルダーを選択して確定してください。',
    'zh-CN': '请先选择并确认输出目录，再选择 package。',
  },
  'invalid-file': {
    en: 'The selected file is not a valid Unity package.',
    ja: '選択したファイルは有効な Unity パッケージではありません。',
    'zh-CN': '选择的文件不是有效的 Unity package。',
  },
  cancelled: {
    en: 'The operation was cancelled. Partial output may remain in the selected directory.',
    ja: '操作をキャンセルしました。選択したフォルダーに途中の出力が残ることがあります。',
    'zh-CN': '操作已取消；选定目录中可能留下部分输出。',
  },
  'permission-denied': {
    en: 'Directory access was denied. Confirm access and try again.',
    ja: 'フォルダーへのアクセスが拒否されました。アクセスを許可してから再試行してください。',
    'zh-CN': '目录访问被拒绝。请确认权限后重试。',
  },
  'input-too-large': {
    en: 'The selected package exceeds the 2 GiB streaming input limit.',
    ja: '選択したパッケージがストリーミング入力の上限 2 GiB を超えています。',
    'zh-CN': '选择的资源包超过流式模式的 2 GiB 输入上限。',
  },
  'output-too-large': {
    en: 'The extracted output is larger than the streaming safety limit.',
    ja: '展開後の出力がストリーミングの安全上限を超えています。',
    'zh-CN': '解包后的输出超过流式处理的安全限制。',
  },
  'gzip-failed': {
    en: 'The package is not a valid gzip stream or it is damaged.',
    ja: 'パッケージが有効な gzip ストリームではないか、破損しています。',
    'zh-CN': 'package 不是有效的 gzip 流，或文件已损坏。',
  },
  'gzip-truncated': {
    en: 'The package gzip stream ended before it was complete.',
    ja: 'パッケージの gzip ストリームが途中で終了しました。',
    'zh-CN': 'package 的 gzip 流在完成前就结束了。',
  },
  'tar-invalid': {
    en: 'The package contains an invalid TAR archive.',
    ja: 'パッケージに無効な TAR アーカイブが含まれています。',
    'zh-CN': 'package 包含无效的 TAR 归档。',
  },
  'tar-truncated': {
    en: 'The package TAR stream ended before it was complete.',
    ja: 'パッケージの TAR ストリームが途中で終了しました。',
    'zh-CN': 'package 的 TAR 流在完成前就结束了。',
  },
  'tar-invalid-boundary': {
    en: 'The package TAR entry exceeds the archive boundary.',
    ja: 'パッケージの TAR エントリーがアーカイブの境界を越えています。',
    'zh-CN': 'package 的 TAR 条目超出了归档边界。',
  },
  'empty-package': {
    en: 'No restorable Unity assets were found in this package.',
    ja: '復元できる Unity アセットがこのパッケージにありません。',
    'zh-CN': '这个 package 中没有找到可还原的 Unity 资源。',
  },
  'unsafe-path': {
    en: 'The package contains an unsafe output path.',
    ja: 'パッケージに安全でない出力パスが含まれています。',
    'zh-CN': 'package 包含不安全的输出路径。',
  },
  'empty-path': {
    en: 'The package contains an empty output path.',
    ja: 'パッケージに空の出力パスがあります。',
    'zh-CN': 'package 包含空的输出路径。',
  },
  'duplicate-path': {
    en: 'The package contains a duplicate output path.',
    ja: 'パッケージに重複した出力パスがあります。',
    'zh-CN': 'package 包含重复的输出路径。',
  },
  'path-conflict': {
    en: 'The package contains conflicting file and directory paths.',
    ja: 'パッケージにファイルとフォルダーの競合するパスがあります。',
    'zh-CN': 'package 包含相互冲突的文件和目录路径。',
  },
  'duplicate-group-member': {
    en: 'The package contains a duplicate member for one asset group.',
    ja: 'パッケージのアセットグループに重複したメンバーがあります。',
    'zh-CN': 'package 的资源组包含重复成员。',
  },
  'missing-pathname': {
    en: 'An asset group is missing its pathname entry.',
    ja: 'アセットグループに pathname エントリーがありません。',
    'zh-CN': '资源组缺少 pathname 条目。',
  },
  'missing-asset': {
    en: 'An asset group is missing its asset payload.',
    ja: 'アセットグループに asset 本体がありません。',
    'zh-CN': '资源组缺少 asset 内容。',
  },
  'too-many-entries': {
    en: 'The package contains more entries than the safety limit allows.',
    ja: 'パッケージのエントリー数が安全上限を超えています。',
    'zh-CN': 'package 的条目数量超过安全限制。',
  },
  'entry-too-large': {
    en: 'A package entry is larger than the streaming safety limit.',
    ja: 'パッケージのエントリーがストリーミングの安全上限を超えています。',
    'zh-CN': 'package 条目超过流式处理的安全限制。',
  },
  'index-budget-exceeded': {
    en: 'The package index is larger than the safety limit allows.',
    ja: 'パッケージのインデックスが安全上限を超えています。',
    'zh-CN': 'package 索引超过安全限制。',
  },
  'expanded-size-limit': {
    en: 'The expanded TAR data is larger than the safety limit.',
    ja: '展開した TAR データが安全上限を超えています。',
    'zh-CN': '解压后的 TAR 数据超过安全限制。',
  },
  'output-budget-exceeded': {
    en: 'The output is larger than the safety limit allows.',
    ja: '出力が安全上限を超えています。',
    'zh-CN': '输出超过安全限制。',
  },
  'path-too-long': {
    en: 'The package contains a path that is too long.',
    ja: 'パッケージに長すぎるパスがあります。',
    'zh-CN': 'package 包含过长的路径。',
  },
  'write-failed': {
    en: 'Writing to the selected directory failed. Partial output may remain.',
    ja: '選択したフォルダーへの書き込みに失敗しました。途中の出力が残ることがあります。',
    'zh-CN': '写入选定目录失败；可能留下部分输出。',
  },
  'output-directory-failed': {
    en: 'Creating the output directory failed. Partial output may remain.',
    ja: '出力フォルダーの作成に失敗しました。途中の出力が残ることがあります。',
    'zh-CN': '创建输出目录失败；可能留下部分输出。',
  },
  'file-exists': {
    en: 'An output file already exists; existing files are not overwritten.',
    ja: '出力ファイルがすでに存在するため、既存ファイルは上書きされません。',
    'zh-CN': '输出文件已存在；不会覆盖已有文件。',
  },
  'worker-failed': {
    en: 'The streaming worker stopped unexpectedly. Partial output may remain.',
    ja: 'ストリーミングワーカーが予期せず停止しました。途中の出力が残ることがあります。',
    'zh-CN': '流式 worker 意外停止；可能留下部分输出。',
  },
  'invalid-package': {
    en: 'The selected file is not a valid Unity package.',
    ja: '選択したファイルは有効な Unity パッケージではありません。',
    'zh-CN': '选择的文件不是有效的 Unity package。',
  },
};

const warningCopy: Record<string, LocalizedText> = {
  'unsafe-path': {
    en: 'Skipped an unsafe package path',
    ja: '安全でないパッケージパスをスキップしました',
    'zh-CN': '已跳过不安全的 package 路径',
  },
  'duplicate-path': {
    en: 'Skipped a duplicate output path',
    ja: '重複した出力パスをスキップしました',
    'zh-CN': '已跳过重复的输出路径',
  },
  'path-conflict': {
    en: 'Skipped a conflicting output path',
    ja: '競合する出力パスをスキップしました',
    'zh-CN': '已跳过冲突的输出路径',
  },
  'entry-limit': {
    en: 'Skipped an entry over the safety limit',
    ja: '安全上限を超えるエントリーをスキップしました',
    'zh-CN': '已跳过超过安全限制的条目',
  },
  'path-too-long': {
    en: 'Skipped a path that is too long',
    ja: '長すぎるパスをスキップしました',
    'zh-CN': '已跳过过长的路径',
  },
  'missing-asset': {
    en: 'The asset payload was missing; only the directory was restored',
    ja: 'アセット本体がないため、フォルダーだけを復元しました',
    'zh-CN': '缺少 asset 内容；仅还原了目录',
  },
  'unknown-member-ignored': {
    en: 'Ignored an unknown package member',
    ja: '不明なパッケージメンバーを無視しました',
    'zh-CN': '已忽略未知的 package 成员',
  },
};

const codeAliases: Record<string, string> = {
  abort: 'cancelled',
  aborted: 'cancelled',
  'user-cancelled': 'cancelled',
  'directory-cancelled': 'cancelled',
  'operation-cancelled': 'cancelled',
  'not-supported': 'unsupported',
  'unsupported-browser': 'unsupported',
  'streaming-unsupported': 'unsupported',
  'directory-permission-denied': 'permission-denied',
  'permission-denied-directory': 'permission-denied',
  permission: 'permission-denied',
  'not-allowed': 'permission-denied',
  'package-too-large': 'input-too-large',
  'zip-too-large': 'output-too-large',
  'invalid-gzip': 'gzip-failed',
  'gzip-invalid': 'gzip-failed',
  'gzip-truncated': 'gzip-truncated',
  'tar-failed': 'tar-invalid',
  'invalid-tar': 'tar-invalid',
  'tar-invalid-header': 'tar-invalid',
  'tar-invalid-boundary': 'tar-invalid-boundary',
  truncated: 'tar-truncated',
  'truncated-tar': 'tar-truncated',
  'path-unsafe': 'unsafe-path',
  'empty-path': 'empty-path',
  'duplicate-group-member': 'duplicate-group-member',
  'missing-pathname': 'missing-pathname',
  'missing-asset': 'missing-asset',
  'entry-too-large': 'entry-too-large',
  'entry-limit': 'too-many-entries',
  'index-budget-exceeded': 'index-budget-exceeded',
  'expanded-size-limit': 'expanded-size-limit',
  'output-budget-exceeded': 'output-budget-exceeded',
  'path-length': 'path-too-long',
  'output-directory-failed': 'output-directory-failed',
  'file-exists': 'file-exists',
  'write-error': 'write-failed',
  'worker-error': 'worker-failed',
  'invalid-archive': 'invalid-package',
  'invalid-file': 'invalid-file',
};

export function unityPackageExtractorText(
  locale: Locale,
  key: UnityPackageExtractorUiKey,
  values: Record<string, string | number> = {},
): string {
  return interpolate(unityPackageExtractorUi[key][locale] ?? unityPackageExtractorUi[key].en, values);
}

export function readUnityPackageExtractorErrorCode(error: unknown): string | null {
  const record = asRecord(error);
  if (typeof record?.code === 'string' && record.code.trim()) {
    return canonicalCode(record.code);
  }

  if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
  return null;
}

export function getUnityPackageExtractorErrorText(locale: Locale, error: unknown): string {
  const code = readUnityPackageExtractorErrorCode(error);
  const localized = code ? errorCopy[code] : undefined;
  if (localized) return localized[locale] ?? localized.en;

  const detail = getUnityPackageExtractorErrorDetail(error);
  return detail || unityPackageExtractorText(locale, 'unknownError');
}

export function getUnityPackageExtractorErrorDetail(error: unknown): string {
  const record = asRecord(error);
  const candidate = record?.detail ?? record?.message ?? (error instanceof Error ? error.message : error);
  if (typeof candidate !== 'string') return '';

  return shortenDetail(candidate);
}

export function getUnityPackageExtractorWarningText(locale: Locale, warning: string): string {
  const raw = warning.trim();
  const match = /^([a-zA-Z0-9_-]+)(?::\s*|\s+)?(.*)$/.exec(raw);
  const code = match ? canonicalCode(match[1]) : '';
  const localized = warningCopy[code];
  if (!localized) return raw;

  const detail = match?.[2]?.trim();
  const label = localized[locale] ?? localized.en;
  return detail ? `${label}: ${shortenDetail(detail)}` : label;
}

function canonicalCode(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  return codeAliases[normalized] ?? normalized;
}

function interpolate(value: string, values: Record<string, string | number>): string {
  return value.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key: string) => String(values[key] ?? match));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function shortenDetail(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}
