import type { RendererDialogApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type DialogEmit = (event: 'update:value', value: boolean) => void

interface RendererDialogZeroCodeOptions {
  emit: DialogEmit
  visibleValue: ValueRef<boolean>
  onOpen: (() => void) | undefined
  onClose: (() => void) | undefined
  onOpened: (() => void) | undefined
  onClosed: (() => void) | undefined
}

export function createRendererDialogZeroCode(options: RendererDialogZeroCodeOptions) {
  const dialogApi: RendererDialogApi = {
    open() {
      options.emit('update:value', true)
    },
    close() {
      options.emit('update:value', false)
    },
    isVisible() {
      return options.visibleValue.value
    },
    toggle() {
      options.emit('update:value', !options.visibleValue.value)
    },
  }

  return {
    dialogApi,
    handleModelUpdate(value: boolean) {
      options.emit('update:value', value)
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