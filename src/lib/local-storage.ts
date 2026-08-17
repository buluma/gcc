const LS = typeof window !== "undefined" ? window.localStorage : null;

export function loadNumberSet(key: string): Set<number> {
  if (!LS) return new Set();
  try {
    const raw = LS.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is number => typeof v === "number"));
  } catch {
    return new Set();
  }
}

export function saveNumberSet(key: string, ids: Set<number>, limit?: number) {
  if (!LS) return;
  try {
    const arr = [...ids];
    LS.setItem(key, JSON.stringify(limit != null ? arr.slice(-limit) : arr));
  } catch {
    // Best-effort; failing to persist only affects the next reload.
  }
}
