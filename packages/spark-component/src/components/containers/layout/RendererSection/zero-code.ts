/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererSection/zero-code
 * RendererSection 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: RendererSectionZeroCodeOptions（共 1 个 symbol）。
 */
import type { RendererSectionApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Renderer Section Zero Code Options 的调用配置。 */
type RendererSectionZeroCodeOptions = {
    /** collapsed 字段。 */
collapsed: ValueRef<boolean>
    /** collapsible 字段。 */
collapsible: ValueRef<boolean>}

export function createRendererSectionZeroCode(options: RendererSectionZeroCodeOptions) {
  function toggleCollapsed(): void {
    if (!options.collapsible.value) return
    options.collapsed.value = !options.collapsed.value
  }

  const sectionApi: RendererSectionApi = {
    isCollapsed() {
      return options.collapsed.value
    },
    setCollapsed(value) {
      options.collapsed.value = value
    },
    toggle() {
      options.collapsed.value = !options.collapsed.value
    },
  }

  return {
    sectionApi,
    handleHeaderClick: toggleCollapsed,
    toggleCollapsed,
  }
}