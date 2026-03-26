<!--
/**
 * @skill (internal) list-item-scope
 * @description r-list 列表项作用域组件，为每行数据提供 CONTEXT_DATA 能力；字段语义由祖先 context.type 推断
 */
-->
<template>
  <div :class="itemClass" :style="itemStyle">
    <el-card v-if="useCard" :shadow="cardShadow" class="renderer-list-card">
      <div class="renderer-list-item-body" :style="itemBodyStyle">
        <template v-if="gridChildren.length">
          <div
            v-for="(child, i) in gridChildren"
            :key="nodeId(child) ?? `r-list-item-child-${i}`"
            class="renderer-list-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </template>
        <slot v-else />
      </div>
    </el-card>

    <div v-else class="renderer-list-item-body" :style="itemBodyStyle">
      <template v-if="gridChildren.length">
        <div
          v-for="(child, i) in gridChildren"
          :key="nodeId(child) ?? `r-list-item-child-${i}`"
          class="renderer-list-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
      </template>
      <slot v-else />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import { SparkComponentRenderer } from '../internal'
import { nodeId, type SparkNode } from '../internal'
import { FIELD_CONTEXT } from '../internal'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from './useContainerGrid'
import { useDataScope } from './useDataScope'

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
const { sparkProvide } = useDataScope({
  type: props.type,
  nodeConfig: {
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
  },
  data: computed(() => props.row as Record<string, unknown>),
})
sparkProvide(FIELD_CONTEXT, 'list')

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: () => props.children,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
})

const itemBodyStyle = computed(() =>
  gridChildren.value.length > 0 ? gridStyle.value : undefined
)
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