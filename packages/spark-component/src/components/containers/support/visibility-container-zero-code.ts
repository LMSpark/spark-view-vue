import type { ValueRef } from '../../shared-types.js'
import type { VisibilityContainerApi } from './base-container-api.js'

export type VisibilityContainerZeroCodeOptions = {
  visibleValue: ValueRef<boolean>
  commitVisibleValue: (value: boolean) => void
  onOpen: (() => void) | undefined
  onClose: (() => void) | undefined
  onOpened: (() => void) | undefined
  onClosed: (() => void) | undefined
}

export function createVisibilityContainerZeroCode(options: VisibilityContainerZeroCodeOptions) {
  const api: VisibilityContainerApi = {
    open() {
      options.commitVisibleValue(true)
    },
    close() {
      options.commitVisibleValue(false)
    },
    isVisible() {
      return options.visibleValue.value
    },
    toggle() {
      options.commitVisibleValue(!options.visibleValue.value)
    },
  }

  return {
    api,
    handleModelUpdate(value: boolean) {
      options.commitVisibleValue(value)
    },
    handleOpen() {
      options.onOpen?.()
    },
    handleClose() {
      options.onClose?.()
    },
    handleOpened() {
      options.onOpened?.()
    },
    handleClosed() {
      options.onClosed?.()
    },
  }
}
