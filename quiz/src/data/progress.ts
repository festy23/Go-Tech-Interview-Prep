export interface BlockProgress {
  blockId: string;
  score: number;
  total: number;
  completedAt: string;
}

export type ProgressMap = Record<string, BlockProgress>;

const STORAGE_KEY = "go_quiz_progress_v1";

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function saveBlockProgress(p: BlockProgress): void {
  try {
    const map = loadProgress();
    const existing = map[p.blockId];
    if (!existing || p.score > existing.score) {
      map[p.blockId] = p;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function getProgressPct(progress: ProgressMap, blockId: string): number {
  const entry = progress[blockId];
  if (!entry || entry.total === 0) return 0;
  return Math.round((entry.score / entry.total) * 100);
}
