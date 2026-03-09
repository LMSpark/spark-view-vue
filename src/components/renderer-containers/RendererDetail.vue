<!--
/**
 * @skill r-detail
 * @description 只读详情容器，绑定 DataView.currentRow 展示当前行字段，不支持编辑回写
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string }
 * @example { "type": "r-detail", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div class="renderer-detail" v-bind="$attrs">
    <!-- Config 驱动 —— 通用递归渲染 config.children -->
    <div v-if="gridChildren.length" class="renderer-detail-grid" :style="gridStyle">
      <div
        v-for="(child, i) in gridChildren"
        :key="child.id ?? `r-detail-child-${i}`"
        class="renderer-detail-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
    </div>
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
import { parseDataKey } from '@spark-view/spark-data'
import type { DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'
import { useContainerGrid } from './useContainerGrid'

interface Props {
  config?: ComponentConfig
  dataKey?: string
  /** bindRules 从 rule.children 提取的子组件配置（form-create 路径） */
  sparkChildren?: ComponentConfig[]
  /** 直接传入的 DataView（备用） */
  dataView?: DataView | undefined
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const configChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: configChildren,
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const { consume, provide: sparkProvide } = useSparkComponent(
  props.config ?? { type: 'r-detail' }
)
const pageDataSet = consume(PAGE_DATASET)

// ── 统一解析 DataView：所有数据交互的唯一中介 ──
const resolvedView = computed<DataView | null>(() => {
  if (effectiveDataKey.value && pageDataSet) {
    const dk = parseDataKey(effectiveDataKey.value)
    if (dk) return (pageDataSet.getView(dk.tableName, dk.viewId) as DataView) ?? null
  }
  return props.dataView ?? null
})

// 详情数据：从 DataView.currentRow 同步到 reactive 对象（字段组件可直接读取）
const detailData = reactive<Record<string, unknown>>({})

watch(
  () => resolvedView.value?.currentRow,
  (row) => {
    Object.keys(detailData).forEach(k => { detailData[k] = undefined })
    if (row) Object.assign(detailData, row)
  },
  { immediate: true }
)

// DataView → DATA_SOURCE 提供给子组件
watch(resolvedView, (view) => {
  if (view) sparkProvide(DATA_SOURCE, view)
}, { immediate: true })

sparkProvide(FIELD_CONTEXT, 'detail')
sparkProvide(CONTEXT_DATA, detailData)
</script>

<style scoped>
.renderer-detail-grid-item {
  min-width: 0;
}
</style>
