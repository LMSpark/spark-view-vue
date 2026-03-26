import { computed } from 'vue'
import { useSparkConsume } from '../../internal'
import { FIELD_CONTEXT } from '../../internal'
import type { FieldContext } from '../../internal'

export function useResolvedFieldContext() {
  const { sparkConsume } = useSparkConsume()

  return computed<FieldContext>(() => sparkConsume(FIELD_CONTEXT) ?? 'detail')
}