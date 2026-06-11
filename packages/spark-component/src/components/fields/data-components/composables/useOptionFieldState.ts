/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useOptionFieldState
 * @spark-appworks/spark-component:components/fields/data-components/composables/useOptionFieldState 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: OptionalWithUndefined, OptionFieldStateProps, UseOptionFieldStateOptions（共 3 个 symbol）。
 */
import type { SparkOptionFieldProps } from '../../../shared-types.js'
import { useFieldControlState } from './useFieldControlState'
import { useOptionField } from '../../options/useFieldOptions'
import type { useFieldOptions } from '../../options/useFieldOptions'

/** 将选中 props 的每个字段都允许显式传 undefined。 */
type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined
}

/** 选项类字段组件共享的受控值和选项 props。 */
export type OptionFieldStateProps<TValue> = OptionalWithUndefined<Omit<SparkOptionFieldProps<TValue>, 'modelValue' | 'value' | 'options'>> & {
  /** Vue v-model 当前值。 */
  modelValue?: TValue | undefined
  /** 兼容非 v-model 场景的当前值。 */
  value?: TValue | undefined
  /** 原始选项集合，后续由 useFieldOptions 归一化。 */
  options?: unknown[] | undefined
}

/** 创建选项类字段运行态所需的输入。 */
type UseOptionFieldStateOptions<TValue> = {
  /** 选项字段组件 props。 */
  props: OptionFieldStateProps<TValue>
  /** 字段组件类型，用于字段上下文注册。 */
  fieldType: string
  /** 当前值缺失或无效时使用的默认值。 */
  fallbackValue: TValue
  /** 向 Vue v-model/update 事件发出新值。 */
  emitUpdate: (value: TValue) => void
  /** 将未知原始值转换成字段组件的值类型。 */
  coerce: (rawValue: unknown) => TValue
  /** 自定义当前值展示文本。 */
  formatDisplay?: (value: unknown, helpers: ReturnType<typeof useFieldOptions>) => string
}

export function useOptionFieldState<TValue>(options: UseOptionFieldStateOptions<TValue>) {
  const optionResult = useOptionField<TValue>({
    props: options.props,
    type: options.fieldType,
    fallbackValue: options.fallbackValue,
    coerce: options.coerce,
    ...(options.formatDisplay !== undefined ? { formatDisplay: options.formatDisplay } : {}),
  })

  const { fieldCtx, handleControlledChange } = useFieldControlState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    state: optionResult,
    emitUpdate: value => options.emitUpdate(value),
  })

  function syncTextStorage(value: TValue): void {
    const storageField = options.props.textStorageField?.trim()
    if (!storageField || optionResult.contextData === null) return

    const labels = optionResult.findOptionLabels(value)
    optionResult.contextData[storageField] = labels.length > 1
      ? labels.join(options.props.textSeparator ?? ', ')
      : (labels[0] ?? '')
  }

  async function handleOptionFieldChange(value: TValue): Promise<void> {
    await handleControlledChange(value)
    syncTextStorage(value)
  }

  return {
    optionResult,
    fieldCtx,
    handleControlledChange: handleOptionFieldChange,
  }
}
