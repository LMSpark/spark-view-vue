<!--
/**
 * @skill r-detail
 * @description 只读详情容器，绑定 DataView.currentRow 展示当前行字段，不支持编辑回写
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string }
 * @example { "type": "r-detail", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div :class="['renderer-detail-layout', `renderer-detail-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-detail-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-detail-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
    </div>

    <div class="renderer-detail-main">
      <div class="renderer-detail" v-bind="$attrs">
        <div v-if="gridChildren.length" class="renderer-detail-grid" :style="gridStyle">
          <div
            v-for="(child, i) in gridChildren"
            :key="child.id ?? `r-detail-child-${i}`"
            class="renderer-detail-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </div>
        <slot v-else v-bind="getDefaultSlotScope()" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererDetail - 详情展示容器组件
 */
import { SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { DataView } from '@spark-view/spark-data'
import type { ToolbarPosition } from './useContainerToolbar'
import { useFormDetailContainer } from './useFormDetailContainer'

interface Props {
  /** 数据绑定键 */
  dataKey?: string
  /** 直接传入的 DataView */
  dataView?: DataView | undefined
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const {
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getToolbarSlotScope,
  getDefaultSlotScope,
} = useFormDetailContainer(props, 'detail')
</script>

<style scoped>
.renderer-detail-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-detail-layout--top,
.renderer-detail-layout--bottom {
  flex-direction: column;
}

.renderer-detail-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-detail-layout--right {
  flex-direction: row-reverse;
}

.renderer-detail-main {
  min-width: 0;
  flex: 1;
}

.renderer-detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-detail-layout--left .renderer-detail-toolbar,
.renderer-detail-layout--right .renderer-detail-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-detail-grid-item {
  min-width: 0;
}
</style>
