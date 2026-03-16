<script setup lang="ts">
import { computed } from 'vue'
import * as Icons from '@element-plus/icons-vue'

const props = defineProps<{ name?: string | undefined; size?: number | undefined }>()

const iconMap = Icons as unknown as Record<string, ReturnType<typeof import('vue')['defineComponent']>>

const LEGACY_ICON_ALIAS: Record<string, string> = {
  '🔧': 'SetUp',
  '🎨': 'Brush',
  '💬': 'ChatDotRound',
  '🔍': 'Search',
  '⛶': 'FullScreen',
  '🔔': 'Bell',
  '🌙': 'Moon',
  '👤': 'User',
  '⚙️': 'Setting',
  '⚙': 'Setting',
  '🏠': 'HomeFilled',
  '📊': 'DataBoard',
  '📱': 'Grid',
  '📋': 'List',
  '👥': 'UserFilled',
  '⚡': 'Lightning',
  '🗄️': 'Coin',
  'ℹ️': 'InfoFilled',
  'ℹ': 'InfoFilled',
  '🔗': 'Connection',
  '🔄': 'Refresh',
  '🧠': 'Cpu',
  '📦': 'Box',
  '🧩': 'Grid',
  '📈': 'TrendCharts',
  '🎯': 'Aim',
  '🏢': 'OfficeBuilding',
  '🌳': 'Share',
  '🌲': 'Share',
  '🌿': 'Share',
  '➕': 'Plus',
  '🗑️': 'Delete',
  '🤖': 'Cpu',
  '💾': 'DocumentChecked',
  '📑': 'Tickets',
  '📐': 'Crop',
  '👁️': 'View',
  '🚀': 'Promotion',
  '✅': 'SuccessFilled',
  '⚠️': 'WarningFilled',
  '❌': 'CircleCloseFilled',
}

const normalizedName = computed(() => {
  if (!props.name) return undefined
  return LEGACY_ICON_ALIAS[props.name] ?? props.name
})

const isElIcon = computed(() => {
  if (!normalizedName.value) return false
  return normalizedName.value in iconMap
})
</script>

<template>
  <el-icon v-if="isElIcon" :size="size"><component :is="iconMap[normalizedName!]" /></el-icon>
  <span v-else-if="name" class="nav-icon-emoji">{{ name }}</span>
</template>

<style scoped>
.nav-icon-emoji {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
</style>
