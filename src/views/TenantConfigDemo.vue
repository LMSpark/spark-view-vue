<template>
  <div class="tenant-config-demo">
    <h2>🏢 多租户配置演示</h2>
    
    <el-card class="info-card">
      <template #header>
        <div class="card-header">
          <span>当前租户信息</span>
        </div>
      </template>
      
      <div v-if="tenantInfo" class="tenant-info">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="租户 ID">
            <el-tag>{{ tenantInfo.tenantId }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="租户名称">
            {{ tenantInfo.tenantName }}
          </el-descriptions-item>
          <el-descriptions-item label="租户代码" v-if="tenantInfo.tenantCode">
            {{ tenantInfo.tenantCode }}
          </el-descriptions-item>
          <el-descriptions-item label="主题色" v-if="tenantInfo.theme?.primaryColor">
            <div class="color-demo" :style="{ backgroundColor: tenantInfo.theme?.primaryColor }">
              {{ tenantInfo.theme?.primaryColor }}
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      
      <div v-else class="no-tenant">
        <el-empty description="使用默认配置（无租户信息）" />
      </div>
    </el-card>
    
    <el-card class="config-card">
      <template #header>
        <div class="card-header">
          <span>应用配置</span>
        </div>
      </template>
      
      <el-descriptions :column="1" border>
        <el-descriptions-item label="API 地址">
          {{ config.apiBaseUrl }}
        </el-descriptions-item>
        <el-descriptions-item label="应用版本">
          {{ config.version }}
        </el-descriptions-item>
        <el-descriptions-item label="日志级别">
          <el-tag :type="getLogLevelType(config.logLevel)">
            {{ config.logLevel }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="Mock 开关">
          <el-switch :model-value="config.enableMock" disabled />
        </el-descriptions-item>
        <el-descriptions-item label="首页路径">
          {{ pageConfig.homePath }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
    
    <el-card class="features-card">
      <template #header>
        <div class="card-header">
          <span>功能开关</span>
        </div>
      </template>
      
      <div class="features-list">
        <el-tag 
          v-for="(enabled, feature) in config.features" 
          :key="feature"
          :type="enabled ? 'success' : 'info'"
          size="large"
        >
          {{ getFeatureName(feature) }}: {{ enabled ? '✓ 启用' : '✗ 禁用' }}
        </el-tag>
      </div>
    </el-card>
    
    <el-card class="switch-card">
      <template #header>
        <div class="card-header">
          <span>切换租户</span>
        </div>
      </template>
      
      <div class="tenant-buttons">
        <el-button @click="switchTenant(null)" type="primary" plain>
          默认配置
        </el-button>
        <el-button @click="switchTenant('demo')" type="success" plain>
          切换到演示租户
        </el-button>
        <el-button @click="switchTenant('enterprise')" type="warning" plain>
          切换到企业租户
        </el-button>
      </div>
      
      <el-alert 
        title="提示" 
        type="info" 
        :closable="false"
        style="margin-top: 16px"
      >
        切换租户后页面会自动刷新以加载新配置
      </el-alert>
    </el-card>
    
    <el-card class="raw-config-card">
      <template #header>
        <div class="card-header">
          <span>完整配置 (JSON)</span>
        </div>
      </template>
      
      <pre class="config-json">{{ JSON.stringify(fullConfig, null, 2) }}</pre>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { TenantResolver, ConfigLoader } from '@/config/loader'
import type { AppFullConfig, TenantInfo } from '@/config/types'

const tenantInfo = ref<TenantInfo | null>(null)
const config = ref<AppFullConfig['config']>({
  apiBaseUrl: '/api',
  logLevel: 'debug',
  version: '1.0.0',
  features: {}
})
const pageConfig = ref<AppFullConfig['pageConfig']>({
  source: 'local',
  apiBaseUrl: '/api',
  localPrefix: '/pages-config',
  homePath: '/home'
})
const fullConfig = ref<AppFullConfig | null>(null)

onMounted(async () => {
  // 获取当前租户
  const tenantId = TenantResolver.resolve()
  
  // 加载配置
  const loader = ConfigLoader.getInstance()
  const appConfig = await loader.loadConfig(tenantId || undefined)
  
  tenantInfo.value = appConfig.tenant || null
  config.value = appConfig.config
  pageConfig.value = appConfig.pageConfig
  fullConfig.value = appConfig
})

function switchTenant(tenantId: string | null) {
  if (tenantId) {
    TenantResolver.save(tenantId)
    window.location.href = `${window.location.origin}${window.location.pathname}?tenant=${tenantId}`
  } else {
    localStorage.removeItem('tenantId')
    window.location.href = `${window.location.origin}${window.location.pathname}`
  }
}

function getLogLevelType(level: string) {
  const types: Record<string, string> = {
    'debug': 'info',
    'info': 'success',
    'warn': 'warning',
    'error': 'danger'
  }
  return types[level] ?? 'info'
}

function getFeatureName(feature: string): string {
  const names: Record<string, string> = {
    'enableAI': 'AI 功能',
    'enableExport': '导出功能',
    'enableOffline': '离线模式'
  }
  return names[feature] || feature
}
</script>

<style scoped>
.tenant-config-demo {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.tenant-config-demo h2 {
  margin-bottom: 20px;
  color: #303133;
}

.el-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.tenant-info {
  padding: 10px 0;
}

.no-tenant {
  padding: 20px 0;
}

.color-demo {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  color: white;
  font-weight: 500;
}

.features-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 0;
}

.tenant-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.config-json {
  background-color: #f5f7fa;
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

@media (max-width: 768px) {
  .tenant-buttons {
    flex-direction: column;
  }
  
  .tenant-buttons .el-button {
    width: 100%;
  }
}
</style>
