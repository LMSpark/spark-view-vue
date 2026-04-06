/**
 * Text file history — localStorage backing store
 *
 * Stores text file snapshots in localStorage, keyed by pageId + filename.
 * The in-memory reactive arrays in useDevState serve as a cache;
 * every mutation writes through to localStorage.
 */

const TEXT_HISTORY_PREFIX = 'spark:text-history'

function buildKey(pageId: string, filename: string): string {
  return `${TEXT_HISTORY_PREFIX}:${pageId}:${filename}`
}

export function loadTextHistory(pageId: string, filename: string): string[] {
  try {
    const raw = localStorage.getItem(buildKey(pageId, filename))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is string => typeof e === 'string')
  } catch {
    return []
  }
}

export function saveTextHistory(pageId: string, filename: string, entries: string[]): void {
  const key = buildKey(pageId, filename)
  if (entries.length === 0) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(entries))
}

export function clearTextHistoryStorage(pageId: string, filename: string): void {
  localStorage.removeItem(buildKey(pageId, filename))
}
