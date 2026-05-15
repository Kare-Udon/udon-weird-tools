import { toolLocalStorageKey } from './storage-contract';

const RECENT_ENTRY_ID = 'recent-run';

export type RecentRun = {
  slug: string;
  at: string;
  input: Record<string, unknown>;
  output: unknown;
};

export function saveRecentRun(run: RecentRun): void {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(toolLocalStorageKey(run.slug, 'data', RECENT_ENTRY_ID), JSON.stringify(run));
}

export function readRecentRun(slug: string): RecentRun | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(toolLocalStorageKey(slug, 'data', RECENT_ENTRY_ID));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RecentRun;
  } catch {
    return null;
  }
}
