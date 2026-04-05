export interface PageDataHistoryCursor {
  historyCount: number
  activeIndex: number
  baseIndex: number
  currentText: string
  draftText: string | null
}

export type PageDataHistoryForwardTarget =
  | { kind: 'none' }
  | { kind: 'draft' }
  | { kind: 'history'; index: number }

export function canNavigatePageDataHistoryBack(cursor: PageDataHistoryCursor): boolean {
  return getPageDataHistoryBackTargetIndex(cursor) >= 0
}

export function canNavigatePageDataHistoryForward(cursor: PageDataHistoryCursor): boolean {
  const target = getPageDataHistoryForwardTarget(cursor)
  return target.kind !== 'none'
}

export function getPageDataHistoryBackTargetIndex(cursor: PageDataHistoryCursor): number {
  if (cursor.historyCount === 0) {
    return -1
  }

  if (cursor.activeIndex === -1) {
    if (cursor.baseIndex >= 0 && cursor.baseIndex < cursor.historyCount) {
      return cursor.baseIndex
    }
    return 0
  }

  if (cursor.activeIndex >= cursor.historyCount - 1) {
    return -1
  }

  return cursor.activeIndex + 1
}

export function getPageDataHistoryForwardTarget(cursor: PageDataHistoryCursor): PageDataHistoryForwardTarget {
  if (cursor.historyCount === 0 || cursor.activeIndex === -1) {
    return { kind: 'none' }
  }

  if (cursor.draftText !== null && cursor.baseIndex >= 0) {
    if (cursor.activeIndex > cursor.baseIndex) {
      return { kind: 'history', index: cursor.activeIndex - 1 }
    }

    if (cursor.activeIndex === cursor.baseIndex) {
      return { kind: 'draft' }
    }

    return { kind: 'none' }
  }

  if (cursor.activeIndex > 0) {
    return { kind: 'history', index: cursor.activeIndex - 1 }
  }

  return { kind: 'none' }
}

export function getDraftTextForHistoryRestore(cursor: PageDataHistoryCursor): string | null {
  if (cursor.activeIndex === -1) {
    return cursor.draftText ?? cursor.currentText
  }
  return cursor.draftText
}