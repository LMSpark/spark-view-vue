/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useChoiceFieldState
 * @spark-appworks/spark-component:components/fields/data-components/composables/useChoiceFieldState 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: UseChoiceFieldStateOptions（共 1 个 symbol）。
 */
import { useOptionFieldState } from './useOptionFieldState'
import type { OptionFieldStateProps } from './useOptionFieldState'

/** Use Choice Field State Options 的调用配置。 */
type UseChoiceFieldStateOptions<TValue> = {
    /** 组件属性集合。 */
props: OptionFieldStateProps<TValue>
    /** field Type 字段。 */
fieldType: string
    /** fallback Value 字段。 */
fallbackValue: TValue
    /** emit Update 回调。 */
emitUpdate: (value: TValue) => void
    /** coerce 回调。 */
coerce: (rawValue: unknown) => TValue}

export function useChoiceFieldState<TValue>(
  options: UseChoiceFieldStateOptions<TValue>,
) {
  const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<TValue>({
    props: options.props,
    fieldType: options.fieldType,
    fallbackValue: options.fallbackValue,
    emitUpdate: value => options.emitUpdate(value),
    coerce: options.coerce,
  })

  return {
    fieldOptions: optionResult.options,
    fieldValue: optionResult.fieldValue,
    isCurrentFieldEditable: optionResult.isCurrentFieldEditable,
    fieldCtx,
    handleControlledChange,
  }
}
