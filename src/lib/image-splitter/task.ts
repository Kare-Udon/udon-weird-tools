import { imageSplitterError } from './errors.ts';

export type TaskControl = {
  signal?: AbortSignal;
  isCurrent?: () => boolean;
};

export function assertTaskActive(control?: TaskControl): void {
  if (control?.signal?.aborted) throw imageSplitterError('cancelled');
  if (control?.isCurrent && !control.isCurrent()) throw imageSplitterError('stale-task');
}

export function normalizeTaskControl(control?: TaskControl | AbortSignal): TaskControl | undefined {
  if (!control) return undefined;
  if (isAbortSignalLike(control)) {
    return { signal: control };
  }
  return control as TaskControl;
}

function isAbortSignalLike(value: TaskControl | AbortSignal): value is AbortSignal {
  return 'aborted' in value && typeof value.aborted === 'boolean' && !('signal' in value);
}
