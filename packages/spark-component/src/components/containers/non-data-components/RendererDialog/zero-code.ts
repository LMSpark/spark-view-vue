import type { RendererDialogApi } from './types'

interface ValueRef<T> {
  value: T
}

type DialogEmit = (event: 'update:modelValue', value: boolean) => void

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
      options.emit('update:modelValue', true)
    },
    close() {
      options.emit('update:modelValue', false)
    },
    isVisible() {
      return options.visibleValue.value
    },
    toggle() {
      options.emit('update:modelValue', !options.visibleValue.value)
    },
  }

  return {
    dialogApi,
    handleModelUpdate(value: boolean) {
      options.emit('update:modelValue', value)
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