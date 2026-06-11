/**
 * @module @spark-appworks/spark-component:components/containers/zones/RendererEditor.types
 * RendererEditor 模块，属于 SPARK component container/zone-container。
 * 组件目录: containers/zones。
 * 导出 ClassModel symbol: REditorProps（共 1 个 symbol）。
 */
import type { SparkNode } from '../../internal'
import type { SparkNodeProps } from '../../shared-types'
import type { ToolbarPosition } from '../runtime/container-ui'

/**
 * `RendererEditor` 运行时公开属性。
 */
export type REditorProps = SparkNodeProps & {
  /** 组件类型固定为 `r-editor`。 */
    type?: 'r-editor'
    /** 节点标识。 */
    id?: string
    /** 编辑区内容节点列表。 */
    children?: SparkNode[]
    /** 编辑区停靠位置 */
    position?: ToolbarPosition
    /** 编辑区宽度 */
    width?: string | number
    /** 编辑区附加 class */
    class?: string}
