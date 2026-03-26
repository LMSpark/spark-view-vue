import { computed } from 'vue'
import { useSparkConsume } from '../internal'
import { FIELD_CONTEXT } from '../internal'
import type { FieldContext } from '../internal'

/**
 * 通过 SPARK 能力体系解析字段渲染上下文。
 *
 * 容器组件（r-table / r-form / r-detail / r-tree / r-list）通过
 * sparkProvide(FIELD_CONTEXT, context) 声明渲染语义，
 * 字段组件通过本函数 sparkConsume 沿能力链向上查找。
 */
export function useResolvedFieldContext() {
  const { sparkConsume } = useSparkConsume()

  return computed<FieldContext>(() => sparkConsume(FIELD_CONTEXT) ?? 'detail')
}