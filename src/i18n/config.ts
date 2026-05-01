export const defaultLocale = 'zh-CN' as const;

export const locales = ['zh-CN', 'en'] as const;

export type Locale = (typeof locales)[number];

export const localeLabels: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};

export const prefixedLocales = locales.filter(
  (locale): locale is Exclude<Locale, typeof defaultLocale> => locale !== defaultLocale,
);

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && (locales as readonly string[]).includes(value));
}
