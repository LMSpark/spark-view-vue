<!--
/**
 * @skill r-tree
 * @description 树形数据容器，绑定 DataView 渲染嵌套树结构，支持懒加载、节点点击、展开/折叠事件
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { nodeKey?: string, lazy?: boolean } }
 * @example { "type": "r-tree", "dataKey": "departments@rows", "props": { "nodeKey": "id" } }
 */
-->
<template>
  <el-tree 
    :data="treeData" 
    v-bind="$attrs"
    @node-click="handleNodeClick"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
  >
    <template #default="slotProps">
      <span class="custom-tree-node">
        <!-- Config 驱动 —— 节点内容由 config.children 递归渲染 -->
        <template v-if="configChildren.length">
          <SparkComponentRenderer
            v-for="(child, i) in configChildren"
            :key="child.id ?? `r-tree-node-${i}`"
            :config="{ ...child, props: { ...child.props, node: slotProps?.node, data: slotProps?.data } }"
          />
        </template>
        <!-- Template 驱动 —— 向后兼容 -->
        <slot v-else :node="slotProps?.node" :data="slotProps?.data">
          <span class="node-label">{{ getNodeLabel(slotProps?.data) }}</span>
        </slot>
      </span>
    </template>
  </el-tree>
</template>

<script setup lang="ts">
/**
 * RendererTree - 树形容器组件
 *
 * 内部通过 useSparkComponent + consume(PAGE_DATASET) 自行解析 dataKey，
 * 不再依赖 bindRules.ts 外部注入。
 */
import { computed, onMounted, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import { parseDataKey } from '@spark-view/spark-data'
import type { IDataSource, DataView } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'

interface TreeNode {
  id?: string | number
  label: string
  children?: TreeNode[]
  disabled?: boolean
  [key: string]: string | number | boolean | TreeNode[] | undefined
}

interface ElTreeNode {
  level: number
  expanded: boolean
  [key: string]: unknown
}

interface ElTreeComponent {
  [key: string]: unknown
}

interface Props {
  config?: ComponentConfig
  /** DataKey 格式：scope@tableName@viewId@field （优先） */
  dataKey?: string
  data?: TreeNode[]
  dataSource?: IDataSource | DataView | undefined
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  [key: string]: unknown
}

const props = defineProps<Props>()

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const configChildren = computed(() => props.config?.children ?? [])

/** 提取树节点显示文本，避免模板中使用 as any */
function getNodeLabel(data: unknown): string {
  const node = data as TreeNode | undefined
  return node?.label ?? (node?.['name'] as string | undefined) ?? (node?.['title'] as string | undefined) ?? '节点'
}

// 接入 SPARK 能力链
const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-tree' }
)
const pageDataSet = consume(PAGE_DATASET)

// 解析数据视图
const resolvedDataSource = computed(() => {
  if (effectiveDataKey.value && pageDataSet) {
    const dk = parseDataKey(effectiveDataKey.value)
    if (dk) {
      const view = pageDataSet.getView(dk.tableName, dk.viewId)
      if (view) return view as IDataSource
    }
  }
  return props.dataSource as IDataSource | undefined
})

const treeData = computed(() => {
  // 兼容三种来源：
  // 1. 直接传入数组（bindRules 从 pageData 注入的裸数组）
  // 2. IDataSource / DataView（.rows 属性）
  // 3. props.data 直传
  const ds = resolvedDataSource.value as unknown
  if (Array.isArray(ds)) return ds as TreeNode[]
  const dsTyped = ds as IDataSource | undefined
  if (dsTyped && Array.isArray(dsTyped.rows)) return dsTyped.rows as TreeNode[]
  return props.data ?? []
})

function tryAutoLoad(ds: IDataSource | undefined) {
  if (!ds) return
  const maybeDV = ds as DataView | undefined
  if (maybeDV && typeof maybeDV.requestData === 'function') {
    // 内联数据表（无 api 配置）跳过，避免 "has no API configuration" 错误
    if (!maybeDV.dataTable?.api) return
    void maybeDV.requestData().catch((e: unknown) => {
      logger.error('RendererTree: requestData() 失败', e)
    })
  }
}

// 向字段子组件提供渲染上下文（同步，先于 watcher）
sparkProvide(FIELD_CONTEXT, 'tree')
sparkProvide(CONTEXT_DATA, {} as Record<string, unknown>)

// 统一 watcher：DATA_SOURCE 提供 + 自动加载
watch(resolvedDataSource, (nv) => {
  if (!nv) return
  sparkProvide(DATA_SOURCE, nv)
  tryAutoLoad(nv)
}, { immediate: true })

onMounted(() => tryAutoLoad(resolvedDataSource.value))

// 事件处理器
const handleNodeClick = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeClick) props.onNodeClick(data, node, component)
}
const handleNodeExpand = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeExpand) props.onNodeExpand(data, node, component)
}
const handleNodeCollapse = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeCollapse) props.onNodeCollapse(data, node, component)
}
</script>

<style scoped>
.custom-tree-node {
  display: flex;
  align-items: center;
  flex: 1;
  padding-right: 8px;
}

.node-label {
  font-size: 14px;
  color: #303133;
}
</style>