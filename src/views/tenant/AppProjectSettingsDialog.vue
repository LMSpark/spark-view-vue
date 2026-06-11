<!--
@module app:views/tenant/AppProjectSettingsDialog
app 的 views/tenant/AppProjectSettingsDialog 模块。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="520px"
    destroy-on-close
    @closed="handleClosed"
  >
    <div v-loading="loading">
      <el-form v-if="form" label-width="96px">
        <el-form-item label="模块栏布局">
          <el-radio-group v-model="form.childPlacement" :disabled="!canEditLayout">
            <el-radio-button value="header">顶部模块栏</el-radio-button>
            <el-radio-button value="sidebar">左侧模块栏</el-radio-button>
          </el-radio-group>
          <p v-if="!canEditLayout" class="field-hint">导航根模块未就绪，暂不可修改模块栏布局。</p>
        </el-form-item>
        <el-form-item label="项目首页">
          <el-select
            v-model="form.homeNodeId"
            clearable
            filterable
            placeholder="选择登录后默认进入的页面节点"
            style="width: 100%"
          >
            <el-option
              v-for="option in homeNodeOptions"
              :key="option.id"
              :label="option.label"
              :value="option.id"
            />
          </el-select>
          <p class="field-hint">对应数据库 projects.home_node_id，需为带路由的页面节点。</p>
        </el-form-item>
      </el-form>
      <el-empty v-else-if="!loading" description="无法加载项目设置" />
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!form" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  loadProjectRuntimeSettings,
  saveProjectRuntimeSettings,
  type ProjectHomeNodeOption,
  type ProjectLayoutPlacement,
  type ProjectRuntimeSettings,
} from '@/services/project-settings'

const props = defineProps<{
  tenantId: string
  projectId: string
  projectName: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const visible = defineModel<boolean>({ required: true })

const loading = ref(false)
const saving = ref(false)
const snapshot = ref<ProjectRuntimeSettings | null>(null)
const homeNodeOptions = ref<ProjectHomeNodeOption[]>([])
const form = ref<{ childPlacement: ProjectLayoutPlacement; homeNodeId: string | null } | null>(null)

const dialogTitle = computed(() => `项目设置 — ${props.projectName || props.projectId}`)
const canEditLayout = computed(() => Boolean(snapshot.value?.rootModuleId))

watch(
  () => [visible.value, props.tenantId, props.projectId] as const,
  ([open]) => {
    if (open) void loadSettings()
  },
)

async function loadSettings(): Promise<void> {
  loading.value = true
  snapshot.value = null
  form.value = null
  homeNodeOptions.value = []
  try {
    const settings = await loadProjectRuntimeSettings(props.tenantId, props.projectId)
    snapshot.value = settings
    homeNodeOptions.value = settings.homeNodeOptions
    form.value = {
      childPlacement: settings.childPlacement,
      homeNodeId: settings.project.homeNodeId,
    }
    if (!settings.rootModuleId) {
      ElMessage.warning('该项目尚未初始化导航根模块，暂时只能编辑项目首页')
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '加载项目设置失败'
    ElMessage.error(message)
    visible.value = false
  } finally {
    loading.value = false
  }
}

async function handleSave(): Promise<void> {
  if (!snapshot.value || !form.value) return
  saving.value = true
  try {
    await saveProjectRuntimeSettings({
      tenantId: props.tenantId,
      projectId: props.projectId,
      current: snapshot.value,
      input: form.value,
    })
    ElMessage.success('项目设置已保存')
    visible.value = false
    emit('saved')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '保存失败'
    ElMessage.error(message)
  } finally {
    saving.value = false
  }
}

function handleClosed(): void {
  snapshot.value = null
  form.value = null
  homeNodeOptions.value = []
}
</script>

<style scoped>
.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
</style>
