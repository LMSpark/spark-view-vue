import { shallowReactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { IDataSource } from '@spark-view/spark-data'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface UseContainerContextDataOptions {
  source: ComputedRef<IDataSource | null>
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerContextData(options: UseContainerContextDataOptions) {
  // 为 form/detail 一类字段组件维护 currentRow 的响应式镜像。
  // shallowReactive 即可：字段组件只通过 contextData[fieldName] 读写顶层 key，
  // 无需 reactive 的深层代理（尤其当 row 含嵌套对象时深代理开销显著）。
  const contextData = shallowReactive<Record<string, unknown>>({})

  // 差量同步 currentRow → contextData，保持对象引用不变。
  // 只清理新行不存在的 stale key，只写入实际变化的值，
  // 避免同 schema 行切换时 2N 次响应式触发（降为 K，K = 实际差异字段数）。
  let _prevRow: unknown = Symbol('initial')

  watch(
    () => options.source.value?.currentRow,
    (row) => {
      // 同一行引用切换（如响应式 proxy 重触发）→ 跳过整个 diff
      if (row === _prevRow) return
      _prevRow = row

      const incoming = row ?? {}
      const incomingKeys = new Set(Object.keys(incoming))

      // 仅清理新行中不存在的 key（同 schema 行切换时通常为 0）
      for (const key of Object.keys(contextData)) {
        if (!incomingKeys.has(key)) {
          contextData[key] = undefined
        }
      }

      // 仅写入实际变化的值
      for (const key of incomingKeys) {
        if (contextData[key] !== incoming[key]) {
          contextData[key] = incoming[key]
        }
      }
    },
    { immediate: true },
  )

  return {
    contextData,
  }
}