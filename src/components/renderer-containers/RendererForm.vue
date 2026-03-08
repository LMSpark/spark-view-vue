<!--
/**
 * @skill r-form
 * @description 表单容器，绑定 DataView.currentRow 实现双向编辑，子字段组件通过 CONTEXT_DATA 读写表单值
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string }
 * @example { "type": "r-form", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <el-form :model="formModel" v-bind="$attrs">
    <!-- Config 驱动 —— 通用递归渲染 config.children -->
    <template v-if="configChildren.length">
      <SparkComponentRenderer
        v-for="(child, i) in configChildren"
        :key="child.id ?? `r-form-child-${i}`"
        :config="child"
      />
    </template>
    <!-- Template 驱动 —— 向后兼容 -->
    <slot v-else />
  </el-form>
</template>

<script setup lang="ts">
/**
 * RendererForm - 表单容器组件
 */
import { reactive, computed, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { parseDataKey } from '@spark-view/spark-data'
import type { DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'

interface Props {
  config?: ComponentConfig
  dataKey?: string
  /** bindRules 从 rule.children 提取的子组件配置（form-create 路径） */
  sparkChildren?: ComponentConfig[]
  /** 直接传入的 DataView（备用） */
  dataView?: DataView | undefined
  labelWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  labelWidth: '100px'
})

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const configChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])

const { consume, provide: sparkProvide } = useSparkComponent(
  props.config ?? { type: 'r-form' }
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

// 表单数据：从 DataView.currentRow 同步到 reactive 对象（字段组件可直接读写）
const formModel = reactive<Record<string, unknown>>({})

watch(
  () => resolvedView.value?.currentRow,
  (row) => {
    // 清空旧键，再同步新行数据
    for (const k of Object.keys(formModel)) { formModel[k] = undefined }
    if (row) Object.assign(formModel, row)
  },
  { immediate: true }
)

// DataView → DATA_SOURCE 提供给子组件
watch(resolvedView, (view) => {
  if (view) sparkProvide(DATA_SOURCE, view)
}, { immediate: true })

sparkProvide(FIELD_CONTEXT, 'form')
sparkProvide(CONTEXT_DATA, formModel)
</script>
