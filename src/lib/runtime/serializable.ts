export function assertSerializable(value: unknown): void {
  try {
    JSON.stringify(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Tool output must be JSON serializable: ${message}`);
  }
}

export function stringifyResult(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (isDownloadResult(value)) {
    const warningText = value.warnings.length > 0 ? `\n\nWarnings:\n${value.warnings.map((warning) => `- ${warning}`).join('\n')}` : '';
    return `${value.summary.text}${warningText}`;
  }

  if (value && typeof value === 'object' && 'text' in value && typeof (value as { text: unknown }).text === 'string') {
    return (value as { text: string }).text;
  }

  if (value && typeof value === 'object' && 'items' in value && Array.isArray((value as { items: unknown }).items)) {
    return (value as { items: unknown[] }).items
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const text = 'text' in item && typeof (item as { text: unknown }).text === 'string' ? (item as { text: string }).text : '';
        const name = getDisplayName(item);
        return name ? `${name}\n${text}` : text;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return JSON.stringify(value, null, 2);
}

function isDownloadResult(value: unknown): value is {
  kind: 'download';
  summary: { text: string };
  warnings: string[];
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as { kind: unknown }).kind === 'download' &&
    'summary' in value &&
    Boolean((value as { summary: unknown }).summary) &&
    typeof (value as { summary: { text?: unknown } }).summary.text === 'string' &&
    'warnings' in value &&
    Array.isArray((value as { warnings: unknown }).warnings)
  );
}

function getDisplayName(value: object): string {
  if (!('name' in value)) return '';

  const name = (value as { name: unknown }).name;
  if (typeof name === 'string') return name;

  if (name && typeof name === 'object') {
    const names = name as Record<string, unknown>;
    const fallback = names.en ?? names['zh-CN'] ?? Object.values(names).find((entry) => typeof entry === 'string');
    return typeof fallback === 'string' ? fallback : '';
  }

  return '';
}
