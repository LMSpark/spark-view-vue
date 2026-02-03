<template>
  <div class="settings-page">
    <el-page-header content="系统设置" @back="$router.go(-1)">
      <template #icon>
        <span style="font-size: 20px">⚙️</span>
      </template>
    </el-page-header>

    <div class="settings-content">
      <el-row :gutter="24">
        <!-- 左侧配置面板 -->
        <el-col :span="16">
          <el-card header="⚙️ 系统配置">
            <el-form :model="settings" label-width="120px" size="default">
              <!-- 应用设置 -->
              <el-divider content-position="left">应用设置</el-divider>
              <el-form-item label="应用名称">
                <el-input v-model="settings.appName" placeholder="请输入应用名称" />
              </el-form-item>
              <el-form-item label="应用版本">
                <el-input v-model="settings.appVersion" disabled />
              </el-form-item>
              <el-form-item label="主题模式">
                <el-radio-group v-model="settings.theme">
                  <el-radio label="light">浅色主题</el-radio>
                  <el-radio label="dark">深色主题</el-radio>
                  <el-radio label="auto">跟随系统</el-radio>
                </el-radio-group>
              </el-form-item>

              <!-- 渲染设置 -->
              <el-divider content-position="left">渲染设置</el-divider>
              <el-form-item label="页面渲染模式">
                <el-checkbox-group v-model="settings.renderModes">
                  <el-checkbox label="vue-component">Vue 组件页面</el-checkbox>
                  <el-checkbox label="config-page">配置页面</el-checkbox>
                  <el-checkbox label="spark-component">SPARK 组件</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="动态路由">
                <el-switch v-model="settings.dynamicRouting" />
                <span class="form-hint">启用后支持运行时注册页面</span>
              </el-form-item>
              <el-form-item label="配置缓存">
                <el-switch v-model="settings.configCache" />
                <span class="form-hint">缓存页面配置以提升性能</span>
              </el-form-item>

              <!-- 开发设置 -->
              <el-divider content-position="left">开发设置</el-divider>
              <el-form-item label="日志级别">
                <el-select v-model="settings.logLevel" placeholder="选择日志级别">
                  <el-option label="DEBUG" value="debug" />
                  <el-option label="INFO" value="info" />
                  <el-option label="WARN" value="warn" />
                  <el-option label="ERROR" value="error" />
                </el-select>
              </el-form-item>
              <el-form-item label="开发工具">
                <el-switch v-model="settings.devTools" />
                <span class="form-hint">启用 Vue DevTools 支持</span>
              </el-form-item>
              <el-form-item label="热重载">
                <el-switch v-model="settings.hotReload" />
                <span class="form-hint">配置文件变更时自动重载</span>
              </el-form-item>

              <!-- 操作按钮 -->
              <el-form-item>
                <el-button type="primary" @click="saveSettings">保存设置</el-button>
                <el-button @click="resetSettings">重置默认</el-button>
                <el-button type="info" @click="exportSettings">导出配置</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <!-- 右侧信息面板 -->
        <el-col :span="8">
          <el-card header="📊 系统状态" class="status-card">
            <div class="status-list">
              <div class="status-item">
                <span class="status-label">渲染引擎</span>
                <el-tag type="success">SPARK</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">Vue 版本</span>
                <el-tag>3.5.0</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">路由模式</span>
                <el-tag type="warning">混合模式</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">已注册路由</span>
                <el-tag type="info">{{ routeCount }} 个</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">配置页面</span>
                <el-tag type="info">{{ configPageCount }} 个</el-tag>
              </div>
              <div class="status-item">
                <span class="status-label">Vue 组件页面</span>
                <el-tag type="success">{{ vuePageCount }} 个</el-tag>
              </div>
            </div>
          </el-card>

          <el-card header="🛠️ 页面管理" style="margin-top: 16px;">
            <div class="page-management">
              <el-button 
                type="primary" 
                size="small" 
                @click="createConfigPage"
                style="width: 100%; margin-bottom: 8px"
              >
                ➕ 新建配置页面
              </el-button>
              <el-button 
                type="success" 
                size="small" 
                @click="createVuePage"
                style="width: 100%; margin-bottom: 8px"
              >
                🎯 新建 Vue 页面
              </el-button>
              <el-button 
                type="warning" 
                size="small" 
                @click="refreshRoutes"
                style="width: 100%"
              >
                🔄 重载路由
              </el-button>
            </div>
          </el-card>

          <el-card header="📋 最近操作" style="margin-top: 16px;">
            <el-timeline>
              <el-timeline-item
                v-for="log in operationLogs"
                :key="log.id"
                :timestamp="log.time"
                size="small"
              >
                {{ log.action }}
              </el-timeline-item>
            </el-timeline>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()

// 设置数据
const settings = ref({
  appName: 'SPARK 混合渲染系统',
  appVersion: '1.0.0',
  theme: 'light',
  renderModes: ['vue-component', 'config-page'],
  dynamicRouting: true,
  configCache: true,
  logLevel: 'debug',
  devTools: true,
  hotReload: true
})

// 路由统计
const routeCount = computed(() => router.getRoutes().length)
const configPageCount = ref(8) // 从配置目录统计
const vuePageCount = ref(3) // Vue 组件页面数

// 操作日志
const operationLogs = ref([
  { id: 1, action: '启动混合渲染系统', time: '2024-01-15 14:30' },
  { id: 2, action: '注册 Vue 组件页面', time: '2024-01-15 14:25' },
  { id: 3, action: '加载配置页面路由', time: '2024-01-15 14:20' },
  { id: 4, action: '初始化 SPARK 组件系统', time: '2024-01-15 14:15' }
])

// 保存设置
const saveSettings = () => {
  // 模拟保存到本地存储
  localStorage.setItem('spark-settings', JSON.stringify(settings.value))
  ElMessage.success('设置已保存')
  
  // 添加操作日志
  operationLogs.value.unshift({
    id: Date.now(),
    action: '保存系统设置',
    time: new Date().toLocaleString()
  })
}

// 重置设置
const resetSettings = () => {
  settings.value = {
    appName: 'SPARK 混合渲染系统',
    appVersion: '1.0.0',
    theme: 'light',
    renderModes: ['vue-component', 'config-page'],
    dynamicRouting: true,
    configCache: true,
    logLevel: 'debug',
    devTools: true,
    hotReload: true
  }
  ElMessage.info('已重置为默认设置')
}

// 导出配置
const exportSettings = () => {
  const config = JSON.stringify(settings.value, null, 2)
  const blob = new Blob([config], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'spark-settings.json'
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('配置已导出')
}

// 新建配置页面
const createConfigPage = () => {
  ElMessage.info('配置页面创建功能开发中...')
}

// 新建 Vue 页面
const createVuePage = () => {
  ElMessage.info('Vue 页面创建功能开发中...')
}

// 重载路由
const refreshRoutes = () => {
  ElMessage.success('路由已重载')
  operationLogs.value.unshift({
    id: Date.now(),
    action: '重载系统路由',
    time: new Date().toLocaleString()
  })
}

// 加载保存的设置
onMounted(() => {
  const saved = localStorage.getItem('spark-settings')
  if (saved) {
    try {
      settings.value = { ...settings.value, ...JSON.parse(saved) }
    } catch (e) {
      console.warn('加载保存的设置失败:', e)
    }
  }
})
</script>

<style scoped>
.settings-page {
  padding: 24px;
}

.settings-content {
  margin-top: 24px;
}

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.status-card {
  height: fit-content;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.status-label {
  font-size: 14px;
  color: #606266;
}

.page-management {
  display: flex;
  flex-direction: column;
}

.el-timeline {
  padding-left: 0;
}

:deep(.el-timeline-item__timestamp) {
  font-size: 11px;
}
</style>