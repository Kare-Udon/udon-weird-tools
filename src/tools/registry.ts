import { t, type TranslationKey } from '@/i18n/ui';
import type { Locale } from '@/i18n/config';
import type { ToolCategory, ToolManifest } from './_types';

import { manifest as caseConverter } from './case-converter/manifest';
import { manifest as jsonCleaner } from './json-cleaner/manifest';
import { manifest as storageManager } from './storage-manager/manifest';
import { manifest as timestampConverter } from './timestamp-converter/manifest';
import { manifest as unicodeFancyText } from './unicode-fancy-text/manifest';
import { manifest as unitypackageExtractor } from './unitypackage-extractor/manifest';
import { manifest as vrcPhotoMetadata } from './vrc-photo-metadata/manifest';

export const tools = [jsonCleaner, timestampConverter, caseConverter, unicodeFancyText, storageManager, vrcPhotoMetadata, unitypackageExtractor] as const satisfies readonly ToolManifest[];

export type ToolSlug = (typeof tools)[number]['slug'];

export const categoryOrder: ToolCategory[] = ['text', 'data', 'date', 'dev'];

const categoryLabelKeys: Record<ToolCategory, TranslationKey> = {
  text: 'categoryText',
  data: 'categoryData',
  date: 'categoryDate',
  dev: 'categoryDev',
};

export function getTool(slug: string): ToolManifest | undefined {
  return tools.find((tool) => tool.slug === slug);
}

export function getCategoryLabel(category: ToolCategory, locale: Locale): string {
  return t(locale, categoryLabelKeys[category]);
}

export function getToolsByCategory(category: ToolCategory): ToolManifest[] {
  return tools.filter((tool) => tool.category === category);
}
