<!--
/**
 * @skill r-form
 * @description 表单容器，绑定 DataView.currentRow 实现双向编辑，支持 dock 分区工具栏，子字段组件通过 CONTEXT_DATA 读写表单值
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } } } }
 * @example { "type": "r-form", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-form-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-form-toolbar-${index}`"
        :config="action"
      />
    </div>

    <div class="renderer-form-main">
      <el-form ref="nativeFormRef" :model="formModel" :label-width="labelWidth" v-bind="$attrs">
        <div v-if="gridChildren.length" class="renderer-form-grid" :style="gridStyle">
          <div
            v-for="(child, i) in gridChildren"
            :key="nodeId(child) ?? `r-form-child-${i}`"
            class="renderer-form-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </div>
        <slot v-else v-bind="getDefaultSlotScope()" />
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererForm - 表单容器组件
 */
import { ref } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import { nodeId, type SparkNode } from '../_pkg'
import type { ContainerDocks } from '../../types'
import { useFormDetailContainer } from './useFormDetailContainer'
import type { RendererFormApi } from '../_pkg'

interface Props {
  /** 数据绑定键，如 "Users@currentRow" */
  dataKey?: string
  /** 子节点列表 */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
  /** 表单标签宽度 */
  labelWidth?: string
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  labelWidth: '100px',
  docks: () => ({}),
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const {
  registerApi,
  resolvedView,
  contextData: formModel,
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getDefaultSlotScope,
} = useFormDetailContainer({
  ...props,
}, 'form')

// ── r-form 包装 API ──────────────────────────────────────────────────────

const nativeFormRef = ref<unknown>(null)

interface NativeFormLike {
  validate?: () => Promise<boolean>
  resetFields?: () => void
  clearValidate?: () => void
}

const formApi: RendererFormApi = {
  getDataSource() {
    return resolvedView.value ?? null
  },
  getFormData() {
    return formModel
  },
  getNativeForm() {
    return nativeFormRef.value
  },
  async validate() {
    const form = nativeFormRef.value as NativeFormLike
    if (!form?.validate) return true
    try {
      return await form.validate()
    } catch {
      return false
    }
  },
  resetFields() {
    (nativeFormRef.value as NativeFormLike)?.resetFields?.()
  },
  clearValidate() {
    (nativeFormRef.value as NativeFormLike)?.clearValidate?.()
  },
  getFieldValue(field) {
    return formModel[field]
  },
  setFieldValue(field, value) {
    formModel[field] = value
  },
}

registerApi(formApi)

defineExpose(formApi)
</script>

<style scoped>
.renderer-form-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-form-layout--top,
.renderer-form-layout--bottom {
  flex-direction: column;
}

.renderer-form-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-form-layout--right {
  flex-direction: row-reverse;
}

.renderer-form-main {
  min-width: 0;
  flex: 1;
}

.renderer-form-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-form-layout--left .renderer-form-toolbar,
.renderer-form-layout--right .renderer-form-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-form-grid-item {
  min-width: 0;
}
</style>
