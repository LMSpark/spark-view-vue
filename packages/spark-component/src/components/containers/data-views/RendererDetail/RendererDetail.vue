<template>
  <div :class="['renderer-detail-layout', `renderer-detail-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-detail-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-detail-toolbar-${index}`"
          :config="action"
        />
    </div>

    <div class="renderer-detail-main" v-bind="detailPropsValue" :style="detailAlignStyle">
        <div class="renderer-detail-grid" :style="gridStyle">
          <div
            v-for="(child, index) in gridChildren"
            :key="nodeId(child) ?? `r-detail-child-${index}`"
            class="renderer-detail-grid-item"
            :style="getChildGridStyle(child)"
          >
            <RendererHostScope :row="detailData">
              <SparkComponentRenderer :config="child" />
            </RendererHostScope>
          </div>
          <slot v-bind="getDefaultScope()" />
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-detail
 * @description 数据详情容器，与 r-form 结构一致但不可编辑。
 * @category container
 * @binding dataKey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes children 内放 r-* 字段组件（只读模式展示）
 * @notes 工具栏通过结构化 `toolbar` 区域声明
 */
/**
 * RendererDetail - 详情展示容器组件
 */
import { computed, type StyleValue } from 'vue'
import {
  SparkComponentRenderer,
  nodeId,
} from '../../../internal'
import type { RDetailProps } from './RendererDetail.props'
import {
  buildFormDetailContainerProps,
  useFormDetailContainer,
} from '../../composables/container-form-detail'
import { createRendererDetailZeroCode } from './zero-code'
import RendererHostScope from '../../support/RendererHostScope.vue'

const props = withDefaults(defineProps<RDetailProps>(), {
  type: 'r-detail',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  titleAlign: 'left',
  valueAlign: 'left',
})
const detailPropsValue = computed<Record<string, unknown>>(() => ({ ...(props.detailProps ?? {}) }))

const detailAlignStyle = computed<StyleValue>(() => ({
  '--spark-detail-title-align': props.titleAlign,
  '--spark-detail-value-align': props.valueAlign,
}))

const {
  registerApi,
  logger,
  resolvedView,
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getDefaultScope,
  contextData: detailData,
} = useFormDetailContainer(
  buildFormDetailContainerProps({
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.toolbar !== undefined ? { toolbar: props.toolbar } : {}),
    ...(props.children !== undefined ? { children: props.children } : {}),
    ...(props.dataSource !== undefined ? { dataSource: props.dataSource } : {}),
    dataKey: props.dataKey,
    gridColumns: props.gridColumns,
    gridGap: props.gridGap,
    gridAutoRows: props.gridAutoRows,
  }),
  'r-detail',
)

// ── r-detail 包装 API ────────────────────────────────────────────────────

const {
  detailApi,
} = createRendererDetailZeroCode({
  props,
  resolvedView,
  detailData,
  logger,
})

registerApi(detailApi)

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

