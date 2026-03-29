import { useAttrs } from 'vue'
import { useEventDefaults } from '../../../containers/support/index.js'
import type { CancellableControl } from '../../../internal'

export type FieldChangeControl = CancellableControl

interface UseControlledFieldChangeOptions<TValue> {
  getValue: () => TValue
  emitUpdate: (value: TValue) => void
  syncValue: (value: TValue) => void
}

/**
 * 字段变更的统一 A/B/C 包装层。
 *
 * 对外保留字段语义（nextValue / previousValue / control），
 * 内部统一委托给 useEventDefaults，避免各字段组件重复拼装 change 分发逻辑。
 */
export function useControlledFieldChange<TValue>(options: UseControlledFieldChangeOptions<TValue>) {
  const attrs = useAttrs()
  const { dispatch } = useEventDefaults({
    change: {
      systemDefault: nextValue => {
        options.emitUpdate(nextValue as TValue)
        options.syncValue(nextValue as TValue)
      },
    },
  }, attrs as Readonly<Record<string, unknown>>)

  async function handleControlledChange(nextValue: TValue): Promise<void> {
    await dispatch('change', nextValue, options.getValue())
  }

  return {
    handleControlledChange,
  }
}