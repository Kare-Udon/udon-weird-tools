const RECENT_PREFIX = 'weird-tools:last-run:';

export type RecentRun = {
  slug: string;
  at: string;
  input: Record<string, unknown>;
  output: unknown;
};

export function saveRecentRun(run: RecentRun): void {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(`${RECENT_PREFIX}${run.slug}`, JSON.stringify(run));
}

export function readRecentRun(slug: string): RecentRun | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(`${RECENT_PREFIX}${slug}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RecentRun;
  } catch {
    return null;
  }
}
