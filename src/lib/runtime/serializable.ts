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

  if (value && typeof value === 'object' && 'text' in value && typeof (value as { text: unknown }).text === 'string') {
    return (value as { text: string }).text;
  }

  return JSON.stringify(value, null, 2);
}
