<template>
  <div>
    <el-divider content-position="left">状态控制</el-divider>
    <el-form-item label="隐藏" class="switch-item">
      <el-switch v-model="state.navEditDto.hidden" :disabled="isSubPage" @change="state.markNavDirty" />
      <span class="switch-item__hint">
        {{ isSubPage ? '子页面固定为隐藏（true 持久化）' : '在导航中不展示该节点（仅 true 持久化，false 为默认值不落库）' }}
      </span>
    </el-form-item>
    <el-form-item label="禁用" class="switch-item">
      <el-switch v-model="state.navEditDto.disabled" @change="state.markNavDirty" />
      <span class="switch-item__hint">保留显示但不可点击（仅 true 持久化，false 为默认值不落库）</span>
    </el-form-item>
    <el-form-item label="后置分割线" class="switch-item">
      <el-switch v-model="state.navEditDto.dividerAfter" @change="state.markNavDirty" />
      <span class="switch-item__hint">在当前节点后显示分割线</span>
    </el-form-item>

    <el-divider content-position="left">权限控制</el-divider>
    <el-form-item label="权限模式">
      <el-radio-group v-model="state.navEditDto.permissionMode" @change="state.markNavDirty">
        <el-radio value="none">不控制</el-radio>
        <el-radio value="masked">可见+脱敏</el-radio>
        <el-radio value="invisible">不可见</el-radio>
      </el-radio-group>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DevState } from '../useDevState'

const props = defineProps<{ state: DevState }>()

const isSubPage = computed(() => props.state.navEditDto.nodeKind === 'sub-page')
</script>

<style scoped>
.switch-item :deep(.el-form-item__content) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.switch-item__hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
