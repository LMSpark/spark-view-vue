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
