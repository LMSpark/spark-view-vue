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
        <slot :node="slotProps?.node" :data="slotProps?.data">
          <span class="node-label">{{ (slotProps?.data as any)?.label || (slotProps?.data as any)?.name || (slotProps?.data as any)?.title || '节点' }}</span>
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
import { computed, onMounted, watch, provide } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET, DATA_SOURCE, parseDataKey } from '@spark-view/spark-data'
import type { IDataSource, DataView } from '@spark-view/spark-data'

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
  /** DataKey 格式：scope@tableName@viewId@field （优先） */
  dataKey?: string
  data?: TreeNode[]
  /** 直接传入的数据源（备用） */
  dataSource?: IDataSource | DataView | undefined
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  [key: string]: unknown
}

const props = defineProps<Props>()

// 接入 SPARK 能力链
const { consume, provide: sparkProvide } = useSparkComponent({ type: 'r-tree' })
const pageDataSet = consume(PAGE_DATASET)

// 解析数据视图：dataKey 优先 → PAGE_DATASET；回退到直接 props
const resolvedDataSource = computed(() => {
  if (props.dataKey && pageDataSet) {
    const dk = parseDataKey(props.dataKey)
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

// 提供 DATA_SOURCE 能力给子组件
watch(resolvedDataSource, (nv) => {
  if (nv) sparkProvide(DATA_SOURCE, nv)
}, { immediate: true })

// 自动加载
function tryAutoLoad(ds: IDataSource | undefined) {
  if (!ds) return
  const maybeDV = ds as DataView | undefined
  if (maybeDV && typeof maybeDV.requestData === 'function') {
    void maybeDV.requestData().catch((e: unknown) => {
      console.error('RendererTree: requestData() 失败', e)
    })
  }
}

onMounted(() => tryAutoLoad(resolvedDataSource.value))
watch(resolvedDataSource, (nv) => tryAutoLoad(nv))

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

provide('fieldContext', 'tree')
provide('contextDataSource', resolvedDataSource)
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