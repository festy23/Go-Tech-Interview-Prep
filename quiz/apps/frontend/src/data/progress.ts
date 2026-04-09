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

export function clearProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // silently ignore
  }
}

export function sessionProgressToMap(byBlock: Record<string, { score: number; total: number; completedAt: string }>): ProgressMap {
  const map: ProgressMap = {}
  for (const [blockId, entry] of Object.entries(byBlock)) {
    map[blockId] = {
      blockId,
      score: entry.score,
      total: entry.total,
      completedAt: entry.completedAt,
    }
  }
  return map
}

export function getProgressPct(progress: ProgressMap, blockId: string): number {
  const entry = progress[blockId];
  if (!entry || entry.total === 0) return 0;
  return Math.round((entry.score / entry.total) * 100);
}

/** A sub-quiz counts as "completed" when the user scores at least this fraction correct. */
const COMPLETION_THRESHOLD = 0.6;

/**
 * Returns sub-quiz completion counts for a parent block.
 * When `childBlockIds` is empty, returns `{ completed: 0, total: 0 }` —
 * callers should treat `total === 0` as "not available yet".
 */
export function getSubQuizProgress(
  childBlockIds: string[],
  progress: ProgressMap,
): { completed: number; total: number } {
  const completed = childBlockIds.filter((id) => {
    const e = progress[id];
    return e && e.total > 0 && e.score / e.total >= COMPLETION_THRESHOLD;
  }).length;
  return { completed, total: childBlockIds.length };
}
