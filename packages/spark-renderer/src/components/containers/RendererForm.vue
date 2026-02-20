<template>
  <el-form :model="formModel" v-bind="$attrs">
    <slot />
  </el-form>
</template>

<script setup lang="ts">
/**
 * RendererForm - 表单容器组件
 *
 * 内部通过 useSparkComponent + consume(PAGE_DATASET) 自行解析 dataKey：
 *   field=currentRow → DataView.currentRow
 *   field=rows       → rows[0]（首行作为表单模型）
 * 未设置 dataKey 时回退到 props.data。
 */
import { provide, reactive, computed, watch } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET, parseDataKey, resolveDataKey } from '@spark-view/spark-data'

interface Props {
  /** DataKey 格式：scope@tableName@viewId@field （优先） */
  dataKey?: string
  /** 表单数据对象（备用， dataKey 不存在时生效） */
  data?: Record<string, unknown>
  labelWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({}),
  labelWidth: '100px'
})

// 接入 SPARK 能力链
const { consume } = useSparkComponent({ type: 'r-form' })
const pageDataSet = consume(PAGE_DATASET)

// 解析表单数据：dataKey 优先，回退到 props.data
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

// 表单数据模型（响应式）
const formModel = reactive<Record<string, unknown>>({ ...resolvedData.value })

// 数据源变化时同步到 formModel
watch(resolvedData, (nv) => {
  Object.keys(formModel).forEach(k => { delete formModel[k] })
  Object.assign(formModel, nv)
}, { deep: false })

provide('fieldContext', 'form')
provide('contextData', formModel)
</script>
