import type { LocalizedText } from '../_types';

export const codexAnalyzerUi = {
  sourceTitle: {
    'zh-CN': '数据源',
    en: 'Data source',
    ja: 'データソース',
  },
  sourceHint: {
    'zh-CN': '选择 Codex 数据目录（通常为 ~/.codex）。文件只在当前浏览器中读取。',
    en: 'Choose the Codex data directory, usually ~/.codex. Files are read only in this browser.',
    ja: 'Codex データディレクトリ（通常 ~/.codex）を選択します。ファイルはブラウザ内だけで読み取られます。',
  },
  pricingTitle: {
    'zh-CN': '费用估算',
    en: 'Cost estimate',
    ja: '費用見積もり',
  },
  pricingHint: {
    'zh-CN': '按当前 OpenAI 官方 Standard 价格快照估算；GPT-5.6 长上下文按每个请求的 input Token 判断。这不是历史账单或发票。',
    en: 'Estimated from the current OpenAI official Standard price snapshot; GPT-5.6 long context is selected per request input tokens. This is not a historical bill or invoice.',
    ja: '現在の OpenAI 公式 Standard 価格スナップショットによる推定です。GPT-5.6 の長いコンテキストは各リクエストの input トークンで判定し、過去の請求書やインボイスではありません。',
  },
  pricingDetails: {
    'zh-CN': '估算边界',
    en: 'Estimation limits',
    ja: '推定の範囲',
  },
  pricingLimitations: {
    'zh-CN': 'rollout 无法还原 cache writes、区域加价、工具按调用或存储收费、订阅折扣和税费，因此不计入。',
    en: 'Rollouts cannot recover cache writes, regional uplifts, per-call or storage tool charges, subscription discounts, or taxes, so they are excluded.',
    ja: 'rollout から cache writes、地域上乗せ、ツールの呼び出し・保存料金、サブスクリプション割引、税金は復元できないため、含めません。',
  },
  pricingFetchedAt: {
    'zh-CN': '价格获取时间',
    en: 'Snapshot fetched',
    ja: '取得日時',
  },
  pricingSource: {
    'zh-CN': 'OpenAI 官方价格页',
    en: 'OpenAI pricing',
    ja: 'OpenAI 価格ページ',
  },
  pricingModelDirectory: {
    'zh-CN': '模型目录',
    en: 'Model directory',
    ja: 'モデル一覧',
  },
  estimatedCost: {
    'zh-CN': '估算费用',
    en: 'Estimated cost',
    ja: '推定費用',
  },
  costPartial: {
    'zh-CN': 'partial',
    en: 'partial',
    ja: 'partial',
  },
  costUnknown: {
    'zh-CN': 'unknown',
    en: 'unknown',
    ja: 'unknown',
  },
  selectFolder: {
    'zh-CN': '选择目录',
    en: 'Choose folder',
    ja: 'フォルダーを選択',
  },
  rescan: {
    'zh-CN': '重新扫描',
    en: 'Rescan',
    ja: '再スキャン',
  },
  exportJson: {
    'zh-CN': '导出统计 JSON',
    en: 'Export analytics JSON',
    ja: '統計 JSON を出力',
  },
  noFolder: {
    'zh-CN': '尚未选择目录',
    en: 'No folder selected',
    ja: 'フォルダー未選択',
  },
  settingsSaved: {
    'zh-CN': '筛选设置会保存在本机；目录权限由浏览器管理。',
    en: 'Filter settings are saved locally; folder permission is managed by the browser.',
    ja: 'フィルター設定はローカル保存され、フォルダー権限はブラウザが管理します。',
  },
  lookback: {
    'zh-CN': '分析范围',
    en: 'Lookback',
    ja: '分析期間',
  },
  days: {
    'zh-CN': '天',
    en: 'days',
    ja: '日',
  },
  includeArchived: {
    'zh-CN': '包含归档对话',
    en: 'Include archived sessions',
    ja: 'アーカイブ済みを含む',
  },
  includeSubagents: {
    'zh-CN': '包含子 Agent',
    en: 'Include subagents',
    ja: 'サブエージェントを含む',
  },
  scanning: {
    'zh-CN': '正在读取与分析 rollout…',
    en: 'Reading and analyzing rollouts…',
    ja: 'rollout を読み取り・分析中…',
  },
  scanProgress: {
    'zh-CN': '已读取 {current} / {total} 个文件',
    en: 'Read {current} of {total} files',
    ja: '{current} / {total} ファイルを読み取り済み',
  },
  emptyTitle: {
    'zh-CN': '选择目录后显示仪表盘',
    en: 'Choose a folder to open the dashboard',
    ja: 'フォルダーを選択するとダッシュボードが表示されます',
  },
  emptyHint: {
    'zh-CN': '会扫描 sessions 与 archived_sessions 下近期的 rollout-*.jsonl，并读取 session_index.jsonl 补全对话名称。',
    en: 'Recent rollout-*.jsonl files under sessions and archived_sessions are scanned, with session_index.jsonl used for titles.',
    ja: 'sessions と archived_sessions の最近の rollout-*.jsonl を走査し、session_index.jsonl でタイトルを補完します。',
  },
  noDataTitle: {
    'zh-CN': '所选范围内没有可分析的对话',
    en: 'No analyzable sessions in this range',
    ja: '選択期間に解析可能なセッションがありません',
  },
  overview: {
    'zh-CN': '总览',
    en: 'Overview',
    ja: '概要',
  },
  projects: {
    'zh-CN': '项目',
    en: 'Projects',
    ja: 'プロジェクト',
  },
  sessions: {
    'zh-CN': '对话',
    en: 'Sessions',
    ja: 'セッション',
  },
  turns: {
    'zh-CN': '轮次',
    en: 'Turns',
    ja: 'ターン',
  },
  requests: {
    'zh-CN': '模型请求',
    en: 'Model requests',
    ja: 'モデルリクエスト',
  },
  totalTokens: {
    'zh-CN': '总 Token',
    en: 'Total tokens',
    ja: '総トークン',
  },
  activeTime: {
    'zh-CN': '执行时间',
    en: 'Active time',
    ja: '実行時間',
  },
  toolCalls: {
    'zh-CN': '工具调用',
    en: 'Tool calls',
    ja: 'ツール呼び出し',
  },
  cacheHit: {
    'zh-CN': '输入缓存命中',
    en: 'Input cache hit',
    ja: '入力キャッシュ率',
  },
  averageTtft: {
    'zh-CN': '平均首 Token',
    en: 'Average TTFT',
    ja: '平均 TTFT',
  },
  activity: {
    'zh-CN': '每日活动',
    en: 'Daily activity',
    ja: '日別アクティビティ',
  },
  modelUsage: {
    'zh-CN': '模型使用',
    en: 'Model usage',
    ja: 'モデル使用状況',
  },
  toolUsage: {
    'zh-CN': '工具分布',
    en: 'Tool distribution',
    ja: 'ツール分布',
  },
  projectActivity: {
    'zh-CN': '项目活动',
    en: 'Project activity',
    ja: 'プロジェクト活動',
  },
  tokens: {
    'zh-CN': 'Token',
    en: 'Tokens',
    ja: 'トークン',
  },
  speed: {
    'zh-CN': '生成速度',
    en: 'Generation speed',
    ja: '生成速度',
  },
  averageRequest: {
    'zh-CN': '平均请求',
    en: 'Average request',
    ja: '平均リクエスト',
  },
  p95: {
    'zh-CN': 'P95',
    en: 'P95',
    ja: 'P95',
  },
  reasoning: {
    'zh-CN': '推理占输出',
    en: 'Reasoning share',
    ja: '推論比率',
  },
  input: {
    'zh-CN': '输入',
    en: 'Input',
    ja: '入力',
  },
  cached: {
    'zh-CN': '缓存输入',
    en: 'Cached input',
    ja: 'キャッシュ入力',
  },
  output: {
    'zh-CN': '输出',
    en: 'Output',
    ja: '出力',
  },
  lastActive: {
    'zh-CN': '最后活动',
    en: 'Last active',
    ja: '最終活動',
  },
  source: {
    'zh-CN': '来源',
    en: 'Source',
    ja: 'ソース',
  },
  statusCompleted: {
    'zh-CN': '已完成',
    en: 'Completed',
    ja: '完了',
  },
  statusAborted: {
    'zh-CN': '已中止',
    en: 'Aborted',
    ja: '中止',
  },
  statusIncomplete: {
    'zh-CN': '未完整结束',
    en: 'Incomplete',
    ja: '未完了',
  },
  archived: {
    'zh-CN': '归档',
    en: 'Archived',
    ja: 'アーカイブ',
  },
  subagent: {
    'zh-CN': '子 Agent',
    en: 'Subagent',
    ja: 'サブエージェント',
  },
  conversationDetail: {
    'zh-CN': '对话详情',
    en: 'Session detail',
    ja: 'セッション詳細',
  },
  turn: {
    'zh-CN': '轮次',
    en: 'Turn',
    ja: 'ターン',
  },
  request: {
    'zh-CN': '请求',
    en: 'Request',
    ja: 'リクエスト',
  },
  requestTimingNote: {
    'zh-CN': '单次请求耗时为 usage 快照间隔扣除可识别工具执行区间后的估算值；轮次总耗时与 TTFT 使用 Codex 记录的原始字段。',
    en: 'Per-request time is estimated from usage snapshot intervals minus identifiable tool execution; turn duration and TTFT use recorded Codex fields.',
    ja: '各リクエスト時間は usage スナップショット間隔から識別可能なツール実行時間を除いた推定値です。ターン時間と TTFT は Codex の記録値です。',
  },
  estimated: {
    'zh-CN': '估算',
    en: 'estimated',
    ja: '推定',
  },
  duration: {
    'zh-CN': '耗时',
    en: 'Duration',
    ja: '所要時間',
  },
  ttft: {
    'zh-CN': '首 Token',
    en: 'TTFT',
    ja: 'TTFT',
  },
  tools: {
    'zh-CN': '工具',
    en: 'Tools',
    ja: 'ツール',
  },
  failures: {
    'zh-CN': '失败',
    en: 'Failures',
    ja: '失敗',
  },
  compactions: {
    'zh-CN': '上下文压缩',
    en: 'Compactions',
    ja: 'コンテキスト圧縮',
  },
  parseWarnings: {
    'zh-CN': '有 {count} 行 JSON 无法解析，统计已跳过这些行。',
    en: '{count} JSON lines could not be parsed and were skipped.',
    ja: '{count} 行の JSON を解析できず、スキップしました。',
  },
  scanSummary: {
    'zh-CN': '已分析 {sessions} 个对话，跳过 {skipped} 个范围外或被筛选的文件。',
    en: 'Analyzed {sessions} sessions; skipped {skipped} out-of-range or filtered files.',
    ja: '{sessions} セッションを解析し、期間外または除外対象の {skipped} ファイルをスキップしました。',
  },
  unsupportedPicker: {
    'zh-CN': '当前浏览器不支持原生目录选择，已切换到兼容选择器。',
    en: 'Native directory access is unavailable; using the compatible folder picker.',
    ja: 'ネイティブのディレクトリアクセス非対応のため、互換ピッカーを使用します。',
  },
  readError: {
    'zh-CN': '读取目录失败：{message}',
    en: 'Could not read the folder: {message}',
    ja: 'フォルダーを読み取れませんでした：{message}',
  },
} as const satisfies Record<string, LocalizedText>;

export type CodexAnalyzerUiKey = keyof typeof codexAnalyzerUi;
