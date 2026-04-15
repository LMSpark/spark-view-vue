import type { SparkNode } from '../../../internal'
import type { RendererCollapseApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type CollapseValue = string | number | Array<string | number>

type CollapseEmit = (event: 'update:value', value: CollapseValue) => void

interface RendererCollapseZeroCodeOptions {
  emit: CollapseEmit
  currentValue: ValueRef<CollapseValue | undefined>
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
      options.currentValue.value = value
      options.emit('update:value', value)
    },
    expandAll() {
      const allNames = options.itemConfigs.value.map((item, index) => options.getItemName(item, index))
      options.currentValue.value = allNames
      options.emit('update:value', allNames)
    },
    collapseAll() {
      options.currentValue.value = []
      options.emit('update:value', [])
    },
    toggleItem(name) {
      const current = Array.isArray(options.currentValue.value) ? options.currentValue.value : []
      const next = current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]
      options.currentValue.value = next
      options.emit('update:value', next)
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
      options.currentValue.value = value
      options.emit('update:value', value)
    },
    handleChange(value: CollapseValue) {
      options.currentValue.value = value
      options.onChange?.(value)
    },
  }
}