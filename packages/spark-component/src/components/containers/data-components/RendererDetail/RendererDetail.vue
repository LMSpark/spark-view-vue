<template>
  <div :class="['renderer-detail-layout', `renderer-detail-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-detail-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-detail-toolbar-${index}`"
        :config="action"
      />
    </div>

    <div class="renderer-detail-main">
      <div class="renderer-detail" v-bind="$attrs" :style="detailAlignStyle">
        <div class="renderer-detail-grid" :style="gridStyle">
          <div
            v-for="(child, index) in gridChildren"
            :key="nodeId(child) ?? `r-detail-child-${index}`"
            class="renderer-detail-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
          <slot v-bind="getDefaultSlotScope()" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-detail
 * @description 数据详情容器，基于 el-form 以只读模式展示 DataView.currentRow 字段值，与 r-form 结构一致但不可编辑。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes children 内放 r-* 字段组件（只读模式展示）
 * @notes dock='toolbar' 声明工具栏节点
 */
/**
 * RendererDetail - 详情展示容器组件
 */
import { SparkComponentRenderer } from '../../../internal'
import { computed, type StyleValue } from 'vue'
import { nodeId } from '../../../internal'
import type { SparkChildrenProps, SparkTableModelProps, SparkCrudEventProps } from '../../../shared-types'
import type { DataView } from '@spark-view/spark-data'
import { useFormDetailContainer } from '../../context/useFormDetailContainer'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'
import type { RendererDetailApi } from './types'
import { createRendererDetailZeroCode } from './zero-code'

interface RendererDetailProps extends SparkChildrenProps<'r-detail'>, SparkTableModelProps<DataView>, SparkCrudEventProps {
  /** 结构化工具栏 */
  toolbar?: ToolbarNode
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 标题对齐 */
  titleAlign?: 'left' | 'center' | 'right'
  /** 值对齐 */
  valueAlign?: 'left' | 'center' | 'right'
}

const props = withDefaults(defineProps<RendererDetailProps>(), {
  type: 'r-detail',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  titleAlign: 'left',
  valueAlign: 'left',
})

const detailAlignStyle = computed<StyleValue>(() => ({
  '--spark-detail-title-align': props.titleAlign,
  '--spark-detail-value-align': props.valueAlign,
}))

const {
  registerApi,
  resolvedView,
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getDefaultSlotScope,
  contextData: detailData,
} = useFormDetailContainer({
  type: props.type,
  ...(props.id !== undefined ? { id: props.id } : {}),
  ...(props.toolbar !== undefined ? { toolbar: props.toolbar } : {}),
  ...(props.children !== undefined ? { children: props.children } : {}),
  ...(props.dataSource !== undefined ? { dataSource: props.dataSource } : {}),
  dataKey: props.dataKey,
  gridColumns: props.gridColumns,
  gridGap: props.gridGap,
  gridAutoRows: props.gridAutoRows,
}, 'r-detail')

// ── r-detail 包装 API ────────────────────────────────────────────────────

const { detailApi }: { detailApi: RendererDetailApi } = createRendererDetailZeroCode({
  props,
  resolvedView,
  detailData,
})

registerApi(detailApi)

defineExpose(detailApi)
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
