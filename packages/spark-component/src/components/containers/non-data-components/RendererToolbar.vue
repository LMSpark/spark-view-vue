<template>
  <!--
    工具栏整体布局：
    - 根容器使用 Grid 做“主区 + 尾区”两列分区。
    - 主区渲染 props.children。
    - 尾区渲染 props.tail.children，并固定右对齐。
  -->
  <div class="renderer-toolbar" :style="rootStyle">
    <div
      v-if="startChildren.length > 0"
      class="renderer-toolbar-lane renderer-toolbar-lane--start"
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
      :class="['renderer-toolbar-lane', 'renderer-toolbar-lane--end', props.tail?.class]"
      :style="[laneStyle, { justifyContent: 'end' }]"
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
import { computed, ref, watch } from 'vue'
import {
  DATA_ROW,
  DATA_SOURCE,
  PAGE_DATASET,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  useSparkPageComponent,
  type SparkNode,
} from '../../internal'
import { resolveDataCapabilitiesFromDataKey } from '../../../core/data-key-resolver'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import { extractModelPermission, type ModelPermissionSource } from '../../../permission'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender'
import type { RToolbarProps } from './RendererToolbar.types'

// ============================================================================
// 1) 组件输入与能力入口
//    - 接收工具栏配置 props
//    - 通过 useSparkPageComponent 获取能力消费/提供接口
// ============================================================================
const props = withDefaults(defineProps<RToolbarProps>(), {
  type: 'r-toolbar',
})

const { sparkConsume, sparkProvide } = useSparkPageComponent(props)

// ============================================================================
// 2) 上下文能力与响应触发器
//    - DATA_SOURCE: 上游提供的数据源
//    - DATA_ROW: 上游行上下文（优先级高于 currentRow）
//    - PAGE_DATASET: dataKey 解析所需的数据集能力
//    - toolbarReactiveVersion: 事件触发计数器，用于让 beforeRender 相关逻辑重新计算
// ============================================================================
const inheritedDataSource = sparkConsume(DATA_SOURCE)
const inheritedDataRow = sparkConsume(DATA_ROW)
const pageDataSet = sparkConsume(PAGE_DATASET)
const toolbarReactiveVersion = ref(0)

// ============================================================================
// 3) 数据源解析策略
//    优先级：
//    1. 显式 props.dataSource
//    2. dataKey 解析得到的 dataSource
//    3. 继承父级 DATA_SOURCE
// ============================================================================
const resolvedToolbarDataSource = computed<DataView | null>(() => {
  if (props.dataSource !== undefined && props.dataSource !== null) {
    return props.dataSource as DataView
  }

  if (typeof props.dataKey === 'string' && props.dataKey.trim().length > 0) {
    const capabilities = resolveDataCapabilitiesFromDataKey(props.dataKey, pageDataSet)
    if (capabilities.dataSource) return capabilities.dataSource
  }

  return inheritedDataSource as DataView | null
})

/**
 * 监听数据源并建立两类副作用：
 * 1) 向下提供 DATA_SOURCE（保证子动作可直接消费）
 * 2) 订阅 DataView 关键事件，驱动工具栏动作节点重算
 *
 * 说明：
 * - immediate: true 保证首次渲染时即建立能力与订阅。
 * - onCleanup 中对称解绑，避免数据源切换后残留监听器。
 */
watch(resolvedToolbarDataSource, (source, _previous, onCleanup) => {
  if (source === null) return

  sparkProvide(DATA_SOURCE, source)

  const bumpReactiveVersion = () => {
    toolbarReactiveVersion.value += 1
  }

  source.events.on('currentRowChanged', bumpReactiveVersion)
  source.events.on('selectedRowsChanged', bumpReactiveVersion)
  source.events.on('rowsChanged', bumpReactiveVersion)

  onCleanup(() => {
    source.events.off('currentRowChanged', bumpReactiveVersion)
    source.events.off('selectedRowsChanged', bumpReactiveVersion)
    source.events.off('rowsChanged', bumpReactiveVersion)
  })
}, { immediate: true })

// ============================================================================
// 4) 动作节点预处理（beforeRender 作用域注入）
//    - 解析当前 row / dataSource / modelPermission
//    - 执行 onBeforeRender 并合并 patch
// ============================================================================
function resolveToolbarActionNode(node: SparkNode): SparkNode {
  // 显式读取版本号，建立与 DataView 事件的依赖关系。
  // 事件触发时该值递增，从而让动作节点计算链整体刷新。
  void toolbarReactiveVersion.value

  const dataSource = resolvedToolbarDataSource.value

  // 行上下文优先使用父级明确传入的 DATA_ROW，
  // 若不存在则回退到当前 DataView.currentRow。
  const rowInput = inheritedDataRow ?? dataSource?.currentRow
  const row = rowInput !== null && rowInput !== undefined && typeof rowInput === 'object' && !Array.isArray(rowInput)
    ? rowInput as IDataRow
    : undefined

  const beforeRender = resolveNodeBeforeRender(node, {
    row,
    data: row,
    dataSource,
    modelPermission: extractModelPermission(dataSource as ModelPermissionSource | null),
    host: { type: 'r-toolbar' },
  })

  // 工具栏容器仅负责合并 onBeforeRender 的 propsPatch，
  // 具体权限禁用策略仍由叶子动作组件自行解释。
  return mergeNodeBeforeRenderProps(node, beforeRender.propsPatch, {
    markResolved: true,
  })
}

// ============================================================================
// 5) 分区子节点构建
//    - startChildren: 常规 children
//    - endChildren: tail 区 children
//    两者流程一致：提取 SparkNode -> beforeRender 处理 -> visible 过滤
// ============================================================================
const startChildren = computed(() =>
  getSparkNodeChildren(props.children)
    .map(resolveToolbarActionNode)
    .filter((node) => node.props?.['visible'] !== false)
)

const endChildren = computed(() =>
  getSparkNodeChildren(props.tail?.children)
    .map(resolveToolbarActionNode)
    .filter((node) => node.props?.['visible'] !== false)
)

// ============================================================================
// 6) 布局样式计算
//    - rootStyle: 控制主/尾两列栅格以及列间距
//    - laneStyle: 控制分区内按钮横向流式排列
// ============================================================================
const rootStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridTemplateColumns: endChildren.value.length > 0 ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
  columnGap: typeof props.zoneGap === 'number' ? `${props.zoneGap}px` : (props.zoneGap ?? '12px'),
  alignItems: props.align ?? 'center',
}))

const laneStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'max-content',
  gap: typeof props.gap === 'number' ? `${props.gap}px` : (props.gap ?? '8px'),
  alignItems: props.align ?? 'center',
  justifyContent: props.justify ?? 'start',
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
