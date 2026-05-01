import { defaultLocale, type Locale } from './config';
import type { LocalizedText } from '@/tools/_types';

export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text[defaultLocale] ?? Object.values(text)[0] ?? '';
}

export function pathForLocale(locale: Locale, path = '/'): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (locale === defaultLocale) {
    return normalized;
  }

  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`;
}
