import type { ToolRunContext } from '../_types';

export type TimestampConverterInput = {
  value: string;
  displayLocale: 'auto' | 'zh-CN' | 'en-US' | 'ja-JP';
};

export type TimestampConverterOutput = {
  iso: string;
  utc: string;
  local: string;
  unixSeconds: number;
  unixMilliseconds: number;
  timezoneOffsetMinutes: number;
};

export function run(input: TimestampConverterInput, context: ToolRunContext): TimestampConverterOutput {
  const date = parseDate(input.value);
  const displayLocale = input.displayLocale === 'auto' ? context.locale : input.displayLocale;

  return {
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: new Intl.DateTimeFormat(displayLocale, {
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(date),
    unixSeconds: Math.floor(date.getTime() / 1000),
    unixMilliseconds: date.getTime(),
    timezoneOffsetMinutes: date.getTimezoneOffset(),
  };
}

function parseDate(value: string): Date {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    throw new Error('Input is empty.');
  }

  if (/^-?\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const milliseconds = Math.abs(numeric) < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid timestamp.');
    }

    return date;
  }

  const milliseconds = Date.parse(trimmed);

  if (Number.isNaN(milliseconds)) {
    throw new Error('Invalid date string.');
  }

  return new Date(milliseconds);
}
