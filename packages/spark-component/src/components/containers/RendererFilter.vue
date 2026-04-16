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
        :aria-expanded="!resolvedCollapsed"
        @click="handleToggleCollapsed"
      >
        <span class="renderer-table-filters__toggle-icon">{{ resolvedCollapsed ? '>' : 'v' }}</span>
        <span>{{ resolvedCollapsed ? '展开筛选' : '收起筛选' }}</span>
      </button>
    </div>

    <div v-show="!resolvedCollapsed" class="renderer-table-filters__content">
      <div class="renderer-table-filters__body">
        <RendererHostDataScope type="r-filter-panel-scope" :host="FILTER_PANEL_HOST">
          <RendererFieldScope
            type="r-field-scope"
            :model="resolvedFilterModel"
            :configs="resolvedConfigs"
            :grid-columns="resolvedGridColumns"
            :grid-gap="resolvedGridGap"
            :grid-auto-rows="resolvedGridAutoRows"
            :auto-fit-min-width="resolvedAutoFitMinWidth"
            :default-col-span="resolvedItemSpan"
            label-position="left"
            label-width="80px"
            compact
          />
        </RendererHostDataScope>
      </div>
      <div class="renderer-table-filters__actions">
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
import type { SparkNode } from '../internal'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkComponent } from '../internal'
import { PAGE_PERMISSION_MODE } from '../../permission'
import RendererHostDataScope from './support/RendererHostDataScope.vue'
import RendererFieldScope from './data-components/RendererFieldScope.vue'
import type { RendererFilterProps as Props } from './RendererFilter.types'
import type { SparkComponentHost } from '../internal'

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

const standaloneChildren = computed(() => getSparkNodeChildren(props.children))
const resolvedConfigs = computed(() => props.configs ?? standaloneChildren.value)
const isPanelMode = computed(() => props.model !== undefined && props.configs !== undefined)
const resolvedModel = computed<IDataRow>(() => props.model ?? {})
const resolvedFilterModel = computed<IDataRow>(() => resolvedModel.value)
const resolvedActiveCount = computed(() => props.activeCount ?? 0)
const resolvedCollapsed = computed(() => props.collapsed ?? false)
const resolvedGridColumns = computed(() => props.gridColumns ?? 24)
const resolvedGridGap = computed(() => props.gridGap ?? 12)
const resolvedGridAutoRows = computed(() => props.gridAutoRows ?? 'minmax(32px, auto)')
const resolvedAutoFitMinWidth = computed(() => props.autoFitMinWidth ?? '220px')
const resolvedItemSpan = computed(() => props.itemSpan ?? 1)

const FILTER_PANEL_HOST: SparkComponentHost = {
  variant: 'field',
  fieldMode: 'form',
}

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
  border: 0;
  background: transparent;
  color: var(--el-color-primary, #409eff);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  line-height: 1.5;
}

.renderer-table-filters__toggle-icon {
  display: inline-block;
  width: 10px;
}

.renderer-table-filters__body {
  flex: 1;
  min-width: 0;
}

.renderer-table-filters__content {
  min-width: 0;
}

.renderer-table-filters__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-extra-light, #f0f2f5);
}

.renderer-table-filters__count {
  margin-left: 4px;
}
</style>
