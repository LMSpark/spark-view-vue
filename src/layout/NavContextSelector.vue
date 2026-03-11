<template>
  <div class="nav-context-selector">
    <el-select
      :model-value="state.selected !== null ? String(state.selected) : ''"
      :placeholder="state.config.placeholder ?? '请选择'"
      :loading="state.loading"
      size="small"
      style="width: 150px"
      @change="(val: string) => onSelect(val)"
    >
      <el-option
        v-for="opt in state.items"
        :key="String(opt.id)"
        :label="opt.title"
        :value="String(opt.id)"
      />
    </el-select>
    <span v-if="state.error" class="nav-context-selector__error" :title="state.error">⚠</span>
  </div>
</template>

<script setup lang="ts">
import type { NavContextState } from './nav-types'
import { useNav } from './useNavigation'

defineProps<{
  state: NavContextState
}>()

const nav = useNav()

function onSelect(val: string) {
  nav?.setContextValue(val === '' ? null : val)
}
</script>

<style scoped>
.nav-context-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-context-selector__error {
  color: #f56c6c;
  font-size: 14px;
  cursor: help;
}
</style>
