<template>
  <div :class="rootClasses" :style="rootStyle">
    <div
      v-if="startChildren.length > 0"
      :class="startClasses"
      :style="laneStyle"
    >
      <SparkComponentRenderer
        v-for="(child, index) in startChildren"
        :key="nodeId(child) ?? `r-toolbar-start-${index}`"
        :config="child"
      />
    </div>

    <div
      v-if="endChildren.length > 0"
      :class="endClasses"
      :style="tailLaneStyle"
    >
      <SparkComponentRenderer
        v-for="(child, index) in endChildren"
        :key="nodeId(child) ?? `r-toolbar-end-${index}`"
        :config="child"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-toolbar
 * @description 工具栏容器，flex 水平布局分为起始区（默认 children）和尾部区（r-tail 子节点），组织操作按钮。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent } from '../../internal'
import type { InlineAlign, InlineJustify, RendererToolbarProps as Props } from './RendererToolbar.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-toolbar',
})

useSparkPageComponent(props)

const gap = computed<number | string>(() => props.gap ?? 8)
const zoneGap = computed<number | string>(() => props.zoneGap ?? 12)
const align = computed<InlineAlign>(() => props.align ?? 'center')
const justify = computed<InlineJustify>(() => props.justify ?? 'start')

// r-tail 子节点已由绑定层提升为 props.tail
const contentChildren = computed(() => props.children ?? [])

// 主区：常规子节点。
const startChildren = computed(() => getSparkNodeChildren(contentChildren.value))

// 尾区：来自 r-tail 的 children。
const endChildren = computed(() => getSparkNodeChildren(props.tail?.children))

function normalizeSize(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value
}

// 统一把内部抽象值映射到 CSS Grid/Flex 对齐值，避免模板中散落条件分支。
function alignToCss(value: InlineAlign): string {
  if (value === 'start') return 'start'
  if (value === 'end') return 'end'
  return value
}

function justifyToCss(value: InlineJustify): string {
  if (value === 'start') return 'start'
  if (value === 'end') return 'end'
  return value
}

// 读取子节点的 class。
function dockClass(name: string): string {
  if (name === 'tail') return props.tail?.props?.class ?? ''
  return ''
}

const rootClasses = computed(() => [
  'renderer-toolbar',
  {
    'renderer-toolbar--split': endChildren.value.length > 0,
  },
])

const startClasses = computed(() => [
  'renderer-toolbar-lane',
  'renderer-toolbar-lane--start',
  dockClass('default'),
])

const endClasses = computed(() => [
  'renderer-toolbar-lane',
  'renderer-toolbar-lane--end',
  dockClass('tail'),
])

// 根容器用两列 grid，而不是继续做一层 flex 语义：
// - 只有主区时：单列
// - 有尾区时：主区占满剩余空间，尾区自适应宽度
// 这样和你前面定的“矩阵布局 + 区域分桶”方向保持一致。
const rootStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridTemplateColumns: endChildren.value.length > 0 ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
  columnGap: normalizeSize(zoneGap.value),
  alignItems: alignToCss(align.value),
}))

// 单个 lane 内仍然使用 grid-auto-flow: column，避免把"横向容器"继续拆成另一种独立语义。
// 从实现层看，它就是一个单行矩阵流。
const laneStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'max-content',
  gap: normalizeSize(gap.value),
  alignItems: alignToCss(align.value),
  justifyContent: justifyToCss(justify.value),
}))

// 尾区固定向右收束：即使主区 justify 改变，也不影响尾区行为。
const tailLaneStyle = computed<Record<string, string>>(() => ({
  ...laneStyle.value,
  justifyContent: 'end',
}))
</script>

<style scoped>
.renderer-toolbar {
  width: 100%;
}

.renderer-toolbar-lane {
  min-width: 0;
}

.renderer-toolbar-lane--end {
  justify-self: end;
}
</style>
