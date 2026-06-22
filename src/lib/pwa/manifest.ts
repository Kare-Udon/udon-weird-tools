import { type Locale } from '@/i18n/config';
import { t } from '@/i18n/ui';
import { localize, pathForLocale } from '@/i18n/utils';
import type { ToolManifest } from '@/tools/_types';
import { tools } from '@/tools/registry';

export const pwaThemeColor = '#111827';
export const pwaBackgroundColor = '#f8fafc';
export const pwaIconHref = '/pwa/icons/app.svg';
export const pwaMaskableIconHref = '/pwa/icons/maskable.svg';
export const pwaManifestContentType = 'application/manifest+json; charset=utf-8';

export type WebAppManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

export type WebAppManifestShortcut = {
  name: string;
  short_name?: string;
  description?: string;
  url: string;
  icons?: WebAppManifestIcon[];
};

export type WebAppManifest = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  lang: Locale;
  categories: string[];
  icons: WebAppManifestIcon[];
  shortcuts?: WebAppManifestShortcut[];
};

const sharedIcons: WebAppManifestIcon[] = [
  {
    src: pwaIconHref,
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any',
  },
  {
    src: pwaMaskableIconHref,
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'maskable',
  },
];

export function getSiteManifestHref(locale: Locale): string {
  return pathForLocale(locale, '/manifest.webmanifest');
}

export function getToolManifestHref(locale: Locale, slug: string): string {
  return pathForLocale(locale, `/tools/${slug}/manifest.webmanifest`);
}

export function getSiteManifest(locale: Locale): WebAppManifest {
  const siteName = t(locale, 'siteTitle');

  return {
    id: '/pwa/site',
    name: siteName,
    short_name: toShortName(siteName),
    description: t(locale, 'siteDescription'),
    start_url: pathForLocale(locale, '/'),
    scope: '/',
    display: 'standalone',
    background_color: pwaBackgroundColor,
    theme_color: pwaThemeColor,
    lang: locale,
    categories: ['utilities', 'productivity'],
    icons: sharedIcons,
    shortcuts: tools.slice(0, 4).map((tool) => ({
      name: localize(tool.i18n.name, locale),
      short_name: toShortName(localize(tool.i18n.name, locale)),
      description: localize(tool.i18n.description, locale),
      url: pathForLocale(locale, `/tools/${tool.slug}`),
      icons: sharedIcons,
    })),
  };
}

export function getToolManifest(tool: ToolManifest, locale: Locale): WebAppManifest {
  const toolName = localize(tool.i18n.name, locale);

  return {
    id: `/pwa/tools/${tool.slug}`,
    name: toolName,
    short_name: toShortName(toolName),
    description: localize(tool.i18n.description, locale),
    start_url: pathForLocale(locale, `/tools/${tool.slug}`),
    scope: '/',
    display: 'standalone',
    background_color: pwaBackgroundColor,
    theme_color: pwaThemeColor,
    lang: locale,
    categories: ['utilities', 'productivity'],
    icons: sharedIcons,
  };
}

export function createManifestResponse(manifest: WebAppManifest): Response {
  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: {
      'Content-Type': pwaManifestContentType,
    },
  });
}

function toShortName(name: string): string {
  if (name.length <= 24) return name;

  return `${name.slice(0, 23)}…`;
}
