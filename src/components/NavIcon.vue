<script setup lang="ts">
import { computed } from 'vue'
import * as Icons from '@element-plus/icons-vue'

const props = defineProps<{ name?: string | undefined; size?: number | undefined }>()

const iconMap = Icons as unknown as Record<string, ReturnType<typeof import('vue')['defineComponent']>>

const isElIcon = computed(() => {
  if (!props.name) return false
  return props.name in iconMap
})
</script>

<template>
  <el-icon v-if="isElIcon" :size="size"><component :is="iconMap[name!]" /></el-icon>
  <span v-else-if="name" class="nav-icon-emoji">{{ name }}</span>
</template>

<style scoped>
.nav-icon-emoji {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
</style>
