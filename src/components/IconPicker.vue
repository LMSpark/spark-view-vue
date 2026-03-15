<template>
  <el-popover trigger="click" :width="360" placement="bottom-start">
    <template #reference>
      <el-button class="icon-trigger" :style="{ width: width + 'px' }">
        <el-icon v-if="modelValue" :size="18"><component :is="iconMap[modelValue]" /></el-icon>
        <span v-else class="icon-placeholder">{{ placeholder }}</span>
      </el-button>
    </template>
    <div class="icon-search">
      <el-input v-model="keyword" placeholder="搜索图标…" :prefix-icon="Search" size="small" clearable />
    </div>
    <div class="icon-grid">
      <button
        v-for="name in filtered"
        :key="name"
        class="icon-cell"
        :class="{ active: name === modelValue }"
        :title="name"
        @click="select(name)"
      ><el-icon :size="18"><component :is="iconMap[name]" /></el-icon></button>
    </div>
    <div v-if="!filtered.length" class="icon-empty">无匹配图标</div>
    <div v-if="modelValue" class="icon-footer">
      <span class="icon-name">{{ modelValue }}</span>
      <el-button size="small" link type="danger" @click="select('')">清除</el-button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import * as Icons from '@element-plus/icons-vue'

interface Props {
  modelValue?: string
  placeholder?: string
  width?: number
}

withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '选择图标',
  width: 60,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const iconMap = Icons as unknown as Record<string, ReturnType<typeof import('vue')['defineComponent']>>
const allNames = Object.keys(Icons).filter(k => k !== 'default').sort()

const keyword = ref('')

const filtered = computed(() => {
  const kw = keyword.value.toLowerCase()
  if (!kw) return allNames
  return allNames.filter(n => n.toLowerCase().includes(kw))
})

function select(name: string) {
  emit('update:modelValue', name)
}
</script>

<style scoped>
.icon-trigger {
  min-width: 42px;
  font-size: 18px;
  padding: 4px 8px;
  cursor: pointer;
}
.icon-placeholder {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
.icon-search {
  margin-bottom: 8px;
}
.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}
.icon-cell {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-regular);
  transition: all 0.15s;
}
.icon-cell:hover {
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
}
.icon-cell.active {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}
.icon-empty {
  text-align: center;
  padding: 16px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
.icon-footer {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 4px;
}
.icon-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
