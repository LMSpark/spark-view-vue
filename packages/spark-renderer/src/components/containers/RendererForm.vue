<template>
  <el-form :model="formModel" v-bind="$attrs">
    <slot />
  </el-form>
</template>

<script setup lang="ts">
/**
 * RendererForm - 表单容器组件
 * 
 * 通过 provide 告知子字段组件当前处于 form 上下文，
 * 同时提供表单数据供子组件双向绑定。
 */
import { provide, reactive } from 'vue'

interface Props {
  /** 表单数据对象 */
  data?: Record<string, unknown>
  /** 标签宽度 */
  labelWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({}),
  labelWidth: '100px'
})

// 表单数据模型（响应式）
const formModel = reactive<Record<string, unknown>>({ ...props.data })

// 提供上下文给子字段组件
provide('fieldContext', 'form')
provide('contextData', formModel)
</script>
