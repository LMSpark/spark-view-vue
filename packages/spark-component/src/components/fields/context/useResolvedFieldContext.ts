import { computed } from 'vue'
import { useSparkConsume } from '../../internal'

/**
 * 字段渲染模式 — 与容器 type 名解耦的语义标签。
 *
 * 约定值：'table' | 'form' | 'tree' | 'detail'。
 * 容器通过 `host.setHost({ fieldMode: '...' })` 声明，字段通过 `nearestHost().fieldMode` 读取。
 * 新容器只需一行 setHost，字段侧零改动。
 */
export type FieldRenderMode = string

export function useResolvedFieldContext() {
  const { host } = useSparkConsume()
  return computed<FieldRenderMode>(() => host.nearestHost()?.fieldMode ?? 'detail')
}