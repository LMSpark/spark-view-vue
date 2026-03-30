<!--
/**
 * @skill (internal) list-item-scope
 * @description r-list 列表项作用域组件，为每行数据提供 DATA_ROW 能力；字段语义由祖先 context.type 推断
 */
-->
<template>
  <div :class="itemClass" :style="itemStyle">
    <el-card v-if="useCard" :shadow="cardShadow" class="renderer-list-card">
      <div class="renderer-list-item-body" :style="gridStyle">
        <SparkChildrenBridge :spark-children="gridChildren" :parent-context="context">
          <template #spark="{ child, index }">
            <div
              :key="nodeId(child) ?? `r-list-item-child-${index}`"
              class="renderer-list-grid-item"
              :style="getChildGridStyle(child)"
            >
              <SparkComponentRenderer :config="child" />
            </div>
          </template>
          <slot />
        </SparkChildrenBridge>
      </div>
    </el-card>

    <div v-else class="renderer-list-item-body" :style="gridStyle">
      <SparkChildrenBridge :spark-children="gridChildren" :parent-context="context">
        <template #spark="{ child, index }">
          <div
            :key="nodeId(child) ?? `r-list-item-child-${index}`"
            class="renderer-list-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </template>
        <slot />
      </SparkChildrenBridge>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import { SparkChildrenBridge, SparkComponentRenderer } from '../../internal'
import { nodeId, type SparkNode } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from '../layout/useContainerGrid'
import { useDataScope } from '../context/useDataScope'

interface Props extends SparkNode {
  /** 当前行数据 */
  row: IDataRow
  /** 子组件配置 */
  children: SparkNode[]
  /** 列表项 CSS 类名 */
  itemClass?: string
  /** 列表项行内样式 */
  itemStyle?: CSSProperties
  /** 使用卡片包裹 */
  useCard?: boolean
  /** 卡片阴影模式 */
  cardShadow?: 'always' | 'hover' | 'never'
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-list-item',
  itemClass: '',
  itemStyle: () => ({}),
  useCard: false,
  cardShadow: 'hover',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})
const { context } = useDataScope({
  type: props.type,
  nodeConfig: {
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
  },
  data: computed(() => props.row),
})

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: () => props.children,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
})
</script>

<style scoped>
.renderer-list-card {
  height: 100%;
}

.renderer-list-item-body {
  width: 100%;
}

.renderer-list-grid-item {
  min-width: 0;
}
</style>
