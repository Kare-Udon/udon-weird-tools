import { errorDetail, imageSplitterError, isAbortError, ImageSplitterError } from './errors.ts';
import { createSliceFileName } from './names.ts';
import { assertTaskActive, normalizeTaskControl, type TaskControl } from './task.ts';

export { ImageSplitterError } from './errors.ts';
export type { ImageSplitterErrorCode } from './errors.ts';
export type { TaskControl } from './task.ts';

export const IMAGE_SPLITTER_LIMITS = Object.freeze({
  maxInputBytes: 80 * 1024 * 1024,
  maxPixels: 24_000_000,
  maxEdge: 8192,
  maxOutputBytes: 128 * 1024 * 1024,
  maxZipBytes: 128 * 1024 * 1024,
  previewMaxDimension: 1024,
});

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export type ImageHeaderInfo = {
  format: SupportedImageFormat;
  width?: number;
  height?: number;
  animated: boolean;
  orientation: number;
};

export type SliceRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DrawableImage = CanvasImageSource & {
  width: number;
  height: number;
  close?: () => void;
};

export type DecodedImage = {
  width: number;
  height: number;
  source: DrawableImage;
  previewUrl: string;
  release: () => void;
};

export type ObjectUrlApi = {
  create: (value: Blob) => string;
  revoke: (url: string) => void;
};

export type DecodeOptions = TaskControl & {
  imageBitmapFactory?: (file: File, options: ImageBitmapOptions) => Promise<DrawableImage>;
  imageElementFactory?: () => HTMLImageElement;
  sourceCanvasFactory?: CanvasFactory;
  previewCanvasFactory?: () => HTMLCanvasElement;
  objectUrlApi?: ObjectUrlApi;
  previewMaxDimension?: number;
};

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

export type EncodeOptions = TaskControl & {
  canvasFactory?: CanvasFactory;
  disposeCanvas?: (canvas: HTMLCanvasElement) => void;
  maxOutputBytes?: number;
};

type CanvasContext = Pick<CanvasRenderingContext2D, 'drawImage' | 'imageSmoothingEnabled'> & Partial<Pick<CanvasRenderingContext2D, 'clearRect'>>;

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const IMAGE_HEADER_PROBE_BYTES = 1024 * 1024;
const JPEG_START_OF_IMAGE = 0xffd8;
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const AVIF_CONTAINER_BOXES = new Set(['meta', 'iprp', 'ipco', 'ipma', 'iref', 'iloc', 'pitm']);

export function inspectImageHeader(bytes: Uint8Array): ImageHeaderInfo | null {
  if (isPng(bytes)) return inspectPng(bytes);
  if (isJpeg(bytes)) return inspectJpeg(bytes);
  if (isWebp(bytes)) return inspectWebp(bytes);
  if (isBmff(bytes)) return inspectAvif(bytes);
  return null;
}

export async function decodeImageFile(file: File, options?: DecodeOptions | AbortSignal): Promise<DecodedImage> {
  const resolvedOptions = isAbortSignal(options) ? { signal: options } : (options ?? {});
  const control = normalizeTaskControl(resolvedOptions);
  assertTaskActive(control);

  if (!file || typeof file.size !== 'number') {
    throw imageSplitterError('empty-file');
  }
  if (file.size <= 0) throw imageSplitterError('empty-file');
  if (file.size > IMAGE_SPLITTER_LIMITS.maxInputBytes) {
    throw imageSplitterError('file-too-large', String(IMAGE_SPLITTER_LIMITS.maxInputBytes));
  }

  let header: ImageHeaderInfo;
  try {
    const probe = new Uint8Array(await file.slice(0, Math.min(file.size, IMAGE_HEADER_PROBE_BYTES)).arrayBuffer());
    assertTaskActive(control);
    const inspected = inspectImageHeader(probe);
    if (!inspected) throw imageSplitterError('unsupported-format');
    header = inspected;
  } catch (error) {
    if (error instanceof ImageSplitterError) throw error;
    throw imageSplitterError('decode-failed', errorDetail(error));
  }

  if (header.animated) throw imageSplitterError('animated-image');
  if (header.format === 'png' && await fileHasPngAnimationChunk(file, control)) {
    throw imageSplitterError('animated-image');
  }
  validateKnownDimensions(header.width, header.height);
  assertTaskActive(control);

  const objectUrlApi = resolvedOptions.objectUrlApi ?? getDefaultObjectUrlApi();
  let source: DrawableImage | null = null;
  let fallbackImage: HTMLImageElement | null = null;
  let sourceCanvas: HTMLCanvasElement | null = null;
  let sourceUrl = '';
  let previewUrl = '';
  let previewCanvas: HTMLCanvasElement | null = null;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;

    if (previewUrl && objectUrlApi) {
      safelyRevoke(objectUrlApi, previewUrl);
      previewUrl = '';
    }
    if (previewCanvas) resetCanvas(previewCanvas);
    if (sourceCanvas) resetCanvas(sourceCanvas);

    if (fallbackImage) {
      try {
        fallbackImage.src = '';
      } catch {
        // 清理阶段不能覆盖原始错误。
      }
    }
    if (sourceUrl && objectUrlApi) safelyRevoke(objectUrlApi, sourceUrl);
    if (source && typeof source.close === 'function') {
      try {
        source.close();
      } catch {
        // ImageBitmap.close() 的重复/平台异常不应阻断剩余资源清理。
      }
    }
    source = null;
    fallbackImage = null;
  };

  try {
    const imageBitmapFactory = resolvedOptions.imageBitmapFactory ?? getDefaultImageBitmapFactory();
    let bitmapError: unknown = null;

    if (imageBitmapFactory) {
      try {
        source = await imageBitmapFactory(file, {
          imageOrientation: 'from-image',
          colorSpaceConversion: 'default',
        });
        assertTaskActive(control);
        if (!source) throw imageSplitterError('decode-failed');
        validateDecodedDimensions(source.width, source.height);
      } catch (error) {
        assertTaskActive(control);
        if (isAbortError(error)) throw imageSplitterError('cancelled');
        if (error instanceof ImageSplitterError && (error.code === 'cancelled' || error.code === 'stale-task')) {
          throw error;
        }
        if (error instanceof ImageSplitterError && (error.code === 'image-too-large' || error.code === 'invalid-image-header')) {
          throw error;
        }
        bitmapError = error;
        source = null;
      }
    }

    if (!source) {
      const imageElementFactory = resolvedOptions.imageElementFactory ?? getDefaultImageElementFactory();
      if (!imageElementFactory || !objectUrlApi) {
        throw imageSplitterError('unsupported-browser', bitmapError ? errorDetail(bitmapError) : undefined);
      }

      fallbackImage = imageElementFactory();
      if (!fallbackImage || typeof fallbackImage.decode !== 'function') {
        throw imageSplitterError('unsupported-browser');
      }
      sourceUrl = objectUrlApi.create(file);
      fallbackImage.decoding = 'async';
      fallbackImage.src = sourceUrl;
      await fallbackImage.decode();
      assertTaskActive(control);

      const naturalWidth = Number(fallbackImage.naturalWidth || fallbackImage.width);
      const naturalHeight = Number(fallbackImage.naturalHeight || fallbackImage.height);
      validateDecodedDimensions(naturalWidth, naturalHeight);

      const sourceCanvasFactory = resolvedOptions.sourceCanvasFactory ?? getDefaultCanvasFactory();
      if (!sourceCanvasFactory) throw imageSplitterError('canvas-unavailable');
      assertTaskActive(control);
      sourceCanvas = sourceCanvasFactory(naturalWidth, naturalHeight);
      if (!sourceCanvas) throw imageSplitterError('canvas-unavailable');
      sourceCanvas.width = naturalWidth;
      sourceCanvas.height = naturalHeight;
      let sourceContext: CanvasContext | null;
      try {
        sourceContext = sourceCanvas.getContext('2d', { alpha: true, willReadFrequently: true }) as CanvasContext | null;
      } catch (error) {
        throw imageSplitterError('canvas-context-unavailable', errorDetail(error));
      }
      if (!sourceContext) throw imageSplitterError('canvas-context-unavailable');
      try {
        // 首次获取 context 时请求可读栅格路径，避免 Chromium GPU 解码舍入与镜像边界插值差异。
        sourceContext.imageSmoothingEnabled = false;
        sourceContext.clearRect?.(0, 0, naturalWidth, naturalHeight);
        // HTMLImageElement 已由现代浏览器按 EXIF 定向呈现；这里只栅格化一次，不能再次按 orientation 旋转。
        sourceContext.drawImage(fallbackImage, 0, 0, naturalWidth, naturalHeight);
      } catch (error) {
        throw imageSplitterError('decode-failed', errorDetail(error));
      }
      assertTaskActive(control);
      source = sourceCanvas;
    }

    assertTaskActive(control);
    const rawWidth = fallbackImage
      ? Number(fallbackImage.naturalWidth || fallbackImage.width)
      : source.width;
    const rawHeight = fallbackImage
      ? Number(fallbackImage.naturalHeight || fallbackImage.height)
      : source.height;
    const dimensions = { width: rawWidth, height: rawHeight };
    validateDecodedDimensions(dimensions.width, dimensions.height);

    if (resolvedOptions.previewCanvasFactory) {
      previewCanvas = resolvedOptions.previewCanvasFactory();
    } else {
      previewCanvas = getDefaultCanvasFactory()?.(1, 1) ?? null;
    }
    if (!previewCanvas) throw imageSplitterError('canvas-unavailable');
    previewUrl = await createPreviewUrl(
      previewCanvas,
      source,
      dimensions.width,
      dimensions.height,
      objectUrlApi,
      resolvedOptions.previewMaxDimension,
      control,
    );
    resetCanvas(previewCanvas);

    return {
      width: dimensions.width,
      height: dimensions.height,
      source,
      previewUrl,
      release,
    };
  } catch (error) {
    release();
    if (error instanceof ImageSplitterError) throw error;
    if (isAbortError(error)) throw imageSplitterError('cancelled');
    throw imageSplitterError('decode-failed', errorDetail(error));
  }
}

export async function encodeSlices(
  decoded: DecodedImage,
  slices: readonly SliceRect[],
  sourceName: string,
  options?: EncodeOptions | AbortSignal,
): Promise<File[]> {
  const resolvedOptions = isAbortSignal(options) ? { signal: options } : (options ?? {});
  const control = normalizeTaskControl(resolvedOptions);
  assertTaskActive(control);

  if (!decoded || !decoded.source || !Number.isInteger(decoded.width) || !Number.isInteger(decoded.height)) {
    throw imageSplitterError('invalid-image-header');
  }
  validateDecodedDimensions(decoded.width, decoded.height);
  if (!Array.isArray(slices) || slices.length === 0) throw imageSplitterError('invalid-slice');

  for (let index = 0; index < slices.length; index += 1) {
    validateSlice(slices[index], decoded.width, decoded.height);
    if (slices[index].index !== index) throw imageSplitterError('invalid-slice');
  }

  const canvasFactory = resolvedOptions.canvasFactory ?? getDefaultCanvasFactory();
  if (!canvasFactory) throw imageSplitterError('canvas-unavailable');
  if (typeof File !== 'function') throw imageSplitterError('file-constructor-unavailable');

  const maxOutputBytes = lowerLimit(resolvedOptions.maxOutputBytes, IMAGE_SPLITTER_LIMITS.maxOutputBytes);
  const files: File[] = [];
  let totalBytes = 0;
  let canvas: HTMLCanvasElement | null = null;

  try {
    const first = slices[0];
    canvas = canvasFactory(first.width, first.height);
    if (!canvas) throw imageSplitterError('canvas-unavailable');

    for (const slice of slices) {
      assertTaskActive(control);
      canvas.width = slice.width;
      canvas.height = slice.height;
      const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true }) as CanvasContext | null;
      if (!context) throw imageSplitterError('canvas-context-unavailable');
      // 调整 Canvas 尺寸会重置状态；每张分片都恢复不插值的原尺寸采样。
      context.imageSmoothingEnabled = false;
      context.clearRect?.(0, 0, slice.width, slice.height);
      try {
        context.drawImage(
          decoded.source,
          slice.x,
          slice.y,
          slice.width,
          slice.height,
          0,
          0,
          slice.width,
          slice.height,
        );
      } catch (error) {
        throw imageSplitterError('encode-failed', errorDetail(error));
      }

      const blob = await canvasToBlob(canvas);
      assertTaskActive(control);
      const outputSize = await validatePngBlob(blob, slice.width, slice.height);
      if (outputSize <= 0) throw imageSplitterError('output-empty');
      if (!blob) throw imageSplitterError('output-empty');

      totalBytes += outputSize;
      if (totalBytes > maxOutputBytes) {
        throw imageSplitterError('output-set-too-large', String(maxOutputBytes));
      }

      const file = new File([blob], createSliceFileName(sourceName, slice.index, slices.length), {
        type: 'image/png',
        lastModified: 0,
      });
      if (file.size <= 0) throw imageSplitterError('output-empty');
      if (file.type.toLowerCase() !== 'image/png') throw imageSplitterError('output-type-invalid');
      files.push(file);
    }

    assertTaskActive(control);
    return files;
  } finally {
    if (canvas) {
      if (resolvedOptions.disposeCanvas) {
        try {
          resolvedOptions.disposeCanvas(canvas);
        } catch {
          resetCanvas(canvas);
        }
      } else {
        resetCanvas(canvas);
      }
    }
  }
}

function validateSlice(slice: SliceRect, width: number, height: number): void {
  if (!slice || !Number.isInteger(slice.index) || slice.index < 0) throw imageSplitterError('invalid-slice');
  if (!Number.isInteger(slice.x) || !Number.isInteger(slice.y) || !Number.isInteger(slice.width) || !Number.isInteger(slice.height)) {
    throw imageSplitterError('invalid-slice');
  }
  if (slice.width <= 0 || slice.height <= 0 || slice.x < 0 || slice.y < 0) throw imageSplitterError('invalid-slice');
  if (slice.x + slice.width > width || slice.y + slice.height > height) throw imageSplitterError('invalid-slice');
}

function validateKnownDimensions(width: number | undefined, height: number | undefined): void {
  if (width === undefined || height === undefined) return;
  validateDecodedDimensions(width, height);
}

function validateDecodedDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw imageSplitterError('invalid-image-header');
  }
  if (width > IMAGE_SPLITTER_LIMITS.maxEdge || height > IMAGE_SPLITTER_LIMITS.maxEdge || width * height > IMAGE_SPLITTER_LIMITS.maxPixels) {
    throw imageSplitterError('image-too-large', `${width}x${height}`);
  }
}

async function createPreviewUrl(
  canvas: HTMLCanvasElement,
  source: DrawableImage,
  sourceWidth: number,
  sourceHeight: number,
  objectUrlApi: ObjectUrlApi | null,
  requestedMaxDimension: number | undefined,
  control: TaskControl | undefined,
): Promise<string> {
  if (!objectUrlApi) throw imageSplitterError('unsupported-browser');
  const maxDimension = lowerLimit(requestedMaxDimension, IMAGE_SPLITTER_LIMITS.previewMaxDimension);
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true }) as CanvasContext | null;
  if (!context) throw imageSplitterError('canvas-context-unavailable');

  try {
    context.clearRect?.(0, 0, width, height);
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    const blob = await canvasToBlob(canvas);
    assertTaskActive(control);
    if (!blob || blob.size <= 0) throw imageSplitterError('preview-failed');
    if (blob.type.toLowerCase() !== 'image/png') throw imageSplitterError('preview-type-invalid');
    return objectUrlApi.create(blob);
  } catch (error) {
    if (error instanceof ImageSplitterError) throw error;
    if (isAbortError(error)) throw imageSplitterError('cancelled');
    throw imageSplitterError('preview-failed', errorDetail(error));
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') throw imageSplitterError('encode-failed');
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(resolve, 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

async function validatePngBlob(blob: Blob | null, width: number, height: number): Promise<number> {
  if (!blob || blob.size <= 0) throw imageSplitterError('output-empty');
  if (blob.type.toLowerCase() !== 'image/png') throw imageSplitterError('output-type-invalid');
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  } catch (error) {
    throw imageSplitterError('encode-failed', errorDetail(error));
  }
  if (bytes.byteLength < 33 || !hasBytes(bytes, 0, PNG_SIGNATURE)) throw imageSplitterError('output-type-invalid');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, false) !== 13 || readAscii(bytes, 12, 4) !== 'IHDR') throw imageSplitterError('output-type-invalid');
  if (view.getUint32(16, false) !== width || view.getUint32(20, false) !== height) {
    throw imageSplitterError('output-dimensions-invalid');
  }
  return blob.size;
}

async function fileHasPngAnimationChunk(file: File, control: TaskControl | undefined): Promise<boolean> {
  if (typeof file.stream !== 'function') return false;
  const reader = file.stream().getReader();
  const cursor = new ByteStreamCursor(reader);
  try {
    const signature = await cursor.readExactly(PNG_SIGNATURE.byteLength);
    if (!signature || !hasBytes(signature, 0, PNG_SIGNATURE)) return false;
    for (;;) {
      const chunkHeader = await cursor.readExactly(8);
      if (!chunkHeader) return false;
      const view = new DataView(chunkHeader.buffer, chunkHeader.byteOffset, chunkHeader.byteLength);
      const length = view.getUint32(0, false);
      const type = readAscii(chunkHeader, 4, 4);
      if (type === 'acTL') return true;
      await cursor.skip(length + 4);
      assertTaskActive(control);
      if (type === 'IDAT' || type === 'IEND') return false;
    }
  } catch (error) {
    if (error instanceof ImageSplitterError) throw error;
    if (isAbortError(error)) throw imageSplitterError('cancelled');
    throw imageSplitterError('decode-failed', errorDetail(error));
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 读取器清理失败不改变已确定的格式结果。
    }
    reader.releaseLock();
  }
}

class ByteStreamCursor {
  private pending: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private done = false;
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.reader = reader;
  }

  async readExactly(length: number): Promise<Uint8Array | null> {
    if (length < 0) throw new Error('negative read length');
    const output = new Uint8Array(length);
    let offset = 0;
    while (offset < length) {
      if (this.pending.byteLength === 0) {
        await this.fill();
        if (this.pending.byteLength === 0 && this.done) {
          if (offset === 0) return null;
          throw new Error('truncated PNG chunk header');
        }
      }
      const amount = Math.min(length - offset, this.pending.byteLength);
      output.set(this.pending.subarray(0, amount), offset);
      this.pending = this.pending.subarray(amount);
      offset += amount;
    }
    return output;
  }

  async skip(length: number): Promise<void> {
    let remaining = length;
    while (remaining > 0) {
      if (this.pending.byteLength === 0) {
        await this.fill();
        if (this.pending.byteLength === 0 && this.done) throw new Error('truncated PNG chunk');
      }
      const amount = Math.min(remaining, this.pending.byteLength);
      this.pending = this.pending.subarray(amount);
      remaining -= amount;
    }
  }

  private async fill(): Promise<void> {
    if (this.done) return;
    const result = await this.reader.read();
    if (result.done || !result.value || result.value.byteLength === 0) {
      this.done = true;
      this.pending = new Uint8Array(0);
      return;
    }
    this.pending = result.value;
  }
}

function getDefaultImageBitmapFactory(): DecodeOptions['imageBitmapFactory'] | undefined {
  const candidate = globalThis.createImageBitmap;
  if (typeof candidate !== 'function') return undefined;
  return (file, options) => candidate(file, options) as Promise<DrawableImage>;
}

function getDefaultImageElementFactory(): DecodeOptions['imageElementFactory'] | undefined {
  if (typeof globalThis.Image !== 'function') return undefined;
  return () => new Image();
}

function getDefaultCanvasFactory(): CanvasFactory | undefined {
  if (typeof document === 'undefined') return undefined;
  return (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
}

function getDefaultObjectUrlApi(): ObjectUrlApi | null {
  if (typeof globalThis.URL?.createObjectURL !== 'function' || typeof globalThis.URL?.revokeObjectURL !== 'function') return null;
  return {
    create: (value) => globalThis.URL.createObjectURL(value),
    revoke: (url) => globalThis.URL.revokeObjectURL(url),
  };
}

function safelyRevoke(api: ObjectUrlApi, url: string): void {
  try {
    api.revoke(url);
  } catch {
    // 释放路径保持幂等。
  }
}

function resetCanvas(canvas: HTMLCanvasElement): void {
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // 测试 adapter 或已被宿主销毁的 Canvas 不应阻断资源释放。
  }
}

function lowerLimit(value: number | undefined, hardLimit: number): number {
  if (!Number.isFinite(value) || (value as number) <= 0) return hardLimit;
  return Math.min(hardLimit, Math.floor(value as number));
}

function isAbortSignal(value: DecodeOptions | EncodeOptions | AbortSignal | undefined): value is AbortSignal {
  return Boolean(value && 'aborted' in value && typeof value.aborted === 'boolean' && !('signal' in value));
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.byteLength >= PNG_SIGNATURE.byteLength && hasBytes(bytes, 0, PNG_SIGNATURE);
}

function inspectPng(bytes: Uint8Array): ImageHeaderInfo {
  let width: number | undefined;
  let height: number | undefined;
  let animated = false;
  let offset = 8;
  while (offset + 12 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset);
    const length = view.getUint32(0, false);
    if (length > bytes.byteLength - offset - 12) break;
    const type = readAscii(bytes, offset + 4, 4);
    if (type === 'IHDR' && length >= 8) {
      width = view.getUint32(8, false);
      height = view.getUint32(12, false);
    }
    if (type === 'acTL') animated = true;
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return { format: 'png', width, height, animated, orientation: 1 };
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0, false) === JPEG_START_OF_IMAGE;
}

function inspectJpeg(bytes: Uint8Array): ImageHeaderInfo {
  let width: number | undefined;
  let height: number | undefined;
  let orientation = 1;
  let offset = 2;

  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) break;
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset).getUint16(0, false);
    if (length < 2 || offset + length > bytes.byteLength) break;
    const segmentStart = offset + 2;
    const segmentLength = length - 2;
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 5) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + segmentStart, segmentLength);
      height = view.getUint16(1, false);
      width = view.getUint16(3, false);
      break;
    }
    if (marker === 0xe1) orientation = parseExifOrientation(bytes.subarray(segmentStart, segmentStart + segmentLength));
    offset += length;
  }
  return { format: 'jpeg', width, height, animated: false, orientation };
}

function parseExifOrientation(bytes: Uint8Array): number {
  if (bytes.byteLength < 14 || readAscii(bytes, 0, 6) !== 'Exif\0\0') return 1;
  const tiff = 6;
  const littleEndian = readAscii(bytes, tiff, 2) === 'II';
  if (!littleEndian && readAscii(bytes, tiff, 2) !== 'MM') return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const get16 = (offset: number) => view.getUint16(offset, littleEndian);
  const get32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (tiff + 8 > bytes.byteLength || get16(tiff + 2) !== 42) return 1;
  const ifdOffset = get32(tiff + 4);
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > bytes.byteLength) return 1;
  const count = get16(ifd);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > bytes.byteLength) break;
    if (get16(entry) !== 0x0112) continue;
    if (get16(entry + 2) !== 3 || get32(entry + 4) < 1 || entry + 10 > bytes.byteLength) return 1;
    const value = get16(entry + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && readAscii(bytes, 0, 4) === 'RIFF' && readAscii(bytes, 8, 4) === 'WEBP';
}

function inspectWebp(bytes: Uint8Array): ImageHeaderInfo {
  let width: number | undefined;
  let height: number | undefined;
  let animated = false;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const type = readAscii(bytes, offset, 4);
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, bytes.byteLength - offset - 4).getUint32(0, true);
    const dataStart = offset + 8;
    if (type === 'ANIM' || type === 'ANMF') animated = true;
    if (type === 'VP8X' && size >= 10 && dataStart + 10 <= bytes.byteLength) {
      const flags = bytes[dataStart];
      animated ||= (flags & 0x02) !== 0;
      width = readUint24(bytes, dataStart + 4, true) + 1;
      height = readUint24(bytes, dataStart + 7, true) + 1;
    }
    if (type === 'VP8 ' && size >= 10 && dataStart + 10 <= bytes.byteLength && bytes[dataStart + 3] === 0x9d && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2a) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + dataStart + 6, 4);
      width = view.getUint16(0, true) & 0x3fff;
      height = view.getUint16(2, true) & 0x3fff;
    }
    if (type === 'VP8L' && size >= 5 && dataStart + 5 <= bytes.byteLength && bytes[dataStart] === 0x2f) {
      const bits = bytes.subarray(dataStart + 1, dataStart + 5);
      width = 1 + (bits[0] | ((bits[1] & 0x3f) << 8));
      height = 1 + (((bits[1] >> 6) | (bits[2] << 2) | ((bits[3] & 0xf) << 10)));
    }
    if (size > bytes.byteLength - dataStart) break;
    offset = dataStart + size + (size & 1);
  }
  return { format: 'webp', width, height, animated, orientation: 1 };
}

function isBmff(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && readAscii(bytes, 4, 4) === 'ftyp';
}

function inspectAvif(bytes: Uint8Array): ImageHeaderInfo | null {
  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  if (boxSize < 16 || boxSize > bytes.byteLength) return null;
  const brands: string[] = [readAscii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= Math.min(boxSize, bytes.byteLength); offset += 4) brands.push(readAscii(bytes, offset, 4));
  const isAvif = brands.includes('avif') || brands.includes('avis');
  if (!isAvif) return null;
  const dimensions = findIspeDimensions(bytes, bytes.byteLength);
  return {
    format: 'avif',
    width: dimensions?.width,
    height: dimensions?.height,
    animated: brands.includes('avis'),
    orientation: 1,
  };
}

function findIspeDimensions(bytes: Uint8Array, end: number): { width: number; height: number } | undefined {
  const result = scanBoxes(bytes, 0, Math.min(end, bytes.byteLength), 0);
  return result;
}

function scanBoxes(bytes: Uint8Array, start: number, end: number, depth: number): { width: number; height: number } | undefined {
  if (depth > 8) return undefined;
  let offset = start;
  while (offset + 8 <= end) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, end - offset);
    let size = view.getUint32(0, false);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > end) return undefined;
      const high = view.getUint32(8, false);
      const low = view.getUint32(12, false);
      if (high !== 0) return undefined;
      size = low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || size > end - offset) return undefined;
    const payloadStart = offset + headerSize;
    const payloadEnd = offset + size;
    if (type === 'ispe' && size >= headerSize + 12) {
      const payload = new DataView(bytes.buffer, bytes.byteOffset + payloadStart, payloadEnd - payloadStart);
      return { width: payload.getUint32(4, false), height: payload.getUint32(8, false) };
    }
    if (AVIF_CONTAINER_BOXES.has(type)) {
      const nestedStart = type === 'meta' ? payloadStart + 4 : payloadStart;
      const nested = nestedStart <= payloadEnd ? scanBoxes(bytes, nestedStart, payloadEnd, depth + 1) : undefined;
      if (nested) return nested;
    }
    offset += size;
  }
  return undefined;
}

function readUint24(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
    : (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function hasBytes(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (offset < 0 || offset + expected.byteLength > bytes.byteLength) return false;
  for (let index = 0; index < expected.byteLength; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}
