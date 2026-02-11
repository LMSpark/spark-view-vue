<template>
  <el-tree 
    :data="treeData" 
    v-bind="$attrs"
    @node-click="handleNodeClick"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
  >
    <template #default="{ node, data }">
      <span class="custom-tree-node">
        <!-- 支持通过 slot 自定义节点内容 -->
        <slot :node="node" :data="data">
          <!-- 默认渲染：显示节点标签 -->
          <span class="node-label">{{ data.label || data.name || data.title || '节点' }}</span>
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
  // FormCreate 通过 props 传递事件处理函数
  onNodeClick?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeExpand?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  onNodeCollapse?: (data: TreeNode, node: ElTreeNode, component: ElTreeComponent) => void
  // 其他 el-tree 的 props（通过 $attrs 透传）
  [key: string]: unknown
}

const props = withDefaults(defineProps<Props>(), {
  data: () => []
})

const treeData = computed(() => props.data)

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