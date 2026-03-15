<template>
  <div class="project-tree">
    <!-- 工具栏 -->
    <div class="project-tree__toolbar">
      <el-input
        v-model="filterText"
        placeholder="搜索…"
        clearable
        size="small"
        style="flex: 1"
      />
      <el-dropdown size="small" trigger="click">
        <el-button size="small">＋</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="emit('addGroup')">新建分组</el-dropdown-item>
            <el-dropdown-item @click="emit('addPage')">新建页面</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- WBS 树 -->
    <el-tree
      ref="treeRef"
      :data="state.wbsRoot"
      node-key="id"
      :props="{ label: 'title', children: 'children' }"
      default-expand-all
      :filter-node-method="filterNode"
      :expand-on-click-node="false"
      highlight-current
      @node-click="handleNodeClick"
    >
      <template #default="{ data }">
        <span class="tree-node">
          <span class="node-icon"><NavIcon :name="data.icon" /></span>
          <span class="node-label">{{ data.title }}</span>
          <el-tag size="small" :type="statusTagType(data)">
            {{ data.type === 'group' ? '分组' : (data.pageType ?? '页面') }}
          </el-tag>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ProjectState, WbsNode, WbsNodeStatus } from '../composables/types'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{
  state: ProjectState
}>()

const emit = defineEmits<{
  nodeClick: [nodeId: string]
  addGroup: []
  addPage: []
}>()

const treeRef = ref()
const filterText = ref('')

watch(filterText, (val) => {
  treeRef.value?.filter(val)
})

// 外部选中变化时同步树高亮
watch(() => props.state.selectedNodeId, (id) => {
  if (id) {
    treeRef.value?.setCurrentKey(id)
  } else {
    treeRef.value?.setCurrentKey(null)
  }
})

const STATUS_TAG: Record<WbsNodeStatus, '' | 'success' | 'info' | 'warning' | 'danger'> = {
  planned: 'info',
  designing: 'warning',
  generated: '',
  verified: 'success',
}

function filterNode(value: string | number, data: WbsNode) {
  if (!value) return true
  return data.title.toLowerCase().includes(String(value).toLowerCase())
}

function statusTagType(data: WbsNode): '' | 'success' | 'info' | 'warning' | 'danger' {
  if (data.type === 'group') return 'info'
  return STATUS_TAG[data.status]
}

function handleNodeClick(data: WbsNode) {
  emit('nodeClick', data.id)
}
</script>

<style scoped>
.project-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.project-tree__toolbar {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.project-tree :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  --el-tree-node-content-height: 30px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  overflow: hidden;
}

.node-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.node-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
