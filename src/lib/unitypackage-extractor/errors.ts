export const EXTRACTION_ERROR_CODES = [
  'unsupported-browser',
  'missing-file',
  'invalid-file',
  'input-too-large',
  'cancelled',
  'permission-denied',
  'gzip-invalid',
  'gzip-truncated',
  'tar-invalid-header',
  'tar-invalid-boundary',
  'tar-truncated',
  'path-unsafe',
  'path-too-long',
  'empty-path',
  'duplicate-group-member',
  'duplicate-path',
  'path-conflict',
  'missing-pathname',
  'missing-asset',
  'empty-package',
  'entry-too-large',
  'index-budget-exceeded',
  'expanded-size-limit',
  'output-budget-exceeded',
  'output-directory-failed',
  'file-exists',
  'write-failed',
  'worker-failed',
  'unknown',
] as const;

export type ExtractionErrorCode = typeof EXTRACTION_ERROR_CODES[number];

export const EXTRACTION_WARNING_CODES = [
  'unknown-member-ignored',
] as const;

export type ExtractionWarningCode = typeof EXTRACTION_WARNING_CODES[number];

export type PartialExtraction = {
  directoryName?: string;
  filesWritten?: number;
  bytesWritten?: number;
};

export class UnityPackageExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly detail?: string;
  readonly directoryName?: string;
  readonly filesWritten?: number;
  readonly bytesWritten?: number;

  constructor(code: ExtractionErrorCode, detail?: string, partial?: PartialExtraction) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'UnityPackageExtractionError';
    this.code = code;
    this.detail = detail;
    this.directoryName = partial?.directoryName;
    this.filesWritten = partial?.filesWritten;
    this.bytesWritten = partial?.bytesWritten;
  }
}

export function extractionError(code: ExtractionErrorCode, detail?: string, partial?: PartialExtraction): UnityPackageExtractionError {
  return new UnityPackageExtractionError(code, detail, partial);
}

export function asExtractionError(error: unknown, fallback: ExtractionErrorCode = 'unknown'): UnityPackageExtractionError {
  if (error instanceof UnityPackageExtractionError) return error;
  if (isAbortError(error)) return new UnityPackageExtractionError('cancelled', errorDetail(error));
  return new UnityPackageExtractionError(fallback, errorDetail(error));
}

export function errorDetail(error: unknown): string | undefined {
  if (error instanceof Error && error.message) return error.message.slice(0, 240);
  if (typeof error === 'string' && error) return error.slice(0, 240);
  return undefined;
}

export function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}
