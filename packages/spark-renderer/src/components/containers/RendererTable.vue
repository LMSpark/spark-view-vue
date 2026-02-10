<template>
  <el-table :data="tableData" v-bind="$attrs">
    <slot />
  </el-table>
</template>

<script setup lang="ts">
/**
 * RendererTable - 表格容器组件
 * 
 * 通过 provide 告知子字段组件当前处于 table 上下文，
 * 同时提供表格数据供子组件访问。
 */
import { provide, computed } from 'vue'

interface Props {
  data?: unknown[]
}

const props = withDefaults(defineProps<Props>(), {
  data: () => []
})

const tableData = computed(() => props.data)

// 提供上下文给子字段组件
provide('fieldContext', 'table')
provide('contextData', tableData)
</script>
