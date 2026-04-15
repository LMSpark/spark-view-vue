/**
 * Picker 变体工厂 —— 配置驱动生成 EntityPicker 的预设包装组件。
 *
 * 用法（renderer-components.ts）：
 *   import { createPickerPreset } from './renderer-fields/createPickerPreset'
 *   Spark.register('r-user-picker', createPickerPreset({ entityName: '人员', ... }))
 *
 * 每个变体组件仅覆盖 FieldEntityPicker 的若干默认 prop，其余完全透传。
 */
import { computed, defineComponent, h, useAttrs } from 'vue'
import type { PropType } from 'vue'
import type { PageSelectableValue } from '@spark-view/spark-utils'
import type { SparkNodeChildren } from '../internal'
import type { SparkOptionValueMode } from '../shared-types'
import { emitFieldValueUpdate } from './data-components/composables/useControlledFieldChange'
import FieldEntityPicker from './data-components/FieldEntityPicker.vue'

type EntityPickerValue = PageSelectableValue | PageSelectableValue[] | string

interface PickerPresetDefaults {
  placeholder: string
  buttonText: string
  readonlyButtonText: string
  entityName: string
}

/**
 * 所有 picker 变体共享的 prop 声明。
 * 与 FieldEntityPicker 的 Props 接口一一对应，确保 v-bind 透传正确。
 */
const SHARED_PROPS = {
  /** 字段绑定名 */
  field: { type: String, default: undefined },
  /** 组件名称 */
  name: { type: String, default: undefined },
  /** 展示标签 */
  label: { type: String, default: undefined },
  /** 字段宽度 */
  width: { type: Number, default: undefined },
  /** 直接传入的值 */
  value: { type: [String, Number, Array, Boolean] as PropType<EntityPickerValue>, default: undefined },
  /** 可选项数组 */
  options: { type: Array as PropType<unknown[]>, default: undefined },
  /** 选项绑定键 */
  optionKey: { type: String, default: undefined },
  /** 选项显示字段 */
  optionLabelField: { type: String, default: undefined },
  /** 选项值字段 */
  optionValueField: { type: String, default: undefined },
  /** 占位文案 */
  placeholder: { type: String, default: undefined },
  /** 主动作按钮文案 */
  buttonText: { type: String, default: undefined },
  /** 只读模式按钮文案 */
  readonlyButtonText: { type: String, default: undefined },
  /** 是否允许清空 */
  clearable: { type: Boolean, default: true },
  /** 是否启用多选 */
  multiple: { type: Boolean, default: false },
  /** 是否支持搜索 */
  searchable: { type: Boolean, default: true },
  /** 值分隔符 */
  valueSeparator: { type: String, default: undefined },
  /** 文本分隔符 */
  textSeparator: { type: String, default: undefined },
  /** 文本储存字段 */
  textStorageField: { type: String, default: undefined },
  /** 主值持久化模式 */
  valueMode: { type: String as PropType<SparkOptionValueMode>, default: 'auto' },
  /** 实体名称 */
  entityName: { type: String, default: undefined },
  children: { type: Array as PropType<SparkNodeChildren>, default: undefined },
} as const

/**
 * 根据预设默认值创建一个 EntityPicker 变体组件。
 */
export function createPickerPreset(defaults: PickerPresetDefaults) {
  return defineComponent({
    name: `FieldEntityPicker[${defaults.entityName}]`,
    props: SHARED_PROPS,
    emits: ['update:value', 'update:modelValue'],
    setup(props, { emit }) {
      const attrs = useAttrs()
      const compatAttrs = attrs as Readonly<Record<string, unknown>>

      const passthroughAttrs = computed<Record<string, unknown>>(() => {
        const result: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(compatAttrs)) {
          if (key === 'modelValue' || key === 'separator') continue
          result[key] = value
        }
        return result
      })

      const forwardedProps = computed<Record<string, unknown>>(() => {
        const result: Record<string, unknown> = {}

        // 定义值 prop 列表（仅在 !== undefined 时透传，避免覆盖 EntityPicker 默认值）
        const conditionalKeys = [
          'label', 'width',
          'options', 'optionKey', 'optionLabelField', 'optionValueField', 'children',
        ] as const

        for (const key of conditionalKeys) {
          if (props[key] !== undefined) {
            result[key] = props[key]
          }
        }

        const compatModelValue = compatAttrs['modelValue'] as EntityPickerValue | undefined
        const resolvedValue = props['value'] ?? compatModelValue
        if (resolvedValue !== undefined) {
          result['value'] = resolvedValue
        }

        const resolvedField = props['field'] ?? props['name']
        if (resolvedField !== undefined) {
          result['field'] = resolvedField
        }

        // 带预设默认值的 prop —— 用户传值优先，否则使用 preset
        result['placeholder'] = props['placeholder'] ?? defaults.placeholder
        result['buttonText'] = props['buttonText'] ?? defaults.buttonText
        result['readonlyButtonText'] = props['readonlyButtonText'] ?? defaults.readonlyButtonText
        result['entityName'] = props['entityName'] ?? defaults.entityName

        // 始终透传的标量 prop
        result['clearable'] = props['clearable']
        result['multiple'] = props['multiple']
        result['searchable'] = props['searchable']
        const compatSeparator = compatAttrs['separator'] as string | undefined
        const resolvedValueSeparator = props['valueSeparator'] ?? compatSeparator
        if (resolvedValueSeparator !== undefined) {
          result['valueSeparator'] = resolvedValueSeparator
        }
        if (props['textSeparator'] !== undefined) {
          result['textSeparator'] = props['textSeparator']
        }
        if (props['textStorageField'] !== undefined) {
          result['textStorageField'] = props['textStorageField']
        }
        result['valueMode'] = props['valueMode']

        return result
      })

      return () => h(FieldEntityPicker, {
        type: 'r-entity-picker',
        ...passthroughAttrs.value,
        ...forwardedProps.value,
        'onUpdate:value': (value: EntityPickerValue) => emitFieldValueUpdate(emit, value),
      })
    },
  })
}
