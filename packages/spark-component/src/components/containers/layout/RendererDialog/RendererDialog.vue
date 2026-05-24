<template>
  <el-dialog
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
          <slot name="header-actions" v-bind="getHeaderScope()" />
        </div>
      </div>
    </template>

    <div :class="['renderer-dialog-body', bodyClass]" :style="gridStyle">
        <div
          v-for="(child, index) in gridChildren"
          :key="nodeId(child) ?? `r-dialog-child-${index}`"
          class="renderer-dialog-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <slot v-bind="getDefaultScope()" />
    </div>

    <template v-if="showFooter" #footer>
      <div :class="['renderer-dialog-footer', footerClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in footerActionConfigs"
          :key="nodeId(action) ?? `r-dialog-footer-${index}`"
          :config="action"
        />
        <slot name="footer" v-bind="getFooterScope()" />
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * @skill r-dialog
 * @description 对话框容器，支持结构化 header/footer 区域和网格主体布局。
 * @category container
 * @notes 头部动作区与底部区域通过结构化 `header` / `footer` 声明
 */
import { computed, getCurrentInstance, useSlots } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId } from '../../../internal'
import type { RDialogProps } from './RendererDialog.props'
import { useContainerGrid } from '../../runtime/container-layout'
import type { RendererDialogApi } from './types'
import { createVisibilityContainerZeroCode } from '../../support/visibility-container-zero-code'
import { useUnifiedValueBridge } from '../state'

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
  'update:modelValue': [value: boolean]
}>()

const instance = getCurrentInstance()
const slots = useSlots()
const { registerApi } = useSparkPageComponent(props)

// 头/尾区域优先通过 props.header / props.footer 输入。
const contentChildren = computed(() => props.children ?? [])

const headerClassValue = computed(() => String(props.header?.class ?? ''))
const headerActionsClassValue = computed(() => '')
const footerClassValue = computed(() => String(props.footer?.class ?? ''))

const resolvedTitle = computed(() => props.title || '')
const headerActionConfigs = computed(() => getSparkNodeChildren(props.header?.children))
const footerActionConfigs = computed(() => getSparkNodeChildren(props.footer?.children))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getSparkNodeChildren(contentChildren.value)),
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const {
  state: visibleValue,
  commitValue: commitVisibleValue,
} = useUnifiedValueBridge<boolean>({
  value: computed(() => hasExplicitModelValue() ? props.modelValue : props.value),
  fallbackValue: false,
  normalize: value => value ?? false,
  emitValue: value => emit('update:modelValue', value),
})
const scopedVisibleValue = computed(() => (hasExplicitModelValue() ? props.modelValue : props.value) ?? visibleValue.value)
const hasHeaderActions = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined)
const hasHeader = computed(() => resolvedTitle.value.length > 0 || hasHeaderActions.value)
const showFooter = computed(() => footerActionConfigs.value.length > 0 || slots['footer'] !== undefined)

function closeDialog(): void {
  commitVisibleValue(false)
}

function hasExplicitModelValue(): boolean {
  const rawProps = instance?.vnode.props
  return rawProps !== null &&
    rawProps !== undefined &&
    (
      Object.prototype.hasOwnProperty.call(rawProps, 'modelValue') ||
      Object.prototype.hasOwnProperty.call(rawProps, 'model-value')
    )
}

// ── r-dialog 包装 API ────────────────────────────────────────────────────

const {
  api: dialogApi,
  handleModelUpdate,
  handleOpen,
  handleClose,
  handleOpened,
  handleClosed,
}: {
  api: RendererDialogApi
  handleModelUpdate: (value: boolean) => void
  handleOpen: () => void
  handleClose: () => void
  handleOpened: () => void
  handleClosed: () => void
} = createVisibilityContainerZeroCode({
  visibleValue,
  commitVisibleValue,
  onOpen: props.onOpen,
  onClose: props.onClose,
  onOpened: props.onOpened,
  onClosed: props.onClosed,
})

registerApi(dialogApi)


function getHeaderScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDialog,
  }
}

function getDefaultScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDialog,
  }
}

function getFooterScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
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
