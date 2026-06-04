import { isDataRow, type DataRow, type DataView } from '@spark-appworks/spark-data'
import { createContainerCrudContext } from '../zero-code-shared.js'
import type { ValueRef } from '../../../shared-types.js'
import type { RendererVirtualCardApi } from './types.js'

type RendererVirtualCardZeroCodeOptions = {
  props: Readonly<Record<string, unknown>>
  resolvedView: ValueRef<DataView | null>
  rows: ValueRef<readonly DataRow[]>
  cachedPages: ValueRef<readonly number[]>
  pendingPages: ValueRef<readonly number[]>
  visiblePages: ValueRef<readonly number[]>
  currentPage: ValueRef<number>
  totalPages: ValueRef<number>
  progressText: ValueRef<string>
  loadPolicyText: ValueRef<string>
  wheelStatusText: ValueRef<string>
  scrollToPage: (page: number) => Promise<void>
  clearCache: () => void
}

export function createRendererVirtualCardZeroCode(options: RendererVirtualCardZeroCodeOptions) {
  const {
    props,
    resolvedView,
    rows,
    cachedPages,
    pendingPages,
    visiblePages,
    currentPage,
    totalPages,
    progressText,
    loadPolicyText,
    wheelStatusText,
    scrollToPage,
    clearCache,
  } = options

  const { dispatch, baseMethods } = createContainerCrudContext({
    props,
    resolvedView,
    eventDefaults: {
      'item-click': {
        systemDefault: (row: unknown) => {
          if (isDataRow(row)) {
            resolvedView.value?.setCurrentRow(row)
          }
        },
      },
      'page-change': {},
    },
  })

  const virtualCardApi: RendererVirtualCardApi = {
    ...baseMethods,
    getRows() {
      return [...rows.value]
    },
    getCachedPages() {
      return [...cachedPages.value]
    },
    getPendingPages() {
      return [...pendingPages.value]
    },
    getVisiblePages() {
      return [...visiblePages.value]
    },
    getCurrentPage() {
      return currentPage.value
    },
    getTotalPages() {
      return totalPages.value
    },
    getScrollProgress() {
      return progressText.value
    },
    getLoadPolicyText() {
      return loadPolicyText.value
    },
    getWheelStatusText() {
      return wheelStatusText.value
    },
    async scrollToPage(page) {
      await scrollToPage(page)
    },
    clearCache,
  }

  return {
    dispatch,
    virtualCardApi,
  }
}
