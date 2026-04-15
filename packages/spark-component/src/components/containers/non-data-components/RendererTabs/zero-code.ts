import type { SparkNode } from '../../../internal'
import type { RendererTabsApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type TabsEmit = (event: 'update:value', value: string | number) => void

interface RendererTabsZeroCodeOptions {
  emit: TabsEmit
  currentActiveName: ValueRef<string | number | undefined>
  paneConfigs: ValueRef<SparkNode[]>
  getPaneName: (pane: SparkNode, index: number) => string | number
  onTabChange: ((name: string | number) => void) | undefined
}

export function createRendererTabsZeroCode(options: RendererTabsZeroCodeOptions) {
  const tabsApi: RendererTabsApi = {
    getActiveTab() {
      return options.currentActiveName.value
    },
    setActiveTab(name) {
      options.currentActiveName.value = name
      options.emit('update:value', name)
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
      options.emit('update:value', value)
    },
    handleTabChange(value: string | number) {
      options.currentActiveName.value = value
      options.onTabChange?.(value)
    },
  }
}