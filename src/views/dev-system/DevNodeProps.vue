<template>
  <div class="dev-node-props">
    <el-form :model="state.editForm" label-width="100px" size="default">
      <!-- 基础信息 -->
      <el-divider content-position="left">基础信息</el-divider>
      <el-form-item label="ID">
        <el-input v-model="state.editForm.id" placeholder="唯一标识" @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="标题">
        <el-input v-model="state.editForm.title" placeholder="显示名称" @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="图标">
        <EmojiPicker v-model="state.editForm.icon" placeholder="📄" @update:model-value="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="类型">
        <el-select v-model="state.editForm.type" placeholder="节点类型" @change="state.markNavDirty">
          <el-option value="item" label="item（普通节点）" />
          <el-option value="group" label="group（分组标题）" />
          <el-option value="divider" label="divider（分隔线）" />
        </el-select>
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="state.editForm.description" placeholder="节点描述（AI 语义 + tooltip）" @change="state.markNavDirty" />
      </el-form-item>

      <!-- 路由 & 关联页面 -->
      <el-divider content-position="left">路由 & 关联页面</el-divider>
      <el-form-item label="路由路径">
        <el-input v-model="state.editForm.path" placeholder="/xxx" @change="state.handlePathChange" />
      </el-form-item>
      <el-form-item label="页面类型">
        <el-select v-model="state.editForm.pageType" placeholder="默认 config" clearable @change="state.markNavDirty">
          <el-option value="config" label="config（配置驱动）" />
          <el-option value="vue-component" label="vue-component（Vue 组件）" />
        </el-select>
      </el-form-item>
      <el-form-item label="重定向">
        <el-input v-model="state.editForm.redirect" placeholder="组节点默认跳转路径" @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="外部链接">
        <el-input v-model="state.editForm.externalUrl" placeholder="https://..." @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="动作">
        <el-select v-model="state.editForm.action" placeholder="工具栏动作（toolbar 节点用）" clearable @change="state.markNavDirty">
          <el-option value="ai-design" label="AI 协同设计" />
          <el-option value="ai-chat" label="AI 对话" />
          <el-option value="search" label="搜索" />
          <el-option value="fullscreen" label="全屏" />
          <el-option value="notifications" label="通知" />
          <el-option value="theme-toggle" label="主题切换" />
        </el-select>
      </el-form-item>

      <!-- 布局配置 -->
      <el-divider content-position="left">布局配置</el-divider>
      <el-form-item label="子项布局">
        <el-radio-group v-model="state.editForm.childPlacement" @change="state.markNavDirty">
          <el-radio-button value="">默认</el-radio-button>
          <el-radio-button value="header">header</el-radio-button>
          <el-radio-button value="sidebar">sidebar</el-radio-button>
          <el-radio-button value="parent">parent</el-radio-button>
          <el-radio-button value="flat">flat</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="排序号">
        <el-input-number v-model="state.editForm.order" :min="0" :max="999" @change="state.markNavDirty" />
      </el-form-item>

      <!-- 状态控制 -->
      <el-divider content-position="left">状态控制</el-divider>
      <el-form-item label="隐藏">
        <el-switch v-model="state.editForm.hidden" @change="state.markNavDirty" />
      </el-form-item>
      <el-form-item label="禁用">
        <el-switch v-model="state.editForm.disabled" @change="state.markNavDirty" />
      </el-form-item>

      <!-- 模块上下文 -->
      <el-divider content-position="left">模块上下文（Context）</el-divider>
      <el-form-item label="启用上下文">
        <el-switch v-model="state.hasContext.value" @change="state.toggleContext" />
      </el-form-item>
      <template v-if="state.hasContext.value">
        <el-form-item label="选项列表">
          <div class="context-items">
            <div v-for="(item, idx) in state.contextItems.value" :key="idx" class="context-item-row">
              <el-input v-model="item.id" placeholder="ID" style="width: 120px" @change="state.markNavDirty" />
              <el-input v-model="item.title" placeholder="显示名称" style="flex: 1" @change="state.markNavDirty" />
              <el-button size="small" link type="danger" @click="state.removeContextItem(idx)">✕</el-button>
            </div>
            <el-button size="small" type="primary" link @click="state.addContextItem">
              ➕ 新增选项
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="占位文字">
          <el-input v-model="state.contextConfig.placeholder" placeholder="请选择" @change="state.markNavDirty" />
        </el-form-item>
        <el-form-item label="默认值">
          <el-input v-model="state.contextConfig.defaultValue" placeholder="默认选中的 ID" @change="state.markNavDirty" />
        </el-form-item>
        <el-form-item label="URL 参数名">
          <el-input v-model="state.contextConfig.paramName" placeholder="同步到 route.query 的键名" @change="state.markNavDirty" />
        </el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import type { DevState } from './useDevState'
import EmojiPicker from '@/components/EmojiPicker.vue'

defineProps<{ state: DevState }>()
defineEmits<{ createPage: [] }>()
</script>

<style scoped>
.dev-node-props {
  padding: 8px 0;
  overflow: auto;
  height: 100%;
}
.context-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.context-item-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
