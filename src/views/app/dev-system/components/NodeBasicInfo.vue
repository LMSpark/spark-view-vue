<!--
@module app:views/app/dev-system/components/NodeBasicInfo
职责：提供 DevSystem 的 NodeBasicInfo 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeBasicInfo。
-->
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
        <el-radio-group :model-value="nodeKindUiValue" class="type-radio-group" @change="onNodeKindUiChange">
          <el-radio-button value="system-directory">系统模块</el-radio-button>
          <el-radio-button value="module" :disabled="moduleKindDisabled">模块</el-radio-button>
          <el-radio-button value="system-page">系统页面</el-radio-button>
          <el-radio-button value="system-action">系统动作</el-radio-button>
          <el-radio-button value="page">普通页面</el-radio-button>
          <el-radio-button value="link">超链接</el-radio-button>
          <el-radio-button value="nested-page">子页面</el-radio-button>
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
import { computed } from 'vue'
import type { NavNodeKind } from '@spark-appworks/spark-project-model'
import { isNestedConfigPageNode } from '@spark-appworks/spark-project-model'
import type { DevState } from '../useDevState'
import IconPicker from '@/components/IconPicker.vue'

const props = defineProps<{
  state: DevState
  moduleKindDisabled: boolean
}>()

const nodeKindUiValue = computed(() =>
  isNestedConfigPageNode(props.state.navEditDto) ? 'nested-page' : props.state.navEditDto.nodeKind,
)

function onNodeKindUiChange(value: string): void {
  if (value === 'nested-page') {
    props.state.applyNestedConfigPagePreset()
    return
  }
  props.state.handleNodeKindChange(value as NavNodeKind)
}
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
