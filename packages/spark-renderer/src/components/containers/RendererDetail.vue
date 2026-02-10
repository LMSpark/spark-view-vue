<template>
  <div class="renderer-detail" v-bind="$attrs">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * RendererDetail - 详情展示容器组件
 * 
 * 通过 provide 告知子字段组件当前处于 detail 上下文，
 * 同时提供数据供子组件只读展示。
 */
import { provide, reactive } from 'vue'

interface Props {
  /** 详情数据对象 */
  data?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const detailData = reactive<Record<string, unknown>>({ ...props.data })

// 提供上下文给子字段组件
provide('fieldContext', 'detail')
provide('contextData', detailData)
</script>
