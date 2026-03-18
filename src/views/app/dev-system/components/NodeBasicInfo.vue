<template>
  <div>
    <el-divider content-position="left">基础信息</el-divider>
    <el-form-item label="ID" class="fi fi--wide">
      <el-input v-model="state.editForm.id" placeholder="唯一标识" @change="state.markNavDirty" />
    </el-form-item>
    <el-form-item label="标题" class="fi fi--wide">
      <el-input v-model="state.editForm.title" placeholder="显示名称" @change="state.markNavDirty" />
    </el-form-item>
    <div class="fi-inline-row">
      <el-form-item label="图标" class="fi fi--narrow fi-inline-row__icon">
        <IconPicker
          v-model="state.editForm.icon"
          class="icon-picker-compact"
          placeholder="选择图标"
          width="220"
          @update:model-value="state.markNavDirty"
        />
      </el-form-item>
      <el-form-item label="节点类别" class="fi fi--medium fi-inline-row__type">
        <el-radio-group v-model="state.editForm.nodeKind" class="type-radio-group" @change="state.handleNodeKindChange">
          <el-radio-button value="system-directory">系统模块</el-radio-button>
          <el-radio-button value="module" :disabled="moduleKindDisabled">模块</el-radio-button>
          <el-radio-button value="system-page">系统页面</el-radio-button>
          <el-radio-button value="system-action">系统动作</el-radio-button>
          <el-radio-button value="page">普通页面</el-radio-button>
          <el-radio-button value="link">超链接</el-radio-button>
          <el-radio-button value="sub-page">子页面</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </div>
    <el-form-item label="描述" class="fi fi--wide">
      <el-input
        v-model="state.editForm.description"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 5 }"
        placeholder="节点描述（AI 语义 + tooltip）"
        @change="state.markNavDirty"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import { IconPicker } from '@spark-view/spark-app'

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
