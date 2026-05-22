<template>
  <div class="module-context-badge">
    <el-tag size="small" type="info">{{ displayText }}</el-tag>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  useSparkComponent,
  MODULE_CONTEXT,
} from '@spark-view/spark-component'
import type {
  SparkNode,
} from '@spark-view/spark-component'

type Props = {
  config?: SparkNode
  label?: string
  emptyText?: string}

const props = withDefaults(defineProps<Props>(), {
  label: '上下文',
  emptyText: '未选择',
})

const { sparkConsume } = useSparkComponent(props.config ?? { type: 'r-module-context-badge' })
const moduleContextCapability = sparkConsume(MODULE_CONTEXT)

const moduleContext = ref(moduleContextCapability?.getCurrent() ?? null)

const selectedLabel = computed(() => {
  const ctx = moduleContext.value
  if (!ctx) return ''
  if (ctx.selected === null) return ''
  const selected = String(ctx.selected)
  const item = ctx.items.find(option => String(option.id) === selected)
  return item?.title ?? selected
})

const displayText = computed(() => {
  const prefix = props.label.trim()
  const current = selectedLabel.value
  const fallback = props.emptyText.trim()
  return `${prefix}：${current.length > 0 ? current : fallback}`
})

const unsubscribe = moduleContextCapability?.subscribe((next) => {
  moduleContext.value = next
}) ?? null

onUnmounted(() => {
  unsubscribe?.()
})
</script>

<style scoped>
.module-context-badge {
  display: inline-flex;
  align-items: center;
}
</style>
