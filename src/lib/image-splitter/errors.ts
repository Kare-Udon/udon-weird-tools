export type ImageSplitterErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'unsupported-format'
  | 'animated-image'
  | 'invalid-image-header'
  | 'image-too-large'
  | 'unsupported-browser'
  | 'decode-failed'
  | 'preview-failed'
  | 'preview-type-invalid'
  | 'canvas-unavailable'
  | 'cancelled'
  | 'stale-task'
  | 'invalid-slice'
  | 'canvas-context-unavailable'
  | 'encode-failed'
  | 'output-empty'
  | 'output-type-invalid'
  | 'output-dimensions-invalid'
  | 'output-set-too-large'
  | 'file-constructor-unavailable'
  | 'zip-input-empty'
  | 'zip-input-too-large'
  | 'zip-entry-empty'
  | 'zip-entry-name-invalid'
  | 'zip-entry-name-too-long'
  | 'zip-too-many-entries'
  | 'zip-too-large'
  | 'zip-read-failed'
  | 'zip-encode-failed'
  | 'save-busy'
  | 'empty-file-set'
  | 'share-unavailable'
  | 'batch-share-unavailable'
  | 'share-failed'
  | 'directory-picker-unavailable'
  | 'file-picker-unavailable'
  | 'picker-failed'
  | 'permission-denied'
  | 'directory-write-failed'
  | 'directory-partial'
  | 'file-write-failed'
  | 'download-unavailable'
  | 'download-failed'
  | 'zip-not-prepared'
  | 'invalid-save-file'
  | 'save-cancelled';

export class ImageSplitterError extends Error {
  readonly code: ImageSplitterErrorCode;
  readonly detail?: string;

  constructor(code: ImageSplitterErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ImageSplitterError';
    this.code = code;
    this.detail = detail;
  }
}

export function imageSplitterError(code: ImageSplitterErrorCode, detail?: string): ImageSplitterError {
  return new ImageSplitterError(code, detail);
}

export function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

export function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
