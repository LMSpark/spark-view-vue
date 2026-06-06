<template>
  <div class="app-list-page">
    <el-page-header content="应用管理" @back="$router.go(-1)">
      <template #icon>
        <span style="font-size: 20px">📱</span>
      </template>
      <template #extra>
        <el-button type="primary" @click="showCreateDialog = true">
          ➕ 创建应用
        </el-button>
      </template>
    </el-page-header>

    <div class="app-list-content">
      <el-row :gutter="20">
        <el-col v-for="project in projects" :key="project.projectId" :xs="24" :sm="12" :md="8" :lg="6">
          <el-card
            class="app-card"
            :class="{ 'is-active': project.projectId === currentProjectId }"
            shadow="hover"
          >
            <div class="app-card-header">
              <span class="app-icon"><NavIcon :name="project.icon" :size="32" /></span>
              <el-tag v-if="project.projectType === 'homepage'" type="warning" size="small">应用工场</el-tag>
              <el-tag v-else type="info" size="small">应用</el-tag>
            </div>
            <h3 class="app-name">{{ project.name }}</h3>
            <p class="app-desc">{{ project.description || '暂无描述' }}</p>
            <div class="app-actions">
              <el-button
                v-if="project.projectId !== currentProjectId"
                type="primary"
                size="small"
                @click="handleSwitch(project)"
              >
                进入应用
              </el-button>
              <el-tag v-else type="success" size="small">当前应用</el-tag>
              <el-button size="small" @click="openSettings(project)">设置</el-button>
              <el-button
                v-if="project.projectType !== 'homepage'"
                type="danger"
                size="small"
                text
                @click="handleDelete(project)"
              >
                删除
              </el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <AppProjectSettingsDialog
      v-if="settingsTarget"
      v-model="settingsVisible"
      :tenant-id="tenantId"
      :project-id="settingsTarget.projectId"
      :project-name="settingsTarget.name"
      @saved="loadProjects"
    />

    <!-- 创建应用弹窗 -->
    <el-dialog v-model="showCreateDialog" title="创建应用" width="480px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="应用 ID">
          <el-input v-model="createForm.projectId" placeholder="英文标识，如 my-app" />
        </el-form-item>
        <el-form-item label="应用名称">
          <el-input v-model="createForm.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="createForm.icon" placeholder="Emoji 图标" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="应用描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill app-list
 * @catalogInternal
 * @description 应用列表页面，以卡片网格展示已创建的项目/应用及入口；属于租户路由页，不允许作为 SparkNode 组件配置生成。
 */
import { ref, onMounted, computed, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { http } from '@/services/http'
import { getProjectApi } from '@/services/api-paths'
import { getUser } from '@/services/auth'
import { PROJECT_SWITCH_KEY } from '@/services/project-switch'
import { buildTenantPath, parseTenantScope, stripTenantScope } from '@/services/tenant-scope'
import NavIcon from '@/components/NavIcon.vue'
import { getNavHomePath } from '@spark-appworks/spark-app'
import AppProjectSettingsDialog from './AppProjectSettingsDialog.vue'

type ProjectItem = {
  projectId: string
  name: string
  projectType: string
  icon: string
  description: string
  order: number
  homeNodeId?: string | null
}

const router = useRouter()
const route = useRoute()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const projects = ref<ProjectItem[]>([])
const showCreateDialog = ref(false)
const creating = ref(false)
const settingsVisible = ref(false)
const settingsTarget = ref<ProjectItem | null>(null)

const tenantId = computed(() => {
  const fromRoute = parseTenantScope(route.path)?.tenantId
  return fromRoute ?? getUser()?.tenantId ?? ''
})

const currentProjectId = computed(() => getRouteProjectId() ?? getUser()?.defaultProjectId ?? 'homepage')

const createForm = ref({
  projectId: '',
  name: '',
  icon: 'Box',
  description: '',
})

async function loadProjects() {
  const data = await http.get<ProjectItem[]>(getProjectApi(tenantId.value))
  projects.value = data
}

function getProjectSwitch() {
  if (!projectSwitch) throw new Error('应用管理页缺少项目切换服务，无法同步项目上下文')
  return projectSwitch
}

function getRouteProjectId(): string | null {
  const projectId = route.params['projectId']
  return typeof projectId === 'string' && projectId.trim().length > 0 ? projectId : null
}

function getCurrentSubPath(): string {
  return stripTenantScope(route.path) || '/app-list'
}

function openSettings(project: ProjectItem): void {
  settingsTarget.value = project
  settingsVisible.value = true
}

async function handleCreate() {
  const { projectId, name, icon, description } = createForm.value
  if (!projectId.trim()) {
    ElMessage.warning('请输入应用 ID')
    return
  }
  creating.value = true
  try {
    await http.post(getProjectApi(tenantId.value), { projectId, name, icon, description })
    ElMessage.success('应用创建成功')
    showCreateDialog.value = false
    createForm.value = { projectId: '', name: '', icon: 'Box', description: '' }
    await loadProjects()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '创建失败'
    ElMessage.error(msg)
  } finally {
    creating.value = false
  }
}

async function handleSwitch(project: ProjectItem) {
  const user = getUser()
  if (!user) throw new Error('未登录，无法切换应用')
  await getProjectSwitch().switchAndReload(project.projectId)
  ElMessage.success(`已切换到「${project.name}」`)
  if (user) {
    void router.push(buildTenantPath({ tenantId: user.tenantId, projectId: project.projectId }, getNavHomePath()))
  }
}

async function handleDelete(project: ProjectItem) {
  try {
    await ElMessageBox.confirm(`确定删除应用「${project.name}」？此操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await http.delete(`${getProjectApi(tenantId.value)}/${project.projectId}`)
    ElMessage.success('已删除')
    await loadProjects()
  } catch {
    // 用户取消或请求失败
  }
}

onMounted(async () => {
  const user = getUser()
  if (user && (user.defaultProjectId !== 'homepage' || currentProjectId.value !== 'homepage')) {
    await getProjectSwitch().switchAndReload('homepage')
    const homepagePath = buildTenantPath({ tenantId: user.tenantId, projectId: 'homepage' }, getCurrentSubPath())
    if (route.path !== homepagePath) await router.replace(homepagePath)
  }
  await loadProjects()
})
</script>

<style scoped>
.app-list-page {
  padding: 20px;
}

.app-list-content {
  margin-top: 20px;
}

.app-card {
  margin-bottom: 20px;
  transition: border-color 0.3s;
}

.app-card.is-active {
  border-color: var(--el-color-primary);
}

.app-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.app-icon {
  font-size: 32px;
}

.app-name {
  margin: 8px 0 4px;
  font-size: 16px;
}

.app-desc {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 12px;
  min-height: 36px;
}

.app-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
