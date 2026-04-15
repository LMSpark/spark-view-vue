import type { RendererDrawerApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type DrawerEmit = (event: 'update:value', value: boolean) => void

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
    drawerApi,
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