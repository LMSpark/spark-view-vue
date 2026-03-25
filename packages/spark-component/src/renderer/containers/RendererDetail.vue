<!--
/**
 * @skill r-detail
 * @description 只读详情容器，绑定 DataView.currentRow 展示当前行字段，支持 dock 分区工具栏，不支持编辑回写
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } } } }
 * @example { "type": "r-detail", "dataKey": "Users@currentRow", "children": [] }
 */
-->
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
        <div v-if="gridChildren.length" class="renderer-detail-grid" :style="gridStyle">
          <div
            v-for="(child, i) in gridChildren"
            :key="nodeId(child) ?? `r-detail-child-${i}`"
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
import { computed, type StyleValue } from 'vue'
import { nodeId, type SparkNode } from '../_pkg'
import type { ContainerDocks } from '../../types'
import { useFormDetailContainer } from './useFormDetailContainer'
import type { RendererDetailApi } from '../_pkg'

interface Props {
  /** 数据绑定键 */
  dataKey?: string
  /** 子节点列表 */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
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

const props = withDefaults(defineProps<Props>(), {
  docks: () => ({}),
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
  ...props,
}, 'detail')

// ── r-detail 包装 API ────────────────────────────────────────────────────

const detailApi: RendererDetailApi = {
  getDataSource() {
    return resolvedView.value ?? null
  },
  getDetailData() {
    return detailData
  },
  getCurrentRow() {
    return resolvedView.value?.currentRow ?? null
  },
  getFieldValue(field) {
    return detailData[field]
  },
}

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
