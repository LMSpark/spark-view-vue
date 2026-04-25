<template>
  <el-dialog
    v-bind="hostProps"
    :model-value="visibleValue"
    @update:model-value="handleModelUpdate"
    @open="handleOpen"
    @close="handleClose"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <template v-if="hasHeader" #header>
      <div :class="['renderer-dialog-header', headerClassValue]">
        <div class="renderer-dialog-title">{{ resolvedTitle }}</div>
        <div v-if="hasHeaderActions" :class="['renderer-dialog-header-actions', headerActionsClassValue]">
          <SparkComponentRenderer
            v-for="(action, index) in headerActionConfigs"
            :key="nodeId(action) ?? `r-dialog-header-${index}`"
            :config="action"
          />
          <slot name="header-actions" v-bind="getHeaderSlotScope()" />
        </div>
      </div>
    </template>

    <RendererHostScope type="r-dialog-field-scope" :field-mode="'detail'">
      <div :class="['renderer-dialog-body', bodyClass]" :style="gridStyle">
        <div
          v-for="(child, index) in gridChildren"
          :key="nodeId(child) ?? `r-dialog-child-${index}`"
          class="renderer-dialog-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <slot v-bind="getDefaultSlotScope()" />
      </div>
    </RendererHostScope>

    <template v-if="showFooter" #footer>
      <div :class="['renderer-dialog-footer', footerClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in footerActionConfigs"
          :key="nodeId(action) ?? `r-dialog-footer-${index}`"
          :config="action"
        />
        <slot name="footer" v-bind="getFooterSlotScope()" />
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * @skill r-dialog
 * @description 对话框容器，支持 header/footer dock 和网格主体布局。
 * @category container
 * @notes dock='header' 声明头部动作区；dock='footer' 声明底部动作区
 */
import { computed, useSlots } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId } from '../../../internal'
import type { RDialogProps } from './RendererDialog.props'
import { useContainerGrid } from '../../layout/useContainerGrid'
import RendererHostScope from '../../support/RendererHostScope.vue'
import type { RendererDialogApi } from './types'
import { createRendererDialogZeroCode } from './zero-code'
import { useMirroredValue } from '../state'

const props = withDefaults(defineProps<RDialogProps>(), {
  type: 'r-dialog',
  title: '',
  value: false,
  bodyClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const emit = defineEmits<{
  'update:value': [value: boolean]
}>()

const slots = useSlots()
const { registerApi } = useSparkPageComponent(props)

// 子节点类型已由绑定层从 children 提升为 props（header / footer）
const contentChildren = computed(() => props.children ?? [])

const headerClassValue = computed(() => String(props.header?.props?.class ?? ''))
const headerActionsClassValue = computed(() => '')
const footerClassValue = computed(() => String(props.footer?.props?.class ?? ''))

const resolvedTitle = computed(() => props.title || '')
const headerActionConfigs = computed(() => getSparkNodeChildren(props.header?.children))
const footerActionConfigs = computed(() => getSparkNodeChildren(props.footer?.children))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getSparkNodeChildren(contentChildren.value)),
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const visibleValue = useMirroredValue(computed(() => props.value ?? false))
const hasHeaderActions = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined)
const hasHeader = computed(() => resolvedTitle.value.length > 0 || hasHeaderActions.value)
const showFooter = computed(() => footerActionConfigs.value.length > 0 || slots['footer'] !== undefined)

function closeDialog(): void {
  emit('update:value', false)
}

// ── r-dialog 包装 API ────────────────────────────────────────────────────

const {
  dialogApi,
  handleModelUpdate,
  handleOpen,
  handleClose,
  handleOpened,
  handleClosed,
}: {
  dialogApi: RendererDialogApi
  handleModelUpdate: (value: boolean) => void
  handleOpen: () => void
  handleClose: () => void
  handleOpened: () => void
  handleClosed: () => void
} = createRendererDialogZeroCode({
  emit,
  visibleValue,
  onOpen: props.onOpen,
  onClose: props.onClose,
  onOpened: props.onOpened,
  onClosed: props.onClosed,
})

registerApi(dialogApi)


function getHeaderSlotScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDialog,
  }
}

function getDefaultSlotScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDialog,
  }
}

function getFooterSlotScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDialog,
  }
}
</script>

<style scoped>
.renderer-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.renderer-dialog-title {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.renderer-dialog-header-actions,
.renderer-dialog-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-dialog-body {
  width: 100%;
}

.renderer-dialog-grid-item {
  min-width: 0;
}
</style>


