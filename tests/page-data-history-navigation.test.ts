import { describe, expect, it } from 'vitest'

import {
  canNavigatePageDataHistoryBack,
  canNavigatePageDataHistoryForward,
  getDraftTextForHistoryRestore,
  getPageDataHistoryBackTargetIndex,
  getPageDataHistoryForwardTarget,
} from '../src/views/app/dev-system/composables/pageDataHistoryNavigation'

describe('pageDataHistoryNavigation', () => {
  it('should allow backing from an unsaved draft to the newest saved snapshot', () => {
    const cursor = {
      historyCount: 3,
      activeIndex: -1,
      baseIndex: 0,
      currentText: '{"dataset":{"dataSetName":"Draft"}}',
      draftText: null,
    }

    expect(canNavigatePageDataHistoryBack(cursor)).toBe(true)
    expect(getPageDataHistoryBackTargetIndex(cursor)).toBe(0)
  })

  it('should preserve the current draft when restoring a history version from draft state', () => {
    const cursor = {
      historyCount: 4,
      activeIndex: -1,
      baseIndex: 0,
      currentText: '{"dataset":{"dataSetName":"CurrentDraft"}}',
      draftText: null,
    }

    expect(getDraftTextForHistoryRestore(cursor)).toBe(cursor.currentText)
  })

  it('should preserve an existing draft when restoring from a saved history version', () => {
    const cursor = {
      historyCount: 4,
      activeIndex: 2,
      baseIndex: 0,
      currentText: '{"dataset":{"dataSetName":"HistoryV2"}}',
      draftText: '{"dataset":{"dataSetName":"DraftAfterBack"}}',
    }

    expect(getDraftTextForHistoryRestore(cursor)).toBe(cursor.draftText)
  })

  it('should move forward to draft only from the newest saved snapshot', () => {
    const cursor = {
      historyCount: 3,
      activeIndex: 0,
      baseIndex: 0,
      currentText: '{"dataset":{"dataSetName":"SavedLatest"}}',
      draftText: '{"dataset":{"dataSetName":"UnsavedDraft"}}',
    }

    expect(canNavigatePageDataHistoryForward(cursor)).toBe(true)
    expect(getPageDataHistoryForwardTarget(cursor)).toEqual({ kind: 'draft' })
  })

  it('should move forward to the next newer history snapshot before returning to draft', () => {
    const cursor = {
      historyCount: 3,
      activeIndex: 2,
      baseIndex: 0,
      currentText: '{"dataset":{"dataSetName":"SavedOldest"}}',
      draftText: '{"dataset":{"dataSetName":"UnsavedDraft"}}',
    }

    expect(canNavigatePageDataHistoryForward(cursor)).toBe(true)
    expect(getPageDataHistoryForwardTarget(cursor)).toEqual({ kind: 'history', index: 1 })
  })

  it('should restore the edited base snapshot before returning to draft when branching from an older snapshot', () => {
    const draftCursor = {
      historyCount: 4,
      activeIndex: -1,
      baseIndex: 2,
      currentText: '{"dataset":{"dataSetName":"EditedFromOlder"}}',
      draftText: null,
    }

    expect(canNavigatePageDataHistoryBack(draftCursor)).toBe(true)
    expect(getPageDataHistoryBackTargetIndex(draftCursor)).toBe(2)

    const olderSnapshotCursor = {
      historyCount: 4,
      activeIndex: 3,
      baseIndex: 2,
      currentText: '{"dataset":{"dataSetName":"Oldest"}}',
      draftText: '{"dataset":{"dataSetName":"EditedFromOlder"}}',
    }

    expect(canNavigatePageDataHistoryForward(olderSnapshotCursor)).toBe(true)
    expect(getPageDataHistoryForwardTarget(olderSnapshotCursor)).toEqual({ kind: 'history', index: 2 })
  })
})