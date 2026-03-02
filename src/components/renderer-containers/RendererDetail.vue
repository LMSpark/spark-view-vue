<template>
  <div class="renderer-detail" v-bind="$attrs">
    <!-- Config 驱动 —— 通用递归渲染 config.children -->
    <template v-if="configChildren.length">
      <SparkComponentRenderer
        v-for="(child, i) in configChildren"
        :key="child.id ?? `r-detail-child-${i}`"
        :config="child"
      />
    </template>
    <!-- Template 驱动 —— 向后兼容 -->
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
/**
 * RendererDetail - 详情展示容器组件
 */
import { reactive, computed, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { parseDataKey, resolveDataKey } from '@spark-view/spark-data'
import { PAGE_DATASET } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'

interface Props {
  config?: ComponentConfig
  dataKey?: string
  data?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const configChildren = computed(() => props.config?.children ?? [])

const { consume, provide: sparkProvide } = useSparkComponent(
  props.config ?? { type: 'r-detail' }
)
const pageDataSet = consume(PAGE_DATASET)

const resolvedData = computed<Record<string, unknown>>(() => {
  if (effectiveDataKey.value && pageDataSet) {
    const dk = parseDataKey(effectiveDataKey.value)
    if (dk) {
      const raw = resolveDataKey(dk, pageDataSet)
      if (raw && typeof raw === 'object') return raw as Record<string, unknown>
    }
  }
  const configData = props.config?.props?.['data']
  if (configData && typeof configData === 'object') return configData as Record<string, unknown>
  return props.data ?? {}
})

const detailData = reactive<Record<string, unknown>>({ ...resolvedData.value })

watch(resolvedData, (nv) => {
  Object.keys(detailData).forEach(k => { delete detailData[k] })
  Object.assign(detailData, nv)
}, { deep: false })

sparkProvide(FIELD_CONTEXT, 'detail')
sparkProvide(CONTEXT_DATA, detailData)
</script>
