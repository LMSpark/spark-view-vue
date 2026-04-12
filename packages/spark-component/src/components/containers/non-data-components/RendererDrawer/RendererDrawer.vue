<!--
/**
 * @skill r-drawer
 * @description 抽屉容器，支持 `r-header` / `r-footer` wrapper 动作区和 24 列 Grid 内容区
 * @input { props: { modelValue?: boolean, title?: string }, children?: [{ type: 'r-header'|'r-footer'|string, props?: Record<string, unknown>, children?: SparkNode[] }] }
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
      <div
        v-for="(child, index) in gridChildren"
        :key="nodeId(child) ?? `r-drawer-child-${index}`"
        class="renderer-drawer-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-bind="getDefaultSlotScope()" />
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
/**
 * @skill r-drawer
 * @description 抽屉容器，基于 el-drawer 侧滑面板，支持 header/footer dock 和网格主体布局。
 * @category container
 * @notes dock='header' 声明头部动作区；dock='footer' 声明底部动作区
 */
import { computed, useAttrs, useSlots } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../../internal'
import type { FooterNode } from '../../RendererFooter.types'
import type { HeaderNode } from '../../RendererHeader.types'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { RendererDrawerApi } from './types'
import { createRendererDrawerZeroCode } from './zero-code'

interface Props extends SparkNode {
  /** 子节点 */
  children?: SparkNode[]
  /** 结构化头部 */
  header?: HeaderNode
  /** 结构化底部 */
  footer?: FooterNode
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
const { registerApi } = useSparkPageComponent(props)

// 子节点类型已由绑定层从 children 提升为 props（header / footer）
const contentChildren = computed(() => props.children ?? [])

function readStringAttr(name: string): string {
  const value = attrs[name]
  return typeof value === 'string' ? value : ''
}

const headerClassValue = computed(() => props.header?.props?.class ?? readStringAttr('headerClass'))
const headerActionsClassValue = computed(() => readStringAttr('headerActionsClass'))
const footerClassValue = computed(() => props.footer?.props?.class ?? readStringAttr('footerClass'))

const resolvedTitle = computed(() => props.title || '')
const headerActionConfigs = computed(() => getSparkNodeChildren(props.header?.children))
const footerActionConfigs = computed(() => getSparkNodeChildren(props.footer?.children))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getSparkNodeChildren(contentChildren.value)),
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
