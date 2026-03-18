<template>
  <div class="dev-page-overview">
    <div class="overview-toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索页面..."
        clearable
        size="small"
        style="width: 240px"
      />
      <el-button size="small" @click="state.loadPages()">🔄 刷新</el-button>
      <el-button size="small" type="primary" @click="$emit('createPage')">➕ 新建页面</el-button>
    </div>

    <el-table
      :data="filteredPages"
      stripe
      border
      highlight-current-row
      size="small"
      style="width: 100%"
      max-height="100%"
      @row-dblclick="editPageRow"
    >
      <el-table-column prop="icon" label="" width="40" align="center">
        <template #default="{ row }">
          <NavIcon :name="row.icon" />
        </template>
      </el-table-column>
      <el-table-column prop="pageId" label="Page ID" width="160" sortable />
      <el-table-column prop="title" label="标题" width="160" />
      <el-table-column prop="path" label="路由" width="160" />
      <el-table-column label="文件" min-width="200">
        <template #default="{ row }">
          <el-tag
            v-for="f in (row.files as string[])"
            :key="f"
            size="small"
            :type="fileTagType(f)"
            style="margin-right: 4px"
          >
            {{ f }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="warning" @click="editPageRow(row as Record<string, unknown>)">✏️ 编辑</el-button>
          <el-button size="small" link type="primary" @click="locateInTree(row)">📍 定位</el-button>
          <el-button size="small" link type="success" @click="previewPage(row)">🔍 预览</el-button>
          <el-button size="small" link type="danger" @click="deletePage(row)">🗑️</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTenantRouter } from '@/composables/useTenantRouter'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { DevState } from './useDevState'
import { NavIcon } from '@spark-view/spark-app'

const props = defineProps<{ state: DevState }>()
const emit = defineEmits<{ createPage: []; locateNode: [pageId: string]; editPage: [pageId: string] }>()
const { router, tenantPath } = useTenantRouter()

const searchText = ref('')
import { getPageApi } from '@/services/api-paths'
import { http } from '@/services/http'

const filteredPages = computed(() => {
  const q = searchText.value.toLowerCase()
  if (!q) return props.state.pageList.value
  return props.state.pageList.value.filter(p => {
    const id = String(p['pageId'] ?? '').toLowerCase()
    const title = String(p['title'] ?? '').toLowerCase()
    return id.includes(q) || title.includes(q)
  })
})

function fileTagType(f: string) {
  if (f.endsWith('.json')) return '' as const
  if (f.endsWith('.js')) return 'warning' as const
  if (f.endsWith('.css')) return 'success' as const
  return 'info' as const
}

function editPageRow(row: Record<string, unknown>) {
  const pageId = String(row['pageId'] ?? '')
  if (pageId) emit('editPage', pageId)
}

function locateInTree(row: Record<string, unknown>) {
  const pageId = String(row['pageId'] ?? '')
  if (pageId) emit('locateNode', pageId)
}

function previewPage(row: Record<string, unknown>) {
  const path = String(row['path'] ?? '')
  if (path) void router.push(tenantPath(path))
  else {
    const pageId = String(row['pageId'] ?? '')
    if (pageId) void router.push(tenantPath(`/${pageId}`))
  }
}

async function deletePage(row: Record<string, unknown>) {
  const pageId = String(row['pageId'] ?? '')
  if (!pageId) return
  try {
    await ElMessageBox.confirm(`确定删除页面 "${pageId}"？`, '确认删除', { type: 'warning' })
  } catch { return }
  try {
    await http.delete(`${getPageApi()}/${encodeURIComponent(pageId)}`)
    ElMessage.success(`页面 ${pageId} 已删除`)
    await props.state.loadPages()
  } catch (e) {
    ElMessage.error(`删除失败: ${String(e)}`)
  }
}
</script>

<style scoped>
.dev-page-overview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow: hidden;
  padding: 8px;
}
.overview-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
</style>
