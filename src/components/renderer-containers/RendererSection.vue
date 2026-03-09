<!--
/**
 * @skill r-section
 * @description 分组块容器，支持标题、描述、折叠和 24 列网格布局；r-block 为其别名
 * @input { props: { title?: string, description?: string, collapsible?: boolean, defaultCollapsed?: boolean } }
 * @example { "type": "r-section", "props": { "title": "基本信息" }, "children": [] }
 */
-->
<template>
  <el-card v-if="useCard" :shadow="cardShadow" class="renderer-section renderer-section--card">
    <template v-if="hasHeader || collapsible" #header>
      <div :class="['renderer-section-header', headerClass]" @click="handleHeaderClick">
        <div class="renderer-section-heading">
          <div v-if="title" class="renderer-section-title">{{ title }}</div>
          <div v-if="description" class="renderer-section-description">{{ description }}</div>
        </div>
        <div v-if="hasHeaderRight" :class="['renderer-section-actions', headerActionsClass]" @click.stop>
          <SparkComponentRenderer
            v-for="(action, index) in headerActionConfigs"
            :key="action.id ?? `r-section-action-${index}`"
            :config="action"
          />
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
        :key="child.id ?? `r-section-child-${i}`"
        class="renderer-section-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-if="!gridChildren.length" />
    </div>
  </el-card>

  <div v-else :class="['renderer-section', { 'renderer-section--bordered': bordered }]">
    <div v-if="hasHeader || collapsible" :class="['renderer-section-header', headerClass]" @click="handleHeaderClick">
      <div class="renderer-section-heading">
        <div v-if="title" class="renderer-section-title">{{ title }}</div>
        <div v-if="description" class="renderer-section-description">{{ description }}</div>
      </div>
      <div v-if="hasHeaderRight" :class="['renderer-section-actions', headerActionsClass]" @click.stop>
        <SparkComponentRenderer
          v-for="(action, index) in headerActionConfigs"
          :key="action.id ?? `r-section-action-${index}`"
          :config="action"
        />
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
        :key="child.id ?? `r-section-child-${i}`"
        class="renderer-section-grid-item"
        :style="getChildGridStyle(child)"
      >
        <SparkComponentRenderer :config="child" />
      </div>
      <slot v-if="!gridChildren.length" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useContainerGrid } from './useContainerGrid'

interface Props {
  config?: ComponentConfig
  sparkChildren?: ComponentConfig[]
  headerActions?: ComponentConfig[]
  title?: string
  description?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  bordered?: boolean
  useCard?: boolean
  cardShadow?: 'always' | 'hover' | 'never'
  headerClass?: string
  headerActionsClass?: string
  bodyClass?: string
  expandText?: string
  collapseText?: string
  showToggleIcon?: boolean
  expandIconText?: string
  collapseIconText?: string
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  description: '',
  collapsible: false,
  defaultCollapsed: false,
  bordered: true,
  useCard: false,
  cardShadow: 'never',
  headerClass: '',
  headerActionsClass: '',
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

useSparkComponent(props.config ?? { type: 'r-section' })

const configChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])
const headerActionConfigs = computed(() => props.headerActions ?? (props.config?.props?.['headerActions'] as ComponentConfig[] | undefined) ?? [])
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: configChildren,
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const collapsed = ref(props.defaultCollapsed)
const hasHeader = computed(() => Boolean(props.title || props.description))
const hasHeaderRight = computed(() => headerActionConfigs.value.length > 0 || props.collapsible)

watch(() => props.defaultCollapsed, (value) => {
  collapsed.value = value
})

function handleHeaderClick(): void {
  if (!props.collapsible) return
  collapsed.value = !collapsed.value
}

function toggleCollapsed(): void {
  if (!props.collapsible) return
  collapsed.value = !collapsed.value
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