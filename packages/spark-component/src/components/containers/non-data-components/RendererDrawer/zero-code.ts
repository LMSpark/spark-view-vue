import type { RendererDrawerApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type DrawerEmit = (event: 'update:modelValue', value: boolean) => void

interface RendererDrawerZeroCodeOptions {
  emit: DrawerEmit
  visibleValue: ValueRef<boolean>
  onOpen: (() => void) | undefined
  onClose: (() => void) | undefined
  onOpened: (() => void) | undefined
  onClosed: (() => void) | undefined
}

export function createRendererDrawerZeroCode(options: RendererDrawerZeroCodeOptions) {
  const drawerApi: RendererDrawerApi = {
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
    drawerApi,
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