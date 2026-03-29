<!--
/**
 * @skill r-toolbar
 * @description 通用横向条带容器。以 children + dock 模型工作：未声明 dock 的子节点进入 default 主区，dock='tail' 的子节点进入尾区；r-menu 先复用同实现。
 * @input { props: { gap?: number|string, zoneGap?: number|string, align?: 'start'|'center'|'end'|'stretch' } }
 * @example { "type": "r-toolbar", "children": [{ "type": "builtin-action" }, { "type": "r-text", "dock": "tail" }] }
 */
-->
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
import { computed } from 'vue'
import { SparkComponentRenderer, getDockedChildren, nodeId, useSparkComponent, type SparkNode, type ContainerDocks, type DockDescriptor } from '../../internal'

/**
 * 横向容器对齐方式。
 *
 * 这里不是业务语义，而是纯布局参数：父容器通过它决定一条横向 lane 内
 * 子节点在交叉轴上的对齐方式。保持独立定义，后续若扩到纵向容器/矩阵容器，
 * 可复用同一套枚举。
 */
type InlineAlign = 'start' | 'center' | 'end' | 'stretch'

/**
 * 横向容器主轴分布方式。
 *
 * 当前容器内部只有两类 lane：主区与尾区。主区支持 start/center/end/space-between，
 * 尾区固定向右收束，不暴露额外复杂语义，先保持最小可用内核。
 */
type InlineJustify = 'start' | 'center' | 'end' | 'space-between'

interface Props extends SparkNode {
  /**
   * 子节点列表。
   *
   * 规则：
   * - 未声明 dock → 进入 default 主区
   * - dock === tailDock → 进入尾区
   * - 其他 dock 当前不参与渲染（后续若扩展多区容器，可在此模型上继续分层）
   */
  children?: SparkNode[]
  /**
   * dock 显示描述符。
   *
   * 这里只读取区域级 class，用于给 default/tail 区域挂样式钩子；
   * 不在第一版里引入更多位置/交互语义，避免重新把结构做重。
   */
  docks?: ContainerDocks
  /** 单个子项之间的间距（同一区域内部） */
  gap?: number | string
  /** 主区与尾区之间的间距（区域级） */
  zoneGap?: number | string
  /** 区域内部子项的交叉轴对齐 */
  align?: InlineAlign
  /** 主区内部子项的主轴分布方式 */
  justify?: InlineJustify
  /** 尾区使用的 dock 名称，默认 tail，保留未来自定义命名空间能力 */
  tailDock?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-toolbar',
  children: () => [],
  docks: () => ({}),
  gap: 8,
  zoneGap: 12,
  align: 'center',
  justify: 'start',
  tailDock: 'tail',
})
// 注册当前业务组件上下文。
// 这里不额外 provide 新能力，只是保持容器节点进入 SPARK 组件树，
// 让后续若扩展 API / 调试能力时不需要改调用方式。
useSparkComponent(props)

// 主区：所有未声明 dock 的子节点。
const startChildren = computed(() => getDockedChildren(props.children))

// 尾区：所有 dock === tailDock 的子节点。
// 第一版先只做双区模型，覆盖 toolbar / menu / header-actions / row-actions strip 这类场景。
const endChildren = computed(() => getDockedChildren(props.children, props.tailDock))

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

// 读取某个 dock 区域的 class。
// 设计上 dock 负责“去哪渲染”，descriptor 负责“这个区域长什么样”，两者职责拆开。
function dockClass(name: string): string {
  const descriptor = props.docks?.[name] as DockDescriptor | undefined
  return descriptor?.class ?? ''
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
  dockClass(props.tailDock),
])

// 根容器用两列 grid，而不是继续做一层 flex 语义：
// - 只有主区时：单列
// - 有尾区时：主区占满剩余空间，尾区自适应宽度
// 这样和你前面定的“矩阵布局 + 区域分桶”方向保持一致。
const rootStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridTemplateColumns: endChildren.value.length > 0 ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
  columnGap: normalizeSize(props.zoneGap),
  alignItems: alignToCss(props.align),
}))

// 单个 lane 内仍然使用 grid-auto-flow: column，避免把“横向容器”继续拆成另一种独立语义。
// 从实现层看，它就是一个单行矩阵流。
const laneStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'max-content',
  gap: normalizeSize(props.gap),
  alignItems: alignToCss(props.align),
  justifyContent: justifyToCss(props.justify),
}))

// 尾区固定向右收束：即使主区 justify 改变，也不影响尾区作为 secondary zone 的行为。
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
