<!--
/**
 * @skill r-form
 * @description 表单容器，绑定 DataView.currentRow 实现双向编辑，支持 dock 分区工具栏，子字段组件通过 DATA_ROW 读写表单值
 * @provides DATA_SOURCE
 * @provides DATA_ROW
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
        <SparkComponentRenderer :config="resolveToolbarActionConfig(action)" />
      </template>
    </div>

    <div class="renderer-form-main">
      <el-form ref="nativeFormRef" :model="formModel" :label-width="labelWidth" v-bind="$attrs">
        <div class="renderer-form-grid" :style="gridStyle">
          <SparkChildrenBridge :spark-children="gridChildren" :parent-context="context" :slot-scope="getDefaultSlotScope()">
            <template #spark="{ child, index }">
              <div
                :key="nodeId(child) ?? `r-form-child-${index}`"
                class="renderer-form-grid-item"
                :style="getChildGridStyle(child)"
              >
                <SparkComponentRenderer :config="child" />
              </div>
            </template>
            <template #default="slotScope">
              <slot v-bind="slotScope" />
            </template>
          </SparkChildrenBridge>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererForm - 表单容器组件
 */
import { ref } from 'vue'
import { SparkChildrenBridge, SparkComponentRenderer } from '../../../internal'
import { nodeId, type SparkNode, type ContainerDocks } from '../../../internal'
import { useFormDetailContainer } from '../../context/useFormDetailContainer'
import type { RendererFormApi } from './types'
import { createRendererFormZeroCode } from './zero-code'
import {
  type AddRowHandler,
  type EditRowHandler,
  type RemoveRowHandler,
} from '../../support/index.js'
import {
  bindActionClick,
  isBuiltinAction,
} from '../../builtin-actions'

interface Props extends Omit<SparkNode, 'type'> {
  type?: string
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
  context,
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
}, 'r-form')

const nativeFormRef = ref<unknown>(null)
const {
  formApi,
  handleBuiltinToolbarAction,
}: {
  formApi: RendererFormApi
  handleBuiltinToolbarAction: (action: SparkNode) => void
} = createRendererFormZeroCode({
  props,
  resolvedView,
  formModel,
  nativeFormRef,
  pageService,
  logger,
})

registerApi(formApi)

defineExpose(formApi)

function resolveToolbarActionConfig(action: SparkNode): SparkNode {
  return isBuiltinAction(action)
    ? bindActionClick(action, () => handleBuiltinToolbarAction(action))
    : action
}
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

