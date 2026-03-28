<!--
/**
 * @skill r-drawer
 * @description 抽屉容器，支持 header/footer dock 动作区和 24 列 Grid 内容区
 * @input { props: { modelValue?: boolean, title?: string, docks?: { header?: { class?: string }, footer?: { class?: string } } } }
 * @example { "type": "r-drawer", "props": { "title": "详情", "modelValue": true }, "children": [] }
 */
-->
<template>
  <el-drawer
    v-bind="$attrs"
    :model-value="visibleValue"
    @update:model-value="handleModelUpdate"
    @open="handleOpen"
    @close="handleClose"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <template v-if="hasHeader" #header>
      <div :class="['renderer-drawer-header', headerClassValue]">
        <div class="renderer-drawer-title">{{ resolvedTitle }}</div>
        <div v-if="hasHeaderActions" :class="['renderer-drawer-header-actions', headerActionsClassValue]">
          <SparkComponentRenderer
            v-for="(action, index) in headerActionConfigs"
            :key="nodeId(action) ?? `r-drawer-header-${index}`"
            :config="action"
          />
          <slot name="header-actions" v-bind="getHeaderSlotScope()" />
        </div>
      </div>
    </template>

    <div :class="['renderer-drawer-body', bodyClass]" :style="gridStyle">
      <template v-if="gridChildren.length">
        <div
          v-for="(child, index) in gridChildren"
          :key="nodeId(child) ?? `r-drawer-child-${index}`"
          class="renderer-drawer-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot v-else v-bind="getDefaultSlotScope()" />
    </div>

    <template v-if="showFooter" #footer>
      <div :class="['renderer-drawer-footer', footerClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in footerActionConfigs"
          :key="nodeId(action) ?? `r-drawer-footer-${index}`"
          :config="action"
        />
        <slot name="footer" v-bind="getFooterSlotScope()" />
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, useAttrs, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../../../internal'
import { getDockedChildren, nodeId, type SparkNode } from '../../../internal'
import type { ContainerDocks } from '../../../../core/types'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { RendererDrawerApi } from './types'
import { createRendererDrawerZeroCode } from './zero-code'

interface Props extends SparkNode {
  /** 子节点 */
  children?: SparkNode[]
  /** dock 布局配置 */
  docks?: ContainerDocks
  /** 抽屉标题 */
  title?: string
  /** 控制显隐（v-model） */
  modelValue?: boolean
  /** 内容区 CSS 类名 */
  bodyClass?: string
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 打开回调 */
  onOpen?: () => void
  /** 关闭回调 */
  onClose?: () => void
  /** 打开动画结束回调 */
  onOpened?: () => void
  /** 关闭动画结束回调 */
  onClosed?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-drawer',
  title: '',
  modelValue: false,
  bodyClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const attrs = useAttrs()
const slots = useSlots()
const { registerApi } = useSparkComponent(props)

function readStringAttr(name: string): string {
  const value = attrs[name]
  return typeof value === 'string' ? value : ''
}

const headerClassValue = computed(() => props.docks?.header?.class ?? readStringAttr('headerClass'))
const headerActionsClassValue = computed(() => readStringAttr('headerActionsClass'))
const footerClassValue = computed(() => props.docks?.footer?.class ?? readStringAttr('footerClass'))

assertNoLegacyDrawerStructures()

const resolvedTitle = computed(() => props.title || '')
const configChildren = computed(() => props.children ?? [])
const headerActionConfigs = computed(() => getDockedChildren(configChildren.value, 'header'))
const footerActionConfigs = computed(() => getDockedChildren(configChildren.value, 'footer'))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getDockedChildren(configChildren.value)),
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const visibleValue = computed(() => props.modelValue ?? false)
const hasHeaderActions = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined)
const hasHeader = computed(() => resolvedTitle.value.length > 0 || hasHeaderActions.value)
const showFooter = computed(() => footerActionConfigs.value.length > 0 || slots['footer'] !== undefined)

function closeDrawer(): void {
  emit('update:modelValue', false)
}

// ── r-drawer 包装 API ────────────────────────────────────────────────────

const {
  drawerApi,
  handleModelUpdate,
  handleOpen,
  handleClose,
  handleOpened,
  handleClosed,
}: {
  drawerApi: RendererDrawerApi
  handleModelUpdate: (value: boolean) => void
  handleOpen: () => void
  handleClose: () => void
  handleOpened: () => void
  handleClosed: () => void
} = createRendererDrawerZeroCode({
  emit,
  visibleValue,
  onOpen: props.onOpen,
  onClose: props.onClose,
  onOpened: props.onOpened,
  onClosed: props.onClosed,
})

registerApi(drawerApi)

defineExpose(drawerApi)

function getHeaderSlotScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDrawer,
  }
}

function getDefaultSlotScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDrawer,
  }
}

function getFooterSlotScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDrawer,
  }
}

function assertNoLegacyDrawerStructures(): void {
  if (Array.isArray(attrs['headerActions']) && attrs['headerActions'].length > 0) {
    throw new Error('[RendererDrawer] props.headerActions 已废除。请将头部动作节点移动到 children，并声明 dock: "header"。')
  }
  if (Array.isArray(attrs['footerActions']) && attrs['footerActions'].length > 0) {
    throw new Error('[RendererDrawer] props.footerActions 已废除。请将底部动作节点移动到 children，并声明 dock: "footer"。')
  }
}
</script>

<style scoped>
.renderer-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.renderer-drawer-title {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.renderer-drawer-header-actions,
.renderer-drawer-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-drawer-body {
  width: 100%;
}

.renderer-drawer-grid-item {
  min-width: 0;
}
</style>
