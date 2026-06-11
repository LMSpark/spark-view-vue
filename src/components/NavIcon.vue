<!--
@module app:components/NavIcon
职责：提供主应用 NavIcon 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 components/NavIcon。
-->
<script setup lang="ts">
import { computed } from 'vue'
import * as Icons from '@element-plus/icons-vue'

const props = defineProps<{ name?: string | undefined; size?: number | undefined }>()

const normalizedName = computed(() => {
  const name = props.name?.trim()
  if (!name) return undefined
  return name
})

const resolvedIcon = computed(() => {
  if (!normalizedName.value) return null
  return Object.entries(Icons).find(([name]) => name === normalizedName.value)?.[1] ?? null
})
</script>

<template>
  <el-icon v-if="resolvedIcon" :size="size"><component :is="resolvedIcon" /></el-icon>
  <span v-else-if="name" class="nav-icon-emoji">{{ name }}</span>
</template>

<style scoped>
.nav-icon-emoji {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
</style>
