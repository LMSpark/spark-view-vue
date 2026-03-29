import type { SparkNode } from '../../../internal'
import type { RendererCollapseApi } from './types'
import type { ValueRef } from '../../../shared-types.js'

type CollapseValue = string | number | Array<string | number>

type CollapseEmit = (event: 'update:modelValue', value: CollapseValue) => void

interface RendererCollapseZeroCodeOptions {
  emit: CollapseEmit
  currentModelValue: ValueRef<CollapseValue | undefined>
  itemConfigs: ValueRef<SparkNode[]>
  getItemName: (item: SparkNode, index: number) => string | number
  onChange: ((value: CollapseValue) => void) | undefined
}

export function createRendererCollapseZeroCode(options: RendererCollapseZeroCodeOptions) {
  const collapseApi: RendererCollapseApi = {
    getExpandedItems() {
      return options.currentModelValue.value
    },
    setExpandedItems(value) {
      options.currentModelValue.value = value
      options.emit('update:modelValue', value)
    },
    expandAll() {
      const allNames = options.itemConfigs.value.map((item, index) => options.getItemName(item, index))
      options.currentModelValue.value = allNames
      options.emit('update:modelValue', allNames)
    },
    collapseAll() {
      options.currentModelValue.value = []
      options.emit('update:modelValue', [])
    },
    toggleItem(name) {
      const current = Array.isArray(options.currentModelValue.value) ? options.currentModelValue.value : []
      const next = current.includes(name)
        ? current.filter(item => item !== name)
        : [...current, name]
      options.currentModelValue.value = next
      options.emit('update:modelValue', next)
    },
    isItemExpanded(name) {
      const current = options.currentModelValue.value
      if (Array.isArray(current)) return current.includes(name)
      return current === name
    },
  }

  return {
    collapseApi,
    handleModelUpdate(value: CollapseValue) {
      options.currentModelValue.value = value
      options.emit('update:modelValue', value)
    },
    handleChange(value: CollapseValue) {
      options.currentModelValue.value = value
      options.onChange?.(value)
    },
  }
}