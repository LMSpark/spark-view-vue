import type { SparkNode } from '../../../internal'
import type { RendererCollapseApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type CollapseValue = string | number | Array<string | number>

type RendererCollapseZeroCodeOptions = {
  currentValue: ValueRef<CollapseValue | undefined>
  commitCollapseValue: (value: CollapseValue, options?: { emit?: boolean }) => void
  itemConfigs: ValueRef<SparkNode[]>
  getItemName: (item: SparkNode, index: number) => string | number
  onChange: ((value: CollapseValue) => void) | undefined
}

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
    handleModelUpdate(value: CollapseValue) {
      options.commitCollapseValue(value)
    },
    handleChange(value: CollapseValue) {
      options.commitCollapseValue(value, { emit: false })
      options.onChange?.(value)
    },
  }
}