import type { Locale } from '@/i18n/config';
import type { ToolRunContext } from '../_types';

const INPUT_MAX_BYTES = 80 * 1024 * 1024;
const OUTPUT_MIME_TYPE = 'image/jpeg';
const DECIMAL_MB = 1_000_000;
const MAX_QUALITY_ITERATIONS = 10;
const MAX_DIMENSION_FALLBACKS = 6;
const MIN_OUTPUT_EDGE = 256;

export type XPhotoResizeMode = 'x-friendly-4k' | 'keep-original' | 'custom-long-edge';

export type XPhotoProcessingSettings = {
  targetSizeMb: number;
  toleranceMb: number;
  resizeMode: XPhotoResizeMode;
  customLongEdge: number;
  minQuality: number;
  maxQuality: number;
  allowDimensionFallback: boolean;
  autoDownload: boolean;
  backgroundColor: string;
};

export type XPhotoUploadPreprocessorInput = Partial<XPhotoProcessingSettings> & {
  photoFile: File | null;
};

export type XPhotoProcessProgress = {
  phase: 'decoding' | 'resizing' | 'encoding' | 'finalizing';
  progress: number;
};

export type XPhotoBlobResult = {
  fileName: string;
  mimeType: typeof OUTPUT_MIME_TYPE;
  blob: Blob;
  warnings: string[];
  withinTolerance: boolean;
  original: {
    fileName: string;
    sizeBytes: number;
    width: number;
    height: number;
    type: string;
  };
  output: {
    sizeBytes: number;
    width: number;
    height: number;
    quality: number;
    attempts: number;
    dimensionFallbacks: number;
  };
  target: {
    sizeBytes: number;
    toleranceBytes: number;
  };
};

export type XPhotoUploadPreprocessorOutput = {
  kind: 'download';
  fileName: string;
  mimeType: typeof OUTPUT_MIME_TYPE;
  base64: string;
  size: number;
  summary: {
    text: string;
    entries: Array<{ path: string; size: number }>;
  };
  warnings: string[];
  image: {
    original: XPhotoBlobResult['original'];
    output: XPhotoBlobResult['output'];
    target: XPhotoBlobResult['target'];
    withinTolerance: boolean;
  };
};

export const X_PHOTO_TOOL_SLUG = 'x-photo-upload-preprocessor';

export const X_PHOTO_DEFAULT_SETTINGS = {
  targetSizeMb: 4.5,
  toleranceMb: 0.1,
  resizeMode: 'x-friendly-4k',
  customLongEdge: 4096,
  minQuality: 0.82,
  maxQuality: 0.99,
  allowDimensionFallback: true,
  autoDownload: true,
  backgroundColor: '#ffffff',
} as const satisfies XPhotoProcessingSettings;

export async function run(input: XPhotoUploadPreprocessorInput, context?: ToolRunContext): Promise<XPhotoUploadPreprocessorOutput> {
  const locale = context?.locale ?? 'en';
  const result = await processXPhotoToBlob(input.photoFile, input, locale);
  const base64 = bytesToBase64(new Uint8Array(await result.blob.arrayBuffer()));

  return {
    kind: 'download',
    fileName: result.fileName,
    mimeType: OUTPUT_MIME_TYPE,
    base64,
    size: result.output.sizeBytes,
    summary: {
      text: message(
        locale,
        'summary',
        formatBytes(result.original.sizeBytes),
        `${result.original.width}×${result.original.height}`,
        formatBytes(result.output.sizeBytes),
        `${result.output.width}×${result.output.height}`,
        formatQuality(result.output.quality),
      ),
      entries: [{ path: result.fileName, size: result.output.sizeBytes }],
    },
    warnings: result.warnings,
    image: {
      original: result.original,
      output: result.output,
      target: result.target,
      withinTolerance: result.withinTolerance,
    },
  };
}

export function normalizeXPhotoSettings(settings: Partial<XPhotoProcessingSettings> = {}): XPhotoProcessingSettings {
  const rawMinQuality = clampNumber(settings.minQuality, 0.4, 0.99, X_PHOTO_DEFAULT_SETTINGS.minQuality);
  const rawMaxQuality = clampNumber(settings.maxQuality, 0.4, 0.99, X_PHOTO_DEFAULT_SETTINGS.maxQuality);
  const minQuality = Math.min(rawMinQuality, rawMaxQuality);
  const maxQuality = Math.max(rawMinQuality, rawMaxQuality);

  return {
    targetSizeMb: clampNumber(settings.targetSizeMb, 0.5, 20, X_PHOTO_DEFAULT_SETTINGS.targetSizeMb),
    toleranceMb: clampNumber(settings.toleranceMb, 0.01, 1, X_PHOTO_DEFAULT_SETTINGS.toleranceMb),
    resizeMode: isResizeMode(settings.resizeMode) ? settings.resizeMode : X_PHOTO_DEFAULT_SETTINGS.resizeMode,
    customLongEdge: Math.round(clampNumber(settings.customLongEdge, 512, 8192, X_PHOTO_DEFAULT_SETTINGS.customLongEdge)),
    minQuality,
    maxQuality,
    allowDimensionFallback: settings.allowDimensionFallback ?? X_PHOTO_DEFAULT_SETTINGS.allowDimensionFallback,
    autoDownload: settings.autoDownload ?? X_PHOTO_DEFAULT_SETTINGS.autoDownload,
    backgroundColor: normalizeHexColor(settings.backgroundColor),
  };
}

export async function processXPhotoToBlob(
  file: File | null,
  rawSettings: Partial<XPhotoProcessingSettings> = {},
  locale: Locale = 'en',
  onProgress?: (progress: XPhotoProcessProgress) => void,
): Promise<XPhotoBlobResult> {
  if (!file) {
    throw new Error(message(locale, 'missingFile'));
  }

  if (file.size > INPUT_MAX_BYTES) {
    throw new Error(message(locale, 'fileTooLarge', formatBytes(INPUT_MAX_BYTES)));
  }

  if (!supportsBrowserImagePipeline()) {
    throw new Error(message(locale, 'unsupportedBrowser'));
  }

  const settings = normalizeXPhotoSettings(rawSettings);
  const targetBytes = Math.round(settings.targetSizeMb * DECIMAL_MB);
  const toleranceBytes = Math.round(settings.toleranceMb * DECIMAL_MB);
  const warnings: string[] = [];
  let image: ImageBitmap | null = null;

  try {
    onProgress?.({ phase: 'decoding', progress: 0.08 });
    image = await decodeImage(file, locale);
    onProgress?.({ phase: 'resizing', progress: 0.2 });

    const targetDimensions = getTargetDimensions(image.width, image.height, settings);
    let canvas = renderToCanvas(image, image.width, image.height, targetDimensions.width, targetDimensions.height, settings.backgroundColor, locale);
    onProgress?.({ phase: 'encoding', progress: 0.36 });

    const encoded = await encodeCanvasToTarget(canvas, settings, targetBytes, toleranceBytes, locale, onProgress);
    canvas = encoded.canvas;

    const lowerBound = Math.max(0, targetBytes - toleranceBytes);
    const upperBound = targetBytes + toleranceBytes;
    const withinTolerance = encoded.blob.size >= lowerBound && encoded.blob.size <= upperBound;

    if (!withinTolerance) {
      warnings.push(
        encoded.blob.size < lowerBound
          ? message(locale, 'belowTarget', formatBytes(encoded.blob.size), formatBytes(targetBytes))
          : message(locale, 'aboveTarget', formatBytes(encoded.blob.size), formatBytes(targetBytes)),
      );
    }

    if (encoded.dimensionFallbacks > 0) {
      warnings.push(message(locale, 'dimensionFallback', String(encoded.dimensionFallbacks)));
    }

    if (file.type && !file.type.toLowerCase().includes('jpeg')) {
      warnings.push(message(locale, 'jpegOutput'));
    }

    onProgress?.({ phase: 'finalizing', progress: 1 });

    return {
      fileName: createOutputFileName(file.name),
      mimeType: OUTPUT_MIME_TYPE,
      blob: encoded.blob,
      warnings,
      withinTolerance,
      original: {
        fileName: file.name || 'photo',
        sizeBytes: file.size,
        width: image.width,
        height: image.height,
        type: file.type || 'unknown',
      },
      output: {
        sizeBytes: encoded.blob.size,
        width: canvas.width,
        height: canvas.height,
        quality: encoded.quality,
        attempts: encoded.attempts,
        dimensionFallbacks: encoded.dimensionFallbacks,
      },
      target: {
        sizeBytes: targetBytes,
        toleranceBytes,
      },
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(String(error));
  } finally {
    image?.close();
  }
}

type EncodeResult = {
  blob: Blob;
  quality: number;
  attempts: number;
  sizeTooLargeAtMinQuality: boolean;
  sizeTooSmallAtMaxQuality: boolean;
};

type TargetEncodeResult = EncodeResult & {
  canvas: OffscreenCanvas;
  dimensionFallbacks: number;
};

async function decodeImage(file: File, locale: Locale): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, {
      imageOrientation: 'from-image',
      colorSpaceConversion: 'default',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${message(locale, 'decodeFailed')} ${detail}`);
  }
}

function supportsBrowserImagePipeline(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined';
}

function getTargetDimensions(width: number, height: number, settings: XPhotoProcessingSettings): { width: number; height: number } {
  if (settings.resizeMode === 'keep-original') {
    return { width, height };
  }

  if (settings.resizeMode === 'custom-long-edge') {
    const scale = Math.min(1, settings.customLongEdge / Math.max(width, height));
    return scaleDimensions(width, height, scale);
  }

  if (width > height) {
    const scale = Math.min(1, 3840 / width, 2160 / height);
    return scaleDimensions(width, height, scale);
  }

  const scale = Math.min(1, 4096 / width, 4096 / height);
  return scaleDimensions(width, height, scale);
}

function scaleDimensions(width: number, height: number, scale: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function renderToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  backgroundColor: string,
  locale: Locale,
): OffscreenCanvas {
  let currentSource = source;
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;

  while (Math.max(currentWidth / targetWidth, currentHeight / targetHeight) > 2.15) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
    const nextCanvas = drawToCanvas(currentSource, currentWidth, currentHeight, nextWidth, nextHeight, backgroundColor, locale);

    currentSource = nextCanvas;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  return drawToCanvas(currentSource, currentWidth, currentHeight, targetWidth, targetHeight, backgroundColor, locale);
}

function drawToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  backgroundColor: string,
  locale: Locale,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const context = canvas.getContext('2d', { alpha: false });

  if (!context) {
    throw new Error(message(locale, 'canvasFailed'));
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, targetWidth, targetHeight);

  return canvas;
}

async function encodeCanvasToTarget(
  initialCanvas: OffscreenCanvas,
  settings: XPhotoProcessingSettings,
  targetBytes: number,
  toleranceBytes: number,
  locale: Locale,
  onProgress?: (progress: XPhotoProcessProgress) => void,
): Promise<TargetEncodeResult> {
  let canvas = initialCanvas;
  let dimensionFallbacks = 0;
  let attempts = 0;

  for (;;) {
    const encoded = await searchJpegQuality(canvas, settings, targetBytes, toleranceBytes, locale, attempts, onProgress);
    attempts += encoded.attempts;

    if (!encoded.sizeTooLargeAtMinQuality || !settings.allowDimensionFallback || dimensionFallbacks >= MAX_DIMENSION_FALLBACKS) {
      return {
        ...encoded,
        attempts,
        canvas,
        dimensionFallbacks,
      };
    }

    const scale = clampNumber(Math.sqrt(targetBytes / encoded.blob.size) * 0.985, 0.6, 0.96, 0.9);
    const nextWidth = Math.max(MIN_OUTPUT_EDGE, Math.round(canvas.width * scale));
    const nextHeight = Math.max(MIN_OUTPUT_EDGE, Math.round(canvas.height * scale));

    if (nextWidth >= canvas.width || nextHeight >= canvas.height) {
      return {
        ...encoded,
        attempts,
        canvas,
        dimensionFallbacks,
      };
    }

    dimensionFallbacks += 1;
    canvas = renderToCanvas(canvas, canvas.width, canvas.height, nextWidth, nextHeight, settings.backgroundColor, locale);
  }
}

async function searchJpegQuality(
  canvas: OffscreenCanvas,
  settings: XPhotoProcessingSettings,
  targetBytes: number,
  toleranceBytes: number,
  locale: Locale,
  completedAttempts: number,
  onProgress?: (progress: XPhotoProcessProgress) => void,
): Promise<EncodeResult> {
  const lowerBound = Math.max(0, targetBytes - toleranceBytes);
  const upperBound = targetBytes + toleranceBytes;
  let attempts = 0;

  const minBlob = await encodeJpeg(canvas, settings.minQuality, locale);
  attempts += 1;
  let best = { blob: minBlob, quality: settings.minQuality };

  if (minBlob.size > upperBound) {
    return {
      ...best,
      attempts,
      sizeTooLargeAtMinQuality: true,
      sizeTooSmallAtMaxQuality: false,
    };
  }

  const maxBlob = await encodeJpeg(canvas, settings.maxQuality, locale);
  attempts += 1;
  updateProgress(completedAttempts + attempts, onProgress);

  if (isCloserToTarget(maxBlob.size, best.blob.size, targetBytes)) {
    best = { blob: maxBlob, quality: settings.maxQuality };
  }

  if (maxBlob.size < lowerBound) {
    return {
      ...best,
      attempts,
      sizeTooLargeAtMinQuality: false,
      sizeTooSmallAtMaxQuality: true,
    };
  }

  let low = settings.minQuality;
  let high = settings.maxQuality;

  for (let index = 0; index < MAX_QUALITY_ITERATIONS; index += 1) {
    const quality = (low + high) / 2;
    const blob = await encodeJpeg(canvas, quality, locale);
    attempts += 1;
    updateProgress(completedAttempts + attempts, onProgress);

    if (isCloserToTarget(blob.size, best.blob.size, targetBytes)) {
      best = { blob, quality };
    }

    if (blob.size > upperBound) {
      high = quality;
    } else if (blob.size < lowerBound) {
      low = quality;
    } else {
      best = { blob, quality };
      break;
    }
  }

  return {
    ...best,
    attempts,
    sizeTooLargeAtMinQuality: false,
    sizeTooSmallAtMaxQuality: false,
  };
}

async function encodeJpeg(canvas: OffscreenCanvas, quality: number, locale: Locale): Promise<Blob> {
  try {
    return await canvas.convertToBlob({
      type: OUTPUT_MIME_TYPE,
      quality: clampNumber(quality, 0.01, 1, X_PHOTO_DEFAULT_SETTINGS.maxQuality),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${message(locale, 'encodeFailed')} ${detail}`);
  }
}

function updateProgress(completedAttempts: number, onProgress?: (progress: XPhotoProcessProgress) => void): void {
  const cappedAttempts = Math.min(completedAttempts, MAX_QUALITY_ITERATIONS + 4);
  onProgress?.({ phase: 'encoding', progress: 0.36 + (cappedAttempts / (MAX_QUALITY_ITERATIONS + 4)) * 0.56 });
}

function isCloserToTarget(candidateBytes: number, currentBytes: number, targetBytes: number): boolean {
  return Math.abs(candidateBytes - targetBytes) < Math.abs(currentBytes - targetBytes);
}

function createOutputFileName(inputName: string): string {
  const trimmed = inputName.trim();
  const baseName = trimmed ? trimmed.replace(/\.[a-z0-9]+$/i, '') : 'x-photo';
  const safeBaseName = baseName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'x-photo';

  return `${safeBaseName}-x-4k.jpg`;
}

function normalizeHexColor(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    return value.toLowerCase();
  }

  return X_PHOTO_DEFAULT_SETTINGS.backgroundColor;
}

function isResizeMode(value: unknown): value is XPhotoResizeMode {
  return value === 'x-friendly-4k' || value === 'keep-original' || value === 'custom-long-edge';
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function formatBytes(value: number): string {
  if (value < 1000) return `${value} B`;
  if (value < DECIMAL_MB) return `${(value / 1000).toFixed(1)} KB`;
  return `${(value / DECIMAL_MB).toFixed(2)} MB`;
}

export function formatQuality(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function message(locale: Locale, key: string, ...values: string[]): string {
  const messages: Record<Locale, Record<string, string>> = {
    en: {
      missingFile: 'Choose a photo first.',
      fileTooLarge: `The selected photo is too large. Limit: ${values[0]}.`,
      unsupportedBrowser: 'This browser does not support the required local image pipeline. Try a current Chromium, Firefox, or Safari build.',
      decodeFailed: 'Could not decode this image:',
      canvasFailed: 'Could not create a local canvas for image processing.',
      encodeFailed: 'Could not encode the JPEG:',
      belowTarget: `The output is ${values[0]}, below the ${values[1]} target. The image is already too simple to fill the target at maximum quality.`,
      aboveTarget: `The output is ${values[0]}, above the ${values[1]} target. The image is too complex for the current quality and dimension limits.`,
      dimensionFallback: `The image was downscaled ${values[0]} extra time(s) because JPEG quality alone could not hit the target size.`,
      jpegOutput: 'The input was not JPEG; transparent pixels were flattened to the configured background color.',
      summary: `Compressed ${values[0]} / ${values[1]} into ${values[2]} / ${values[3]} at JPEG quality ${values[4]}.`,
    },
    ja: {
      missingFile: '先に写真を選択してください。',
      fileTooLarge: `選択した写真が大きすぎます。上限: ${values[0]}。`,
      unsupportedBrowser: 'このブラウザは必要なローカル画像処理パイプラインに対応していません。最新の Chromium、Firefox、Safari を試してください。',
      decodeFailed: 'この画像をデコードできませんでした:',
      canvasFailed: '画像処理用のローカル Canvas を作成できませんでした。',
      encodeFailed: 'JPEG をエンコードできませんでした:',
      belowTarget: `出力は ${values[0]} で、目標 ${values[1]} を下回っています。最大品質でも目標サイズまで大きくできない単純な画像です。`,
      aboveTarget: `出力は ${values[0]} で、目標 ${values[1]} を上回っています。現在の品質・寸法制限では画像が複雑すぎます。`,
      dimensionFallback: `JPEG 品質だけでは目標サイズに届かなかったため、画像を追加で ${values[0]} 回縮小しました。`,
      jpegOutput: '入力は JPEG ではありません。透明ピクセルは設定した背景色で合成されました。',
      summary: `${values[0]} / ${values[1]} を ${values[2]} / ${values[3]}、JPEG 品質 ${values[4]} に圧縮しました。`,
    },
    'zh-CN': {
      missingFile: '请先选择一张照片。',
      fileTooLarge: `选择的照片太大。当前限制为 ${values[0]}。`,
      unsupportedBrowser: '当前浏览器不支持所需的本地图像处理能力。请使用较新的 Chromium、Firefox 或 Safari。',
      decodeFailed: '无法解码这张图片：',
      canvasFailed: '无法创建用于本地图像处理的 Canvas。',
      encodeFailed: '无法编码 JPEG：',
      belowTarget: `输出为 ${values[0]}，低于 ${values[1]} 目标。这张图在最高质量下也无法填满目标大小。`,
      aboveTarget: `输出为 ${values[0]}，高于 ${values[1]} 目标。当前质量和尺寸限制下，这张图的细节复杂度过高。`,
      dimensionFallback: `由于只降低 JPEG 质量仍无法命中目标大小，已额外缩小尺寸 ${values[0]} 次。`,
      jpegOutput: '输入不是 JPEG；透明像素已使用配置的底色合成。',
      summary: `已将 ${values[0]} / ${values[1]} 压缩为 ${values[2]} / ${values[3]}，JPEG 质量 ${values[4]}。`,
    },
  };

  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}
