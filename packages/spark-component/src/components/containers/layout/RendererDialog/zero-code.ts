import type { RendererDialogApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type RendererDialogZeroCodeOptions = {
  visibleValue: ValueRef<boolean>
  commitVisibleValue: (value: boolean) => void
  onOpen: (() => void) | undefined
  onClose: (() => void) | undefined
  onOpened: (() => void) | undefined
  onClosed: (() => void) | undefined}

export function createRendererDialogZeroCode(options: RendererDialogZeroCodeOptions) {
  const dialogApi: RendererDialogApi = {
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
    dialogApi,
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