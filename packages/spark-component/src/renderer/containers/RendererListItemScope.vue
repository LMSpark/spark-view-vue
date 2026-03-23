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
import { computed, toRef } from 'vue'
import type { CSSProperties } from 'vue'
import { SparkComponentRenderer } from '../_pkg'
import { nodeId, type SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from './useContainerGrid'
import { useDataScope } from './useDataScope'

interface Props {
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
  itemClass: '',
  itemStyle: () => ({}),
  useCard: false,
  cardShadow: 'hover',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const rowRef = toRef(props, 'row')
const childrenRef = toRef(props, 'children')

useDataScope({
  type: 'r-list-item',
  fieldContext: 'list',
  data: computed(() => rowRef.value as Record<string, unknown>),
})

const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: childrenRef,
  columns: toRef(props, 'gridColumns'),
  gap: toRef(props, 'gridGap'),
  autoRows: toRef(props, 'gridAutoRows'),
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