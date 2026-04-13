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
        v-for="(child, index) in gridChildren"
        :key="nodeId(child) ?? `r-section-child-${index}`"
        class="renderer-section-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-bind="getDefaultSlotScope()" />
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
        v-for="(child, index) in gridChildren"
        :key="nodeId(child) ?? `r-section-child-${index}`"
        class="renderer-section-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-bind="getDefaultSlotScope()" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-section
 * @description 分区容器（别名 r-block），可选 el-card 包装，支持标题/描述/折叠/头部操作区。
 * @category container
 * @notes dock='header' 声明头部操作区
 * @notes r-block 是此组件的别名，功能完全一致
 */
import { computed, useAttrs, useSlots } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../../internal'
import type { HeaderNode } from '../../RendererHeader.types'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { RendererSectionApi } from './types'
import { createRendererSectionZeroCode } from './zero-code'
import { useControlledValue } from '../state'

interface RendererSectionProps {
  type?: 'r-section'
  /** 子节点 */
  children?: SparkNode[]
  /** 结构化头部 */
  header?: HeaderNode
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

const props = withDefaults(defineProps<RendererSectionProps>(), {
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
const { registerApi } = useSparkPageComponent(props)

// 子节点类型已由绑定层从 children 提升为 props（header）
const contentChildren = computed(() => props.children ?? [])

function readStringAttr(name: string): string {
  const value = attrs[name]
  return typeof value === 'string' ? value : ''
}

const headerClassValue = computed(() => props.header?.props?.class ?? readStringAttr('headerClass'))
const headerActionsClassValue = computed(() => readStringAttr('headerActionsClass'))

const headerActionConfigs = computed(() => getSparkNodeChildren(props.header?.children))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getSparkNodeChildren(contentChildren.value)),
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
