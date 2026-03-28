<!--
/**
 * @skill r-form
 * @description 表单容器，绑定 DataView.currentRow 实现双向编辑，支持 dock 分区工具栏，子字段组件通过 CONTEXT_DATA 读写表单值
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @context 通过当前组件 type='r-form' 提供字段语义
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } } } }
 * @example { "type": "r-form", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-form-toolbar', toolbarClassValue]">
      <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-form-toolbar-${index}`">
        <el-button
          v-if="isBuiltinAction(action)"
          :type="getBuiltinButtonType(action)"
          :size="getBuiltinButtonSize(action)"
          :plain="getBuiltinButtonPlain(action)"
          :text="getBuiltinButtonText(action)"
          :link="getBuiltinButtonLink(action)"
          :disabled="isBuiltinActionDisabled(action)"
          :class="getBuiltinButtonClass(action)"
          @click="handleBuiltinToolbarAction(action)"
        >{{ getBuiltinActionLabel(action) }}</el-button>
        <SparkComponentRenderer
          v-else
          :config="action"
        />
      </template>
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
import { SparkComponentRenderer } from '../../internal'
import { nodeId, type SparkNode } from '../../internal'
import type { ContainerDocks } from '../../../core/types'
import { useFormDetailContainer } from '../context/useFormDetailContainer'
import type { RendererFormApi } from '../../internal'
import {
  createCancelledCrudResult,
  type AddRowHandler,
  type EditRowHandler,
  type RemoveRowHandler,
  useEventDefaults,
} from '../support/index.js'
import {
  createBuiltinActionHandler,
  getBuiltinActionLabel,
  getBuiltinButtonClass,
  getBuiltinButtonLink,
  getBuiltinButtonPlain,
  getBuiltinButtonSize,
  getBuiltinButtonText,
  getBuiltinButtonType,
  isBuiltinAction,
  isBuiltinActionDisabled as _isBuiltinActionDisabled,
} from '../builtin-actions'

interface Props extends SparkNode {
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
  onAddRow?: AddRowHandler
  onEditRow?: EditRowHandler
  onRemoveRow?: RemoveRowHandler
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-form',
  labelWidth: '100px',
  docks: () => ({}),
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const {
  registerApi,
  logger,
  pageService,
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
  type: props.type,
  ...(props.id !== undefined ? { id: props.id } : {}),
  ...(props.children !== undefined ? { children: props.children } : {}),
  dataKey: props.dataKey,
  docks: props.docks,
  gridColumns: props.gridColumns,
  gridGap: props.gridGap,
  gridAutoRows: props.gridAutoRows,
}, 'form')

// ── r-form 包装 API ──────────────────────────────────────────────────────

const nativeFormRef = ref<unknown>(null)

interface NativeFormLike {
  validate?: () => Promise<boolean>
  resetFields?: () => void
  clearValidate?: () => void
}

const { dispatch } = useEventDefaults({
  'add-row': {},
  'edit-row': {},
  'remove-row': {},
}, props as Readonly<Record<string, unknown>>)

const formApi: RendererFormApi = {
  getDataSource() {
    return resolvedView.value ?? null
  },
  getCurrentRow() {
    return resolvedView.value?.currentRow ?? null
  },
  getFormData() {
    return formModel
  },
  getNativeForm() {
    return nativeFormRef.value
  },
  async refresh() {
    const view = resolvedView.value
    if (!view?.dataTable?.api?.list) return
    await view.refresh()
  },
  async addRow(row) {
    const view = resolvedView.value
    if (!view) return null
    const { cancel } = await dispatch('add-row', row)
    if (cancel) return createCancelledCrudResult('addRow cancelled by business handler')
    return await view.addRow(row)
  },
  async editRowById(id, patch) {
    const view = resolvedView.value
    if (!view) return false
    const { cancel } = await dispatch('edit-row', id, patch)
    if (cancel) return createCancelledCrudResult('editRowById cancelled by business handler')
    return await view.editRowById(id, patch)
  },
  async removeRow(id) {
    const view = resolvedView.value
    if (!view) return false
    const { cancel } = await dispatch('remove-row', id)
    if (cancel) return createCancelledCrudResult('removeRow cancelled by business handler')
    return await view.removeRow(id)
  },
  appendRow(row) {
    resolvedView.value?.appendRow(row)
  },
  updateRowById(id, patch) {
    return resolvedView.value?.updateRowById(id, patch) ?? false
  },
  deleteRowById(id) {
    return resolvedView.value?.deleteRowById(id) ?? false
  },
  setCurrentRow(row) {
    resolvedView.value?.setCurrentRow(row ?? null)
  },
  setCurrentRowById(id) {
    return resolvedView.value?.setCurrentRowById(id ?? null) ?? false
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

const builtinHandler = createBuiltinActionHandler({
  getView: () => resolvedView.value,
  getPageService: () => pageService,
  getLogger: () => logger,
  hasRemoteListApi: view => Boolean(view.dataTable?.api?.list),
  getFormApi: () => formApi,
})

function isBuiltinActionDisabled(action: SparkNode): boolean {
  return _isBuiltinActionDisabled(action, resolvedView.value)
}

function handleBuiltinToolbarAction(action: SparkNode): void {
  builtinHandler.handleToolbar(action)
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

