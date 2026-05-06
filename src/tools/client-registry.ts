import type { ToolModule } from './_types';

type LoadedToolModule = ToolModule<any, unknown>;

export const clientToolLoaders = {
  'json-cleaner': async () => (await import('./json-cleaner')).default as LoadedToolModule,
  'timestamp-converter': async () => (await import('./timestamp-converter')).default as LoadedToolModule,
  'case-converter': async () => (await import('./case-converter')).default as LoadedToolModule,
  'unicode-fancy-text': async () => (await import('./unicode-fancy-text')).default as LoadedToolModule,
  'vrc-photo-metadata': async () => (await import('./vrc-photo-metadata')).default as LoadedToolModule,
  'unitypackage-extractor': async () => (await import('./unitypackage-extractor')).default as LoadedToolModule,
} satisfies Record<string, () => Promise<LoadedToolModule>>;

export type ClientToolSlug = keyof typeof clientToolLoaders;

export async function loadClientTool(slug: string): Promise<LoadedToolModule> {
  const loader = clientToolLoaders[slug as ClientToolSlug];

  if (!loader) {
    throw new Error(`Unknown client tool: ${slug}`);
  }

  return loader();
}
