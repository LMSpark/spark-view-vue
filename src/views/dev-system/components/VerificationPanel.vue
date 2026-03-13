<template>
  <div class="verification-panel">
    <h2 class="editor-title">✅ 验证部署</h2>

    <!-- 页面生成状态总览 -->
    <section class="editor-section">
      <h3>页面状态总览</h3>
      <el-table :data="allPages" stripe size="small" class="pages-table" v-if="allPages.length">
        <el-table-column prop="moduleName" label="模块" width="140" />
        <el-table-column prop="title" label="页面" min-width="140">
          <template #default="{ row }">
            <span class="clickable-cell" @click="gotoPage(row.pageId)">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="pageId" label="ID" width="140" />
        <el-table-column prop="pageType" label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.pageType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="hasDesign" label="设计方案" width="100" align="center">
          <template #default="{ row }">
            <span v-if="row.proposalCount > 0">{{ row.proposalCount }} 个</span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="尚未规划页面" :image-size="60" />
    </section>

    <!-- 汇总统计 -->
    <section v-if="allPages.length" class="editor-section">
      <h3>统计</h3>
      <div class="summary-row">
        <div class="summary-item">
          <span class="summary-value">{{ allPages.length }}</span>
          <span class="summary-label">总页面</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{{ countByStatus('generated') + countByStatus('verified') }}</span>
          <span class="summary-label">已生成</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{{ countByStatus('designing') }}</span>
          <span class="summary-label">设计中</span>
        </div>
        <div class="summary-item">
          <span class="summary-value">{{ countByStatus('planned') }}</span>
          <span class="summary-label">待开始</span>
        </div>
      </div>
    </section>

    <!-- 预览占位 -->
    <section class="editor-section">
      <h3>🔮 预览 & 部署</h3>
      <p class="placeholder-text">
        页面预览和一键部署功能将在后续阶段实现。目前可通过左侧页面列表逐页查看设计状态。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useProject } from '../composables/useProjectInject'

const project = useProject()

interface PageRow {
  moduleName: string
  moduleId: string
  title: string
  pageId: string
  pageType: string
  status: string
  proposalCount: number
}

const allPages = computed<PageRow[]>(() => {
  const rows: PageRow[] = []
  for (const mod of project.state.modules) {
    for (const page of mod.pages) {
      const ds = project.state.pageDesignStates.get(page.pageId)
      rows.push({
        moduleName: mod.name,
        moduleId: mod.id,
        title: page.title,
        pageId: page.pageId,
        pageType: page.pageType,
        status: page.status,
        proposalCount: ds?.proposals.length ?? 0,
      })
    }
  }
  return rows
})

function countByStatus(status: string): number {
  return allPages.value.filter(p => p.status === status).length
}

function gotoPage(pageId: string) {
  project.setFocus({ view: 'page-design', pageId })
}

function statusType(status: string) {
  if (status === 'generated' || status === 'verified') return 'success' as const
  if (status === 'designing') return 'warning' as const
  return 'info' as const
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    planned: '待开始',
    designing: '设计中',
    generated: '已生成',
    verified: '已验证',
  }
  return map[status] ?? status
}
</script>

<style scoped>
.verification-panel {
  padding: 20px 24px;
  overflow: auto;
  height: 100%;
}

.editor-title {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 700;
}

.editor-section {
  margin-bottom: 24px;
}

.editor-section h3 {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.pages-table {
  width: 100%;
}

.clickable-cell {
  cursor: pointer;
  color: var(--el-color-primary);
}

.clickable-cell:hover {
  text-decoration: underline;
}

.text-muted {
  color: var(--el-text-color-placeholder);
}

.summary-row {
  display: flex;
  gap: 24px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.summary-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.placeholder-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
</style>
