/**
 * @module @spark-appworks/spark-component:components/containers/support/visibility-container-zero-code
 * @spark-appworks/spark-component 的 components/containers/support/visibility-container-zero-code 模块。
 * 导出 ClassModel symbol: VisibilityContainerZeroCodeOptions（共 1 个 symbol）。
 */
import type { ValueRef } from '../../shared-types.js'
import type { VisibilityContainerApi } from './base-container-api.js'

/** Visibility Container Zero Code Options 的调用配置。 */
export type VisibilityContainerZeroCodeOptions = {
    /** visible Value 字段。 */
visibleValue: ValueRef<boolean>
    /** commit Visible Value 回调。 */
commitVisibleValue: (value: boolean) => void
    /** on Open 事件回调。 */
onOpen: (() => void) | undefined
    /** on Close 事件回调。 */
onClose: (() => void) | undefined
    /** on Opened 事件回调。 */
onOpened: (() => void) | undefined
    /** on Closed 事件回调。 */
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
