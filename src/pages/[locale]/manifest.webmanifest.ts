import type { APIRoute, GetStaticPaths } from 'astro';
import { prefixedLocales, type Locale } from '@/i18n/config';
import { createManifestResponse, getSiteManifest } from '@/lib/pwa/manifest';

export const getStaticPaths = (() =>
  prefixedLocales.map((locale) => ({
    params: { locale },
    props: { locale },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const locale = props.locale as Locale;

  return createManifestResponse(getSiteManifest(locale));
};
