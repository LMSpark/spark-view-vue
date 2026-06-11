/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererDialog/zero-code
 * RendererDialog 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import {
  createVisibilityContainerZeroCode,
  type VisibilityContainerZeroCodeOptions,
} from '../../support/visibility-container-zero-code.js'

export function createRendererDialogZeroCode(options: VisibilityContainerZeroCodeOptions) {
  const { api: dialogApi, ...handlers } = createVisibilityContainerZeroCode(options)
  return {
    dialogApi,
    ...handlers,
  }
}
