export const defaultLocale = 'en' as const;

export const locales = ['en', 'ja', 'zh-CN'] as const;

export type Locale = (typeof locales)[number];

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
  'zh-CN': '简体中文',
};

export const prefixedLocales = locales.filter(
  (locale): locale is Exclude<Locale, typeof defaultLocale> => locale !== defaultLocale,
);

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && (locales as readonly string[]).includes(value));
}
