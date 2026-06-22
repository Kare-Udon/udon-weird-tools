import type { APIRoute } from 'astro';
import { defaultLocale } from '@/i18n/config';
import { createManifestResponse, getSiteManifest } from '@/lib/pwa/manifest';

export const GET: APIRoute = () => createManifestResponse(getSiteManifest(defaultLocale));
