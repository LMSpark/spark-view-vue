/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererCollapse/zero-code
 * RendererCollapse 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RendererCollapseZeroCodeOptions（共 1 个 symbol）。
 */
import type { SparkNode } from '../../../internal'
import type { RendererCollapseApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Renderer Collapse Zero Code Options 的调用配置。 */
type RendererCollapseZeroCodeOptions = {
    /** current Value 字段。 */
currentValue: ValueRef<string | number | Array<string | number> | undefined>
    /** commit Collapse Value 回调。 */
commitCollapseValue: (value: string | number | Array<string | number>, options?: { emit?: boolean }) => void
    /** item Configs 字段。 */
itemConfigs: ValueRef<SparkNode[]>
    /** get Item Name 名称。 */
getItemName: (item: SparkNode, index: number) => string | number
    /** on Change 事件回调。 */
onChange: ((value: string | number | Array<string | number>) => void) | undefined}

export function createRendererCollapseZeroCode(options: RendererCollapseZeroCodeOptions) {
  const collapseApi: RendererCollapseApi = {
    getExpandedItems() {
      return options.currentValue.value
    },
    setExpandedItems(value) {
      options.commitCollapseValue(value)
    },
    expandAll() {
      const allNames = options.itemConfigs.value.map((item, index) => options.getItemName(item, index))
      options.commitCollapseValue(allNames)
    },
    collapseAll() {
      options.commitCollapseValue([])
    },
    toggleItem(name) {
      const current = Array.isArray(options.currentValue.value) ? options.currentValue.value : []
      const next = current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]
      options.commitCollapseValue(next)
    },
    isItemExpanded(name) {
      const current = options.currentValue.value
      if (Array.isArray(current)) return current.includes(name)
      return current === name
    },
  }

  return {
    collapseApi,
    handleModelUpdate(value: string | number | Array<string | number>) {
      options.commitCollapseValue(value)
    },
    handleChange(value: string | number | Array<string | number>) {
      options.commitCollapseValue(value, { emit: false })
      options.onChange?.(value)
    },
  }
}