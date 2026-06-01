<template>
  <template v-if="isDirectoryNode">
    <el-divider content-position="left">模块上下文（Context）</el-divider>
    <el-form-item label="启用上下文" class="switch-item">
      <el-switch v-model="state.navEditDto.hasContext" @change="state.toggleContext" />
      <span class="switch-item__hint">启用后可配置下拉上下文选项</span>
      <el-button size="small" type="primary" plain class="context-demo-btn" @click="state.fillDemoContext">
        <NavIcon name="MagicStick" :size="14" /> 一键填充演示数据
      </el-button>
      <span class="context-demo-tip">用于快速预览上下文下拉效果</span>
    </el-form-item>
    <template v-if="state.navEditDto.hasContext">
      <el-form-item label="选项列表" class="fi fi--wide">
        <div class="context-items">
          <div v-for="(item, idx) in state.contextItems.value" :key="idx" class="context-item-row">
            <el-input v-model="item.id" class="context-item-row__id" placeholder="ID" @change="state.syncContextToNav" />
            <el-input v-model="item.title" class="context-item-row__title" placeholder="显示名称" @change="state.syncContextToNav" />
            <el-button size="small" link type="danger" @click="state.removeContextItem(idx)">
              <NavIcon name="CloseBold" :size="12" />
            </el-button>
          </div>
          <el-button size="small" type="primary" link @click="state.addContextItem">
            <NavIcon name="Plus" :size="12" /> 新增选项
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="占位文字" class="fi fi--medium">
        <el-input v-model="state.contextConfig.placeholder" placeholder="请选择" @change="state.syncContextToNav" />
      </el-form-item>
      <el-form-item label="默认值" class="fi fi--medium">
        <el-input v-model="state.contextConfig.defaultValue" placeholder="默认选中的 ID" @change="state.syncContextToNav" />
      </el-form-item>
      <el-form-item label="URL 参数名" class="fi fi--medium">
        <el-input v-model="state.contextConfig.paramName" placeholder="同步到 route.query 的键名" @change="state.syncContextToNav" />
      </el-form-item>
    </template>
  </template>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{ state: DevState }>()
const flags = useNodeKindFlags(props.state)
const isDirectoryNode = flags.isDirectoryNode
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
.context-demo-btn {
  font-weight: 600;
}
.context-demo-tip {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.context-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-extra-light);
}
.context-item-row {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.context-item-row__id,
.context-item-row__title {
  width: 100%;
}
</style>
