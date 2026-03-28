<!--
/**
 * @skill r-section
 * @description 分组块容器，支持标题、描述、折叠、header dock 动作区和 24 列网格布局；r-block 为其别名
 * @input { props: { title?: string, description?: string, collapsible?: boolean, defaultCollapsed?: boolean } }
 * @example { "type": "r-section", "props": { "title": "基本信息" }, "children": [] }
 */
-->
<template>
  <el-card v-if="useCard" :shadow="cardShadow" class="renderer-section renderer-section--card">
    <template v-if="hasHeader || collapsible" #header>
      <div :class="['renderer-section-header', headerClassValue]" @click="handleHeaderClick">
        <div class="renderer-section-heading">
          <div v-if="title" class="renderer-section-title">{{ title }}</div>
          <div v-if="description" class="renderer-section-description">{{ description }}</div>
        </div>
        <div v-if="hasHeaderRight" :class="['renderer-section-actions', headerActionsClassValue]" @click.stop>
          <SparkComponentRenderer
            v-for="(action, index) in headerActionConfigs"
            :key="nodeId(action) ?? `r-section-action-${index}`"
            :config="action"
          />
          <slot name="header-actions" v-bind="getHeaderSlotScope()" />
          <button
            v-if="collapsible"
            type="button"
            class="renderer-section-toggle"
            :aria-expanded="!collapsed"
            @click.stop="toggleCollapsed"
          >
            <span v-if="showToggleIcon" class="renderer-section-toggle-icon">{{ collapsed ? expandIconText : collapseIconText }}</span>
            <span>{{ collapsed ? expandText : collapseText }}</span>
          </button>
        </div>
      </div>
    </template>

    <div v-show="!collapsed" :class="['renderer-section-body', bodyClass]" :style="gridStyle">
      <div
        v-for="(child, i) in gridChildren"
        :key="nodeId(child) ?? `r-section-child-${i}`"
        class="renderer-section-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-if="!gridChildren.length" v-bind="getDefaultSlotScope()" />
    </div>
  </el-card>

  <div v-else :class="['renderer-section', { 'renderer-section--bordered': bordered }]">
    <div v-if="hasHeader || collapsible" :class="['renderer-section-header', headerClassValue]" @click="handleHeaderClick">
      <div class="renderer-section-heading">
        <div v-if="title" class="renderer-section-title">{{ title }}</div>
        <div v-if="description" class="renderer-section-description">{{ description }}</div>
      </div>
      <div v-if="hasHeaderRight" :class="['renderer-section-actions', headerActionsClassValue]" @click.stop>
        <SparkComponentRenderer
          v-for="(action, index) in headerActionConfigs"
          :key="nodeId(action) ?? `r-section-action-${index}`"
          :config="action"
        />
        <slot name="header-actions" v-bind="getHeaderSlotScope()" />
        <button
          v-if="collapsible"
          type="button"
          class="renderer-section-toggle"
          :aria-expanded="!collapsed"
          @click.stop="toggleCollapsed"
        >
          <span v-if="showToggleIcon" class="renderer-section-toggle-icon">{{ collapsed ? expandIconText : collapseIconText }}</span>
          <span>{{ collapsed ? expandText : collapseText }}</span>
        </button>
      </div>
    </div>

    <div v-show="!collapsed" :class="['renderer-section-body', bodyClass]" :style="gridStyle">
      <div
        v-for="(child, i) in gridChildren"
        :key="nodeId(child) ?? `r-section-child-${i}`"
        class="renderer-section-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-if="!gridChildren.length" v-bind="getDefaultSlotScope()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../../../internal'
import { getDockedChildren, nodeId, type SparkNode } from '../../../internal'
import type { ContainerDocks } from '../../../../core/types'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { RendererSectionApi } from './types'
import { createRendererSectionZeroCode } from './zero-code'
import { useControlledValue } from '../state'

interface Props extends SparkNode {
  /** 子节点 */
  children?: SparkNode[]
  /** dock 布局配置 */
  docks?: ContainerDocks
  /** 分区标题 */
  title?: string
  /** 分区描述 */
  description?: string
  /** 是否可折叠 */
  collapsible?: boolean
  /** 默认折叠 */
  defaultCollapsed?: boolean
  /** 显示边框 */
  bordered?: boolean
  /** 使用卡片样式 */
  useCard?: boolean
  /** 卡片阴影模式 */
  cardShadow?: 'always' | 'hover' | 'never'
  /** 内容区 CSS 类名 */
  bodyClass?: string
  /** 展开文案 */
  expandText?: string
  /** 收起文案 */
  collapseText?: string
  /** 显示切换图标 */
  showToggleIcon?: boolean
  /** 展开图标文案 */
  expandIconText?: string
  /** 收起图标文案 */
  collapseIconText?: string
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-section',
  title: '',
  description: '',
  collapsible: false,
  defaultCollapsed: false,
  bordered: true,
  useCard: false,
  cardShadow: 'never',
  bodyClass: '',
  expandText: '展开',
  collapseText: '收起',
  showToggleIcon: true,
  expandIconText: '>',
  collapseIconText: 'v',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})
const attrs = useAttrs()
const slots = useSlots()
const { registerApi } = useSparkComponent(props)

function readStringAttr(name: string): string {
  const value = attrs[name]
  return typeof value === 'string' ? value : ''
}

const headerClassValue = computed(() => props.docks?.header?.class ?? readStringAttr('headerClass'))
const headerActionsClassValue = computed(() => readStringAttr('headerActionsClass'))

assertNoLegacySectionStructures()

const configChildren = computed(() => props.children ?? [])
const headerActionConfigs = computed(() => getDockedChildren(configChildren.value, 'header'))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getDockedChildren(configChildren.value)),
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const collapsed = useControlledValue(computed(() => props.defaultCollapsed))
const hasHeader = computed(() => Boolean(props.title || props.description))
const hasHeaderRight = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined || props.collapsible)

// ── r-section 包装 API ───────────────────────────────────────────────────

const { sectionApi, handleHeaderClick, toggleCollapsed }: {
  sectionApi: RendererSectionApi
  handleHeaderClick: () => void
  toggleCollapsed: () => void
} = createRendererSectionZeroCode({
  collapsed,
  collapsible: computed(() => props.collapsible),
})

registerApi(sectionApi)

defineExpose(sectionApi)

function getHeaderSlotScope() {
  return {
    title: props.title,
    description: props.description,
    collapsed: collapsed.value,
    toggleCollapsed,
  }
}

function getDefaultSlotScope() {
  return {
    title: props.title,
    description: props.description,
    collapsed: collapsed.value,
    toggleCollapsed,
  }
}

function assertNoLegacySectionStructures(): void {
  if (Array.isArray(attrs['headerActions']) && attrs['headerActions'].length > 0) {
    throw new Error('[RendererSection] props.headerActions 已废除。请将头部动作节点移动到 children，并声明 dock: "header"。')
  }
}
</script>

<style scoped>
.renderer-section {
  width: 100%;
}

.renderer-section--bordered {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fff;
}

.renderer-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
}

.renderer-section-heading {
  min-width: 0;
}

.renderer-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  line-height: 1.4;
}

.renderer-section-description {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.renderer-section-toggle {
  border: 0;
  background: transparent;
  color: #409eff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  line-height: 1.5;
}

.renderer-section-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.renderer-section-toggle-icon {
  display: inline-flex;
  width: 12px;
  justify-content: center;
}

.renderer-section-body {
  padding: 16px;
}

.renderer-section-grid-item {
  min-width: 0;
}
</style>
