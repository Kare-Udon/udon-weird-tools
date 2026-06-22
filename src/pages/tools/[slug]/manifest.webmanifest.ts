import type { APIRoute, GetStaticPaths } from 'astro';
import { defaultLocale } from '@/i18n/config';
import { createManifestResponse, getToolManifest } from '@/lib/pwa/manifest';
import type { ToolManifest } from '@/tools/_types';
import { tools } from '@/tools/registry';

export const getStaticPaths = (() =>
  tools.map((tool) => ({
    params: { slug: tool.slug },
    props: { tool },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const tool = props.tool as ToolManifest;

  return createManifestResponse(getToolManifest(tool, defaultLocale));
};
