import { computed, reactive, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { IDataSource, IModelPermission } from '@spark-view/spark-data'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface UseContainerContextDataOptions {
  source: ComputedRef<IDataSource | null>
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerContextData(options: UseContainerContextDataOptions) {
  // 为 form/detail 一类字段组件维护 currentRow 的响应式镜像。
  const contextData = reactive<Record<string, unknown>>({})

  // 通过原地清空再写入，尽量保持 contextData 这个对象引用不变。
  watch(
    () => options.source.value?.currentRow,
    (row) => {
      for (const key of Object.keys(contextData)) {
        contextData[key] = undefined
      }
      if (row) Object.assign(contextData, row)
    },
    { immediate: true },
  )

  // 模型级权限单独暴露，供容器动作区和插槽作用域复用。
  const modelPermission = computed<IModelPermission | undefined>(() => options.source.value?._modelPerm)

  return {
    contextData,
    modelPermission,
  }
}