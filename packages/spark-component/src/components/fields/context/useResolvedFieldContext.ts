import { computed } from 'vue'
import { useSparkConsume } from '../../internal'

export type FieldRenderMode = string

/**
 * 字段渲染模式 — 与容器 type 名解耦的语义标签。
 *
 * 约定值：'table' | 'form' | 'tree' | 'detail'。
 * 容器通过 Host 声明 `fieldMode`，字段沿宿主链读取最近值。
 */
export function useResolvedFieldContext() {
  const { host } = useSparkConsume()
  return computed<FieldRenderMode>(() => {
    return host.nearestHost()?.fieldMode ?? 'detail'
  })
}