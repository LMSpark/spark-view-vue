<template>
  <div class="dashboard-page">
    <el-page-header content="管理仪表板" @back="$router.go(-1)">
      <template #icon>
        <span style="font-size: 20px">🏠</span>
      </template>
    </el-page-header>

    <div class="dashboard-content">
      <!-- 统计卡片 -->
      <el-row :gutter="20" class="stats-row">
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">👥</div>
              <div class="stats-info">
                <div class="stats-value">1,234</div>
                <div class="stats-label">用户总数</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">📊</div>
              <div class="stats-info">
                <div class="stats-value">567</div>
                <div class="stats-label">今日访问</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">🔥</div>
              <div class="stats-info">
                <div class="stats-value">89</div>
                <div class="stats-label">热门内容</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stats-card">
            <div class="stats-content">
              <div class="stats-icon">💰</div>
              <div class="stats-info">
                <div class="stats-value">¥12,345</div>
                <div class="stats-label">今日收入</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 功能区域 -->
      <el-row :gutter="20" class="feature-row">
        <el-col :span="12">
          <el-card header="快捷操作">
            <div class="quick-actions">
              <el-button-group>
                <el-button type="primary" @click="goToConfigPage">
                  📝 配置页面演示
                </el-button>
                <el-button type="success" @click="goToVueComponent">
                  🎯 Vue 组件页面
                </el-button>
                <el-button type="warning" @click="goToSettings">
                  ⚙️ 系统设置
                </el-button>
              </el-button-group>
            </div>
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card header="页面类型对比">
            <el-table :data="pageTypes" style="width: 100%">
              <el-table-column prop="type" label="页面类型" width="120" />
              <el-table-column prop="tech" label="技术实现" />
              <el-table-column prop="example" label="示例页面" />
            </el-table>
          </el-card>
        </el-col>
      </el-row>

      <!-- 提示信息 -->
      <el-alert 
        title="混合渲染模式" 
        type="info" 
        :closable="false"
        style="margin-top: 20px"
      >
        <template #default>
          <p>🎯 <strong>当前页面</strong>: Vue 组件页面 (传统开发模式)</p>
          <p>📊 <strong>配置页面</strong>: 通过 JSON 配置生成 (零代码模式)</p>
          <p>🔄 <strong>混合模式</strong>: 同时支持两种页面渲染方式</p>
        </template>
      </el-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 页面类型对比数据
const pageTypes = ref([
  {
    type: 'Vue 组件',
    tech: 'Vue SFC + TypeScript',
    example: '管理仪表板'
  },
  {
    type: '配置页面', 
    tech: 'JSON DSL + PageRenderer',
    example: '工作台'
  },
  {
    type: 'SPARK 组件',
    tech: 'SPARK 组件系统',
    example: '表格演示'
  }
])

// 快捷操作
const goToConfigPage = () => {
  router.push('/')
}

const goToVueComponent = () => {
  router.push('/about')
}

const goToSettings = () => {
  router.push('/settings')
}
</script>

<style scoped>
.dashboard-page {
  padding: 24px;
}

.dashboard-content {
  margin-top: 24px;
}

.stats-row {
  margin-bottom: 24px;
}

.stats-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
}

.stats-card :deep(.el-card__body) {
  padding: 20px;
}

.stats-content {
  display: flex;
  align-items: center;
}

.stats-icon {
  font-size: 40px;
  margin-right: 16px;
}

.stats-value {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stats-label {
  font-size: 14px;
  opacity: 0.9;
}

.feature-row {
  margin-bottom: 24px;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-actions .el-button-group {
  display: flex;
  flex-direction: column;
}

.quick-actions .el-button {
  margin-left: 0 !important;
  margin-bottom: 8px;
  justify-content: flex-start;
}
</style>