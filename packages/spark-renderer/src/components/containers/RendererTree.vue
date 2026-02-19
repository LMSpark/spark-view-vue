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
        <!-- 支持通过 slot 自定义节点内容（防御 undefined scope，测试环境 el-tree 未注册时 slotProps 可能为空） -->
        <slot :node="slotProps?.node" :data="slotProps?.data">
          <!-- 默认渲染：显示节点标签 -->
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
 * 通过 provide 告知子字段组件当前处于 tree 上下文，
 * 同时提供树形数据供子组件访问。
 */
import { provide, computed } from 'vue'

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
  data?: TreeNode[]
  dataSource?: import('@spark-view/spark-data').IDataSource | import('@spark-view/spark-data').DataView | undefined
  // FormCreate 通过 props 传递事件处理函数
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  // 其他 el-tree 的 props（通过 $attrs 透传）
  [key: string]: unknown
}

const props = defineProps<Props>()

const resolvedDataSource = computed(() => props.dataSource)
const treeData = computed(() => {
  const ds = resolvedDataSource.value as import('@spark-view/spark-data').IDataSource | undefined
  if (ds && Array.isArray(ds.rows)) return ds.rows
  return []
})

// 若 dataSource 为 DataView 且无数据，则尝试由 dataSource 自行加载
import { onMounted, watch } from 'vue'
function tryAutoLoad(ds: import('@spark-view/spark-data').IDataSource | undefined) {
  if (!ds) return
  const maybeDV = ds as import('@spark-view/spark-data').DataView | undefined
  if (maybeDV && typeof maybeDV.requestData === 'function') {
    void maybeDV.requestData().catch((e: unknown) => {
      console.error('RendererTree: requestData() 失败', e)
    })
  }
}

onMounted(() => tryAutoLoad(resolvedDataSource.value))
watch(resolvedDataSource, (nv) => tryAutoLoad(nv))

// 事件处理：直接调用 props 中的处理函数
const handleNodeClick = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeClick) {
    props.onNodeClick(data, node, component)
  }
}

const handleNodeExpand = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeExpand) {
    props.onNodeExpand(data, node, component)
  }
}

const handleNodeCollapse = (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => {
  if (props.onNodeCollapse) {
    props.onNodeCollapse(data, node, component)
  }
}

// 提供上下文给子字段组件
provide('fieldContext', 'tree')
provide('contextData', treeData)
// 提供 dataSource（如为 IDataSource/DataView）
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