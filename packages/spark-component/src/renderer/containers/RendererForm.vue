<!--
/**
 * @skill r-form
 * @description 表单容器，绑定 DataView.currentRow 实现双向编辑，子字段组件通过 CONTEXT_DATA 读写表单值
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string }
 * @example { "type": "r-form", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-form-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-form-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
    </div>

    <div class="renderer-form-main">
      <el-form :model="formModel" :label-width="labelWidth" v-bind="$attrs">
        <div v-if="gridChildren.length" class="renderer-form-grid" :style="gridStyle">
          <div
            v-for="(child, i) in gridChildren"
            :key="child.id ?? `r-form-child-${i}`"
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
import { SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { DataView } from '@spark-view/spark-data'
import type { ToolbarPosition } from './useContainerToolbar'
import { useFormDetailContainer } from './useFormDetailContainer'

interface Props {
  /** SPARK 配置驱动 */
  config?: SparkNode
  /** 数据绑定键，如 "Users@currentRow" */
  dataKey?: string
  /** bindRules 提取的子组件配置 */
  sparkChildren?: SparkNode[]
  /** 直接传入的 DataView */
  dataView?: DataView | undefined
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
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
  toolbarPosition: 'top',
  toolbarClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const {
  contextData: formModel,
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getToolbarSlotScope,
  getDefaultSlotScope,
} = useFormDetailContainer(props, 'form')
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
