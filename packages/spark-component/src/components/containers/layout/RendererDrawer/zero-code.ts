import type { RendererDrawerApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type RendererDrawerZeroCodeOptions = {
  visibleValue: ValueRef<boolean>
  commitVisibleValue: (value: boolean) => void
  onOpen: (() => void) | undefined
  onClose: (() => void) | undefined
  onOpened: (() => void) | undefined
  onClosed: (() => void) | undefined
}

export function createRendererDrawerZeroCode(options: RendererDrawerZeroCodeOptions) {
  const drawerApi: RendererDrawerApi = {
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
    drawerApi,
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