<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-form-toolbar', toolbarClassValue]">
        <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-form-toolbar-${index}`">
          <SparkComponentRenderer :config="action" />
        </template>
    </div>

    <div class="renderer-form-main">
      <el-form ref="nativeFormRef" :model="formModel" :label-width="labelWidth" v-bind="formPropsValue">
        <div class="renderer-form-grid" :style="gridStyle">
          <div
            v-for="(child, index) in gridChildren"
            :key="nodeId(child) ?? `r-form-child-${index}`"
            class="renderer-form-grid-item"
            :style="getChildGridStyle(child)"
          >
            <RendererHostScope :row="formModel">
              <SparkComponentRenderer :config="child" />
            </RendererHostScope>
          </div>
          <slot v-bind="getDefaultScope()" />
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-form
 * @description 数据表单容器，通过 CONTEXT_DATA 能力向子组件暴露表单数据。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @consumes PAGE_DATASET
 * @notes children 内放 r-* 字段组件用于编辑 currentRow
 * @notes 工具栏通过结构化 `toolbar` 区域声明
 */
/**
 * RendererForm - 表单容器组件
 */
import { computed, ref } from 'vue'
import {
  SparkComponentRenderer,
  ACTION_CAPABILITY,
  createActionCapability,
  nodeId,
  type SparkNode,
} from '../../../internal'
import type { RFormProps } from './RendererForm.props'
import { useFormDetailContainer } from '../../composables/useFormDetailContainer'
import { createRendererFormZeroCode } from './zero-code'
import RendererHostScope from '../../support/RendererHostScope.vue'

const props = withDefaults(defineProps<RFormProps>(), {
  type: 'r-form',
  labelWidth: '100px',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const formPropsValue = computed<Record<string, unknown>>(() => ({ ...(props.formProps ?? {}) }))

const {
  registerApi,
  sparkProvide,
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
  getDefaultScope,
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
  handleBuiltinToolbarAction,
  isBuiltinActionDisabled,
} = createRendererFormZeroCode({
  props,
  resolvedView,
  formModel,
  nativeFormRef,
  pageService,
  logger,
})

registerApi(formApi)

const toolbarActionCapability = {
  isDisabled(action: SparkNode): boolean {
    return isBuiltinActionDisabled(action)
  },
  execute(action: SparkNode): void {
    handleBuiltinToolbarAction(action)
  },
}

sparkProvide(ACTION_CAPABILITY, createActionCapability(toolbarActionCapability))

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

