<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <RendererHostScope v-if="showToolbar" :host="toolbarHost">
      <div :class="['renderer-form-toolbar', toolbarClassValue]">
        <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-form-toolbar-${index}`">
          <SparkComponentRenderer :config="action" />
        </template>
      </div>
    </RendererHostScope>

    <div class="renderer-form-main">
      <el-form ref="nativeFormRef" :model="formModel" :label-width="labelWidth" v-bind="$attrs">
        <div class="renderer-form-grid" :style="gridStyle">
          <div
            v-for="(child, index) in gridChildren"
            :key="nodeId(child) ?? `r-form-child-${index}`"
            class="renderer-form-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
          <slot v-bind="getDefaultSlotScope()" />
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-form
 * @description 数据表单容器，基于 el-form 绑定 DataView.currentRow 实现字段双向编辑，通过 CONTEXT_DATA 能力向子组件暴露表单数据。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes children 内放 r-* 字段组件用于编辑 currentRow
 * @notes dock='toolbar' 声明工具栏节点
 */
/**
 * RendererForm - 表单容器组件
 */
import { ref } from 'vue'
import { SparkComponentRenderer } from '../../../internal'
import { nodeId, type SparkNode } from '../../../internal'
import type { RFormProps } from './RendererForm.props'
import { useFormDetailContainer } from '../../context/useFormDetailContainer'
import RendererHostScope from '../../support/RendererHostScope.vue'
import type { RendererFormApi } from './types'
import { createRendererFormZeroCode } from './zero-code'
import type { SparkComponentHost } from '../../../internal'

const props = withDefaults(defineProps<RFormProps>(), {
  type: 'r-form',
  labelWidth: '100px',
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
  ...(props.toolbar !== undefined ? { toolbar: props.toolbar } : {}),
  ...(props.children !== undefined ? { children: props.children } : {}),
  ...(props.dataSource !== undefined ? { dataSource: props.dataSource } : {}),
  dataKey: props.dataKey,
  gridColumns: props.gridColumns,
  gridGap: props.gridGap,
  gridAutoRows: props.gridAutoRows,
}, 'r-form')

const nativeFormRef = ref<unknown>(null)
const {
  formApi,
  isBuiltinActionDisabled,
  handleBuiltinToolbarAction,
}: {
  formApi: RendererFormApi
  isBuiltinActionDisabled: (action: SparkNode) => boolean
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

const toolbarHost: SparkComponentHost = {
  isDisabled(action) {
    return isBuiltinActionDisabled(action)
  },
  execute(action) {
    handleBuiltinToolbarAction(action)
  },
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
