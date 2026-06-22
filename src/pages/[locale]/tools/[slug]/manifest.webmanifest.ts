import type { APIRoute, GetStaticPaths } from 'astro';
import { prefixedLocales, type Locale } from '@/i18n/config';
import { createManifestResponse, getToolManifest } from '@/lib/pwa/manifest';
import { tools } from '@/tools/registry';
import type { ToolManifest } from '@/tools/_types';

export const getStaticPaths = (() =>
  prefixedLocales.flatMap((locale) =>
    tools.map((tool) => ({
      params: { locale, slug: tool.slug },
      props: { locale, tool },
    })),
  )) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const locale = props.locale as Locale;
  const tool = props.tool as ToolManifest;

  return createManifestResponse(getToolManifest(tool, locale));
};
