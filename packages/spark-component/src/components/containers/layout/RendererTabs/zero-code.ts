/**
 * @module @spark-appworks/spark-component:components/containers/layout/RendererTabs/zero-code
 * RendererTabs 模块，属于 SPARK component container/layout-container。
 * 组件目录: containers/layout。
 * 导出 ClassModel symbol: TabsEmit, RendererTabsZeroCodeOptions（共 2 个 symbol）。
 */
import type { SparkNode } from '../../../internal'
import type { RendererTabsApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

/** Tabs Emit 的语义模型。 */
type TabsEmit = {
  (event: 'update:modelValue', value: string | number): void}

/** Renderer Tabs Zero Code Options 的调用配置。 */
type RendererTabsZeroCodeOptions = {
    /** emit 字段。 */
emit: TabsEmit
    /** current Active Name 名称。 */
currentActiveName: ValueRef<string | number | undefined>
    /** pane Configs 字段。 */
paneConfigs: ValueRef<SparkNode[]>
    /** get Pane Name 名称。 */
getPaneName: (pane: SparkNode, index: number) => string | number
    /** on Tab Change 事件回调。 */
onTabChange: ((name: string | number) => void) | undefined}

export function createRendererTabsZeroCode(options: RendererTabsZeroCodeOptions) {
  const tabsApi: RendererTabsApi = {
    getActiveTab() {
      return options.currentActiveName.value
    },
    setActiveTab(name) {
      options.currentActiveName.value = name
      options.emit('update:modelValue', name)
    },
    getPaneNames() {
      return options.paneConfigs.value.map((pane, index) => options.getPaneName(pane, index))
    },
    getPaneCount() {
      return options.paneConfigs.value.length
    },
  }

  return {
    tabsApi,
    handleModelUpdate(value: string | number) {
      options.currentActiveName.value = value
      options.emit('update:modelValue', value)
    },
    handleTabChange(value: string | number) {
      options.currentActiveName.value = value
      options.onTabChange?.(value)
    },
  }
}