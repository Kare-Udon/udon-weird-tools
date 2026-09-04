import {
  encodeSlices,
  type DecodedImage,
  type EncodeOptions,
  type SliceRect,
} from '../../lib/image-splitter/browser.ts';
import { createStoreZip, type StoreZipOptions } from '../../lib/image-splitter/zip.ts';

export type ImageSplitterPreparationOptions = {
  decoded: DecodedImage;
  slices: readonly SliceRect[];
  sourceName: string;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  encodeOptions?: Omit<EncodeOptions, 'signal' | 'isCurrent'>;
  zipOptions?: Omit<StoreZipOptions, 'signal' | 'isCurrent' | 'sourceName'>;
  onFilesReady?: (files: File[]) => void;
};

export type ImageSplitterPreparationResult = {
  files: File[];
  zip: File | null;
  zipError: unknown | null;
};

export async function prepareImageSplitterArtifacts(
  options: ImageSplitterPreparationOptions,
): Promise<ImageSplitterPreparationResult> {
  const files = await encodeSlices(
    options.decoded,
    options.slices,
    options.sourceName,
    {
      ...options.encodeOptions,
      signal: options.signal,
      isCurrent: options.isCurrent,
    },
  );
  options.onFilesReady?.(files);

  try {
    const zip = await createStoreZip(files, {
      ...options.zipOptions,
      sourceName: options.sourceName,
      signal: options.signal,
      isCurrent: options.isCurrent,
    });
    return { files, zip, zipError: null };
  } catch (error) {
    if (isTaskTermination(error)) throw error;
    return { files, zip: null, zipError: error };
  }
}

function isTaskTermination(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return 'code' in error && (error.code === 'cancelled' || error.code === 'stale-task');
}
