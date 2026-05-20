import { useEventDefaults } from '../../../containers/support/index.js'
import type { CancellableControl } from '../../../internal'

export type FieldChangeControl = CancellableControl

export type FieldValueUpdateEmitter<TValue> =
  (event: 'update:modelValue', value: TValue) => void

export type FieldValueUpdateEmits<TValue> = {
  'update:modelValue': [value: TValue]
}

export function emitFieldValueUpdate<TValue>(
  emit: FieldValueUpdateEmitter<TValue>,
  value: TValue,
): void {
  emit('update:modelValue', value)
}

interface UseControlledFieldChangeOptions<TValue> {
  getValue: () => TValue
  emitUpdate: (value: TValue) => void
  syncValue: (value: TValue) => void
  afterDefault?: (nextValue: TValue, previousValue: TValue) => void | Promise<void>
  handlerSource?: Readonly<Record<string, unknown>>
}

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
