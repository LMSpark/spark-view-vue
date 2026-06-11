/**
 * @module @spark-appworks/spark-component:components/fields/data-components/composables/useControlledFieldChange
 * @spark-appworks/spark-component:components/fields/data-components/composables/useControlledFieldChange 模块，属于 SPARK component field-level/data-field。
 * 组件目录: fields/data-components。
 * 导出 ClassModel symbol: FieldValueUpdateEmitter, FieldValueUpdateEmits, UseControlledFieldChangeOptions（共 3 个 symbol）。
 */
import { useEventDefaults } from '../../../containers/support/index.js'

export type { CancellableControl as FieldChangeControl } from '../../../internal'

/** Field Value Update Emitter 的语义模型。 */
export type FieldValueUpdateEmitter<TValue> = {
  (event: 'update:modelValue', value: TValue): void}

/** Field Value Update Emits 的语义模型。 */
export type FieldValueUpdateEmits<TValue> = {
    /** update:model Value 字段。 */
'update:modelValue': [value: TValue]}

export function emitFieldValueUpdate<TValue>(
  emit: FieldValueUpdateEmitter<TValue>,
  value: TValue,
): void {
  emit('update:modelValue', value)
}

/** Use Controlled Field Change Options 的调用配置。 */
type UseControlledFieldChangeOptions<TValue> = {
    /** get Value 回调。 */
getValue: () => TValue
    /** emit Update 回调。 */
emitUpdate: (value: TValue) => void
    /** sync Value 回调。 */
syncValue: (value: TValue) => void
    /** after Default 回调。 */
afterDefault?: (nextValue: TValue, previousValue: TValue) => void | Promise<void>
    /** handler Source 字段。 */
handlerSource?: Readonly<Record<string, unknown>>}

/**
 * 字段变更的统一 A/B/C 包装层。
 *
 * 对外保留字段语义（nextValue / previousValue / control），
 * 内部统一委托给 useEventDefaults，避免各字段组件重复拼装 change 分发逻辑。
 */
export function useControlledFieldChange<TValue>(options: UseControlledFieldChangeOptions<TValue>) {
  const { dispatch } = useEventDefaults<{ change: [nextValue: TValue, previousValue: TValue] }>({
    change: {
      systemDefault: async (nextValue, previousValue) => {
        options.emitUpdate(nextValue)
        options.syncValue(nextValue)
        await options.afterDefault?.(nextValue, previousValue)
      },
    },
  }, options.handlerSource ?? {})

  async function handleControlledChange(nextValue: TValue): Promise<void> {
    await dispatch('change', nextValue, options.getValue())
  }

  return {
    handleControlledChange,
  }
}
