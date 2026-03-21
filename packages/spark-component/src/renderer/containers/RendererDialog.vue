<!--
/**
 * @skill r-dialog
 * @description 对话框容器，支持头部动作、底部动作和 24 列 Grid 内容区
 * @input { props: { modelValue?: boolean, title?: string, headerActions?: SparkNode[], footerActions?: SparkNode[] } }
 * @example { "type": "r-dialog", "props": { "title": "编辑", "modelValue": true }, "children": [] }
 */
-->
<template>
  <el-dialog
    v-bind="$attrs"
    :model-value="visibleValue"
    @update:model-value="handleModelUpdate"
    @open="handleOpen"
    @close="handleClose"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <template v-if="hasHeader" #header>
      <div :class="['renderer-dialog-header', headerClass]">
        <div class="renderer-dialog-title">{{ resolvedTitle }}</div>
        <div v-if="hasHeaderActions" :class="['renderer-dialog-header-actions', headerActionsClass]">
          <SparkComponentRenderer
            v-for="(action, index) in headerActionConfigs"
            :key="action.id ?? `r-dialog-header-${index}`"
            :config="action"
          />
          <slot name="header-actions" v-bind="getHeaderSlotScope()" />
        </div>
      </div>
    </template>

    <div :class="['renderer-dialog-body', bodyClass]" :style="gridStyle">
      <template v-if="gridChildren.length">
        <div
          v-for="(child, index) in gridChildren"
          :key="child.id ?? `r-dialog-child-${index}`"
          class="renderer-dialog-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot v-else v-bind="getDefaultSlotScope()" />
    </div>

    <template v-if="showFooter" #footer>
      <div :class="['renderer-dialog-footer', footerClass]">
        <SparkComponentRenderer
          v-for="(action, index) in footerActionConfigs"
          :key="action.id ?? `r-dialog-footer-${index}`"
          :config="action"
        />
        <slot name="footer" v-bind="getFooterSlotScope()" />
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import { useContainerGrid } from './useContainerGrid'

interface Props {
  config?: SparkNode
  sparkChildren?: SparkNode[]
  title?: string
  modelValue?: boolean
  headerActions?: SparkNode[]
  footerActions?: SparkNode[]
  headerClass?: string
  headerActionsClass?: string
  bodyClass?: string
  footerClass?: string
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
  onOpen?: () => void
  onClose?: () => void
  onOpened?: () => void
  onClosed?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  modelValue: false,
  headerActions: () => [],
  footerActions: () => [],
  headerClass: '',
  headerActionsClass: '',
  bodyClass: '',
  footerClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const slots = useSlots()

useSparkComponent(props.config ?? { type: 'r-dialog' })

const resolvedTitle = computed(() =>
  props.title || (props.config?.props?.['title'] as string | undefined) || ''
)
const headerActionConfigs = computed(() =>
  props.headerActions ?? (props.config?.props?.['headerActions'] as SparkNode[] | undefined) ?? []
)
const footerActionConfigs = computed(() =>
  props.footerActions ?? (props.config?.props?.['footerActions'] as SparkNode[] | undefined) ?? []
)
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => props.config?.children ?? props.sparkChildren ?? []),
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const visibleValue = computed(() =>
  props.modelValue ?? ((props.config?.props?.['modelValue'] as boolean | undefined) ?? false)
)
const hasHeaderActions = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined)
const hasHeader = computed(() => resolvedTitle.value.length > 0 || hasHeaderActions.value)
const showFooter = computed(() => footerActionConfigs.value.length > 0 || slots['footer'] !== undefined)

function closeDialog(): void {
  emit('update:modelValue', false)
}

function handleModelUpdate(value: boolean): void {
  emit('update:modelValue', value)
}

function handleOpen(): void {
  props.onOpen?.()
}

function handleClose(): void {
  props.onClose?.()
}

function handleOpened(): void {
  props.onOpened?.()
}

function handleClosed(): void {
  props.onClosed?.()
}

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