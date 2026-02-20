<template>
  <div class="renderer-detail" v-bind="$attrs">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * RendererDetail - 详情展示容器组件
 *
 * 内部通过 useSparkComponent + consume(PAGE_DATASET) 自行解析 dataKey，
 * 不再依赖 bindRules.ts 外部注入。
 */
import { provide, reactive, computed, watch } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET, parseDataKey, resolveDataKey } from '@spark-view/spark-data'

interface Props {
  /** DataKey 格式：scope@tableName@viewId@field （优先） */
  dataKey?: string
  /** 详情数据对象（备用） */
  data?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const { consume } = useSparkComponent({ type: 'r-detail' })
const pageDataSet = consume(PAGE_DATASET)

// 解析详情数据
const resolvedData = computed<Record<string, unknown>>(() => {
  if (props.dataKey && pageDataSet) {
    const dk = parseDataKey(props.dataKey)
    if (dk) {
      const raw = resolveDataKey(dk, pageDataSet)
      if (raw && typeof raw === 'object') return raw as Record<string, unknown>
    }
  }
  return props.data ?? {}
})

const detailData = reactive<Record<string, unknown>>({ ...resolvedData.value })

watch(resolvedData, (nv) => {
  Object.keys(detailData).forEach(k => { delete detailData[k] })
  Object.assign(detailData, nv)
}, { deep: false })

provide('fieldContext', 'detail')
provide('contextData', detailData)
</script>
