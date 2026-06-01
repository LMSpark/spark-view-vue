<template>
  <div>
    <el-divider content-position="left">基础信息</el-divider>
    <el-form-item label="节点 ID" class="fi fi--wide">
      <el-input :model-value="state.navEditDto.id" disabled placeholder="NODE_ID" />
    </el-form-item>
    <el-form-item label="标题" class="fi fi--wide">
      <el-input v-model="state.navEditDto.title" placeholder="显示名称" @change="state.markNavDirty" />
    </el-form-item>
    <div class="fi-inline-row">
      <el-form-item label="图标" class="fi fi--narrow fi-inline-row__icon">
        <IconPicker
          v-model="state.navEditDto.icon"
          class="icon-picker-compact"
          placeholder="选择图标"
          width="220"
          @update:model-value="state.markNavDirty"
        />
      </el-form-item>
      <el-form-item label="节点类别" class="fi fi--medium fi-inline-row__type">
        <el-radio-group v-model="state.navEditDto.nodeKind" class="type-radio-group" @change="state.handleNodeKindChange">
          <el-radio-button value="system-directory">系统模块</el-radio-button>
          <el-radio-button value="module" :disabled="moduleKindDisabled">模块</el-radio-button>
          <el-radio-button value="system-page">系统页面</el-radio-button>
          <el-radio-button value="system-action">系统动作</el-radio-button>
          <el-radio-button value="page">普通页面</el-radio-button>
          <el-radio-button value="link">超链接</el-radio-button>
          <el-radio-button value="sub-page">子页面</el-radio-button>
          <el-radio-button value="ref">跨工程引用</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </div>
    <el-form-item label="功能描述" class="fi fi--wide">
      <el-input
        v-model="state.navEditDto.description"
        type="textarea"
        :autosize="{ minRows: 4, maxRows: 12 }"
        placeholder="页面功能策划，也是 AI 用户需求。&#10;示例：级联操作演示页 — 展示 DataSet 主从表联动，父表选中行变更自动驱动子表数据过滤与刷新。"
        @change="state.markNavDirty"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import IconPicker from '@/components/IconPicker.vue'

defineProps<{
  state: DevState
  moduleKindDisabled: boolean
}>()
</script>

<style scoped>
.fi-inline-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.icon-picker-compact {
  width: 100%;
}
</style>
