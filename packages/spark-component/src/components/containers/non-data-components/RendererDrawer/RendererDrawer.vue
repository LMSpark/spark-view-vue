<template>
  <el-drawer
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
          <slot name="header-actions" v-bind="getHeaderScope()" />
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
        <slot v-bind="getDefaultScope()" />
    </div>

    <template v-if="showFooter" #footer>
      <div :class="['renderer-drawer-footer', footerClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in footerActionConfigs"
          :key="nodeId(action) ?? `r-drawer-footer-${index}`"
          :config="action"
        />
        <slot name="footer" v-bind="getFooterScope()" />
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * @skill r-drawer
 * @description 抽屉容器，支持结构化 header/footer 区域和网格主体布局。
 * @category container
 * @notes 头部动作区与底部区域通过结构化 `header` / `footer` 声明
 */
import { computed, useSlots } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId } from '../../../internal'
import type { RDrawerProps } from './RendererDrawer.props'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { RendererDrawerApi } from './types'
import { createRendererDrawerZeroCode } from './zero-code'
import { useUnifiedValueBridge } from '../state'

const props = withDefaults(defineProps<RDrawerProps>(), {
  type: 'r-drawer',
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
  value: computed(() => props.modelValue),
  fallbackValue: false,
  normalize: value => value ?? false,
  emitValue: value => emit('update:modelValue', value),
})
const hasHeaderActions = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined)
const hasHeader = computed(() => resolvedTitle.value.length > 0 || hasHeaderActions.value)
const showFooter = computed(() => footerActionConfigs.value.length > 0 || slots['footer'] !== undefined)

function closeDrawer(): void {
  commitVisibleValue(false)
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
  visibleValue,
  commitVisibleValue,
  onOpen: props.onOpen,
  onClose: props.onClose,
  onOpened: props.onOpened,
  onClosed: props.onClosed,
})

registerApi(drawerApi)


function getHeaderScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDrawer,
  }
}

function getDefaultScope() {
  return {
    title: resolvedTitle.value,
    visible: visibleValue.value,
    close: closeDrawer,
  }
}

function getFooterScope() {
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


