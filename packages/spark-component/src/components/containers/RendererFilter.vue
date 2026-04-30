<template>
  <div v-if="isPanelMode && resolvedConfigs.length > 0" class="renderer-table-filters">
    <div v-if="props.collapsible" class="renderer-table-filters__header">
      <div class="renderer-table-filters__heading">
        <span class="renderer-table-filters__title">筛选条件</span>
        <el-tag
          v-if="resolvedActiveCount > 0"
          size="small"
          type="info"
          class="renderer-table-filters__count"
        >{{ resolvedActiveCount }} 项筛选</el-tag>
      </div>
      <button
        type="button"
        class="renderer-table-filters__toggle"
        :class="{ 'is-collapsed': resolvedCollapsed }"
        :aria-expanded="!resolvedCollapsed"
        @click="handleToggleCollapsed"
      >
        <span class="renderer-table-filters__toggle-icon" aria-hidden="true">></span>
        <span class="renderer-table-filters__toggle-text">{{ resolvedCollapsed ? '展开筛选' : '收起筛选' }}</span>
      </button>
    </div>

    <div v-show="!resolvedCollapsed" class="renderer-table-filters__content">
      <div class="renderer-table-filters__body">
        <SparkComponentRenderer :config="fieldScopeConfig" />
      </div>
      <div class="renderer-table-filters__actions" :style="resolvedActionsStyle">
        <el-button type="primary" size="small" @click="handleSearch">查询</el-button>
        <el-button size="small" @click="handleReset">重置</el-button>
        <el-tag
          v-if="resolvedActiveCount > 0 && !props.collapsible"
          size="small"
          type="info"
          class="renderer-table-filters__count"
        >{{ resolvedActiveCount }} 项筛选</el-tag>
      </div>
    </div>
  </div>

  <div v-else-if="standaloneChildren.length > 0" class="renderer-filter">
    <SparkComponentRenderer
      v-for="(child, i) in standaloneChildren"
      :key="nodeId(child) ?? `r-filter-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-filter
 * @description 筛选区组件，独立使用时仅渲染 wrapper 子节点；被 r-table 复用时负责筛选面板壳、折叠和操作按钮。
 */
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import { PAGE_PERMISSION_MODE } from '../../permission'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, nodeInputProp, type SparkNode, useSparkComponent } from '../internal'
import type { RendererFilterProps as Props } from './RendererFilter.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-filter',
})

function isRecordObject(value: unknown): value is IDataRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPanelModel(value: unknown): asserts value is IDataRow {
  if (value === undefined || isRecordObject(value)) return
  throw new Error('RendererFilter: panel 模式下 model 必须是对象')
}

function assertPanelConfigs(value: unknown): asserts value is SparkNode[] {
  if (value === undefined || Array.isArray(value)) return
  throw new Error('RendererFilter: panel 模式下 configs 必须是节点数组')
}

assertPanelModel(props.model)
assertPanelConfigs(props.configs)

const standaloneChildren = computed(() => {
  const source = props.children ?? props.configs
  return getSparkNodeChildren(source)
})
const resolvedConfigs = computed(() => props.configs ?? standaloneChildren.value)
const isPanelMode = computed(() => props.model !== undefined && props.configs !== undefined)
const resolvedModel = computed<IDataRow>(() => props.model ?? {})
const resolvedFilterModel = computed<IDataRow>(() => resolvedModel.value)
const resolvedActiveCount = computed(() => props.activeCount ?? 0)
const resolvedCollapsed = computed(() => props.collapsed ?? false)
const resolvedGridColumns = computed(() => props.gridColumns ?? 24)
const resolvedGridGap = computed(() => props.gridGap ?? 12)
const resolvedGridAutoRows = computed(() => props.gridAutoRows ?? 'minmax(32px, auto)')

function isWideFilterConfig(config: SparkNode): boolean {
  const filterMode = nodeInputProp(config, 'filterMode')
  if (filterMode === 'range') return true
  return config.type === 'r-multi-select' || config.type === 'r-date'
}

function getSmartAutoFitMinWidth(configs: SparkNode[]): string {
  const count = configs.length
  const hasWideField = configs.some(isWideFilterConfig)

  if (count <= 1) return hasWideField ? '360px' : '320px'
  if (count === 2) return hasWideField ? '300px' : '260px'
  if (count === 3) return hasWideField ? '240px' : '220px'
  if (count === 4) return hasWideField ? '220px' : '200px'
  return hasWideField ? '210px' : '190px'
}

const resolvedAutoFitMinWidth = computed(() => {
  const raw = (props.autoFitMinWidth ?? '').trim()
  if (raw.length > 0) return raw
  return getSmartAutoFitMinWidth(resolvedConfigs.value)
})
const resolvedItemSpan = computed(() => props.itemSpan ?? 1)
const resolvedActionSpan = computed(() => {
  const fallback = resolvedItemSpan.value
  const raw = props.actionSpan ?? fallback
  const normalized = Number.isFinite(raw) ? Number(raw) : fallback
  const min = Math.max(1, Math.floor(normalized))
  return Math.min(min, Math.max(1, Math.floor(resolvedGridColumns.value)))
})

const resolvedActionsStyle = computed<Record<string, string>>(() => {
  const minWidthRaw = resolvedAutoFitMinWidth.value.trim()
  const gap = typeof resolvedGridGap.value === 'number' ? `${resolvedGridGap.value}px` : `${resolvedGridGap.value}`

  if (minWidthRaw.length > 0) {
    return {
      '--renderer-filter-action-span': String(resolvedActionSpan.value),
      '--renderer-filter-min-width': minWidthRaw,
      '--renderer-filter-gap': gap,
    }
  }

  const widthPercent = Math.max(0, Math.min(100, (resolvedActionSpan.value / Math.max(1, resolvedGridColumns.value)) * 100))
  return {
    width: `${widthPercent}%`,
  }
})

const fieldScopeConfig = computed<SparkNode>(() => ({
  type: 'r-field-scope',
  props: {
    model: resolvedFilterModel.value,
    configs: resolvedConfigs.value,
    gridColumns: resolvedGridColumns.value,
    gridGap: resolvedGridGap.value,
    gridAutoRows: resolvedGridAutoRows.value,
    autoFitMinWidth: resolvedAutoFitMinWidth.value,
    defaultColSpan: resolvedItemSpan.value,
    autoFillLastRow: true,
    labelPosition: 'left',
    labelWidth: '80px',
    compact: true,
  },
}))

const { sparkProvide } = useSparkComponent({ type: props.type })
if (isPanelMode.value) {
  sparkProvide(PAGE_PERMISSION_MODE, 'none')
}

async function handleSearch(): Promise<void> {
  await props.searchAction?.()
}

async function handleReset(): Promise<void> {
  await props.resetAction?.()
}

function handleToggleCollapsed() {
  props.toggleCollapsedAction?.()
}
</script>

<style scoped>
.renderer-filter {
  width: 100%;
}

.renderer-table-filters {
  width: 100%;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 4px;
  padding: 12px 16px;
}

.renderer-table-filters__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.renderer-table-filters__heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.renderer-table-filters__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.renderer-table-filters__toggle {
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: var(--el-bg-color, #ffffff);
  color: var(--el-text-color-regular, #606266);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  line-height: 1.3;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.renderer-table-filters__toggle:hover {
  border-color: var(--el-color-primary-light-5, #79bbff);
  color: var(--el-color-primary, #409eff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.renderer-table-filters__toggle:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5, #79bbff);
  outline-offset: 1px;
}

.renderer-table-filters__toggle-icon {
  display: inline-block;
  width: 10px;
  transform: rotate(90deg);
  transform-origin: 50% 50%;
  transition: transform 0.2s ease;
}

.renderer-table-filters__toggle.is-collapsed .renderer-table-filters__toggle-icon {
  transform: rotate(0deg);
}

.renderer-table-filters__toggle-text {
  font-size: 12px;
  font-weight: 500;
}

.renderer-table-filters__body {
  flex: 1;
  min-width: 0;
}

.renderer-table-filters__content {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.renderer-table-filters__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  margin-left: auto;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-extra-light, #f0f2f5);
  inline-size: calc(
    var(--renderer-filter-action-span, 1) * var(--renderer-filter-min-width, 220px)
    + (var(--renderer-filter-action-span, 1) - 1) * var(--renderer-filter-gap, 12px)
  );
  max-inline-size: 100%;
}

.renderer-table-filters__count {
  margin-left: 4px;
}
</style>
