export type JsonCleanerInput = {
  text: string;
  mode: 'strict' | 'loose';
  indent: '2' | '4' | 'tab' | 'compact';
  sortKeys: boolean;
};

export type JsonCleanerOutput = {
  text: string;
  type: 'array' | 'object' | 'primitive';
  size: number;
};

export function run(input: JsonCleanerInput): JsonCleanerOutput {
  const raw = String(input.text ?? '').trim();

  if (!raw) {
    throw new Error('Input is empty.');
  }

  const candidate = input.mode === 'loose' ? loosenJson(raw) : raw;
  let parsed: unknown;

  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot parse JSON: ${message}`);
  }

  const normalized = input.sortKeys ? sortKeysDeep(parsed) : parsed;
  const indent = getIndent(input.indent);
  const text = JSON.stringify(normalized, null, indent);

  return {
    text,
    type: Array.isArray(normalized) ? 'array' : normalized !== null && typeof normalized === 'object' ? 'object' : 'primitive',
    size: text.length,
  };
}

function loosenJson(value: string): string {
  let text = extractJsonCandidate(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');

  text = quoteUnquotedKeys(text);
  text = replaceSingleQuotedStrings(text);

  return text;
}

function extractJsonCandidate(value: string): string {
  const firstObject = value.indexOf('{');
  const firstArray = value.indexOf('[');
  const starts = [firstObject, firstArray].filter((index) => index >= 0);

  if (starts.length === 0) {
    return value;
  }

  const start = Math.min(...starts);
  const endObject = value.lastIndexOf('}');
  const endArray = value.lastIndexOf(']');
  const end = Math.max(endObject, endArray);

  return end > start ? value.slice(start, end + 1) : value.slice(start);
}

function quoteUnquotedKeys(value: string): string {
  return value.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
}

function replaceSingleQuotedStrings(value: string): string {
  return value.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, inner: string) => `"${inner.replace(/"/g, '\\"')}"`);
}

function getIndent(indent: JsonCleanerInput['indent']): number | string {
  if (indent === 'compact') return 0;
  if (indent === 'tab') return '\t';
  return Number(indent);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeysDeep(child)]),
    );
  }

  return value;
}
