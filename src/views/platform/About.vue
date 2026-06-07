<template>
  <div class="about-page">
    <el-page-header content="关于系统" @back="$router.go(-1)">
      <template #icon>
        <span style="font-size: 20px">ℹ️</span>
      </template>
    </el-page-header>

    <div class="about-content">
      <el-card class="info-card">
        <h2>🎯 SPARK 混合渲染系统</h2>
        <p class="description">
          这是一个支持 <strong>配置页面</strong> 和 <strong>Vue 组件页面</strong> 混合渲染的系统演示。
        </p>

        <el-row :gutter="20" class="comparison-row">
          <el-col :span="12">
            <el-card header="📊 配置页面" class="mode-card config-mode">
              <ul class="feature-list">
                <li>✅ 零代码开发</li>
                <li>✅ JSON DSL 配置</li>
                <li>✅ 动态渲染</li>
                <li>✅ 快速迭代</li>
                <li>✅ 业务人员友好</li>
              </ul>
              <div class="mode-example">
                <strong>示例页面:</strong> 工作台、表格演示、表单演示
              </div>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card header="🎯 Vue 组件页面" class="mode-card vue-mode">
              <ul class="feature-list">
                <li>✅ 完全自由度</li>
                <li>✅ TypeScript 支持</li>
                <li>✅ 复杂交互</li>
                <li>✅ 高性能</li>
                <li>✅ 开发人员友好</li>
              </ul>
              <div class="mode-example">
                <strong>示例页面:</strong> 管理仪表板、关于页面、设置页面
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 技术架构 -->
        <el-card header="🔧 技术架构" class="arch-card">
          <div class="arch-diagram">
            <div class="arch-layer">
              <div class="layer-title">L3: 应用层</div>
              <div class="layer-content">SparkApp.start() 统一启动</div>
            </div>
            <div class="arch-arrow">⬇️</div>
            <div class="arch-layer">
              <div class="layer-title">L2: 路由层</div>
              <div class="layer-content">混合路由系统 (静态 + 动态)</div>
            </div>
            <div class="arch-arrow">⬇️</div>
            <div class="arch-layer">
              <div class="layer-title">L1: 渲染层</div>
              <div class="layer-content">Vue 组件 + PageRenderer</div>
            </div>
          </div>
        </el-card>

        <!-- 功能特性 -->
        <el-card header="✨ 核心特性" class="features-card">
          <el-row :gutter="16">
            <el-col :span="8" v-for="feature in features" :key="feature.title">
              <div class="feature-item">
                <div class="feature-icon"><NavIcon :name="feature.icon" :size="24" /></div>
                <div class="feature-title">{{ feature.title }}</div>
                <div class="feature-desc">{{ feature.description }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 快速导航 -->
        <el-card header="🔗 快速导航" class="nav-card">
          <div class="nav-buttons">
            <el-button 
              v-for="nav in navigations" 
              :key="nav.path"
              :type="nav.type"
              @click="$router.push(nav.path)"
            >
              <NavIcon :name="nav.icon" /> {{ nav.title }}
            </el-button>
          </div>
        </el-card>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 关于页面，展示系统版本、技术栈和项目信息；属于平台路由页，不允许作为 SparkNode 组件配置生成。
 */
/**
 * 关于页面 - 系统介绍和架构说明
 * 
 * @component About
 * @description
 * 系统概览页面，展示 SPARK 混合渲染系统的核心特性、技术架构和开发模式对比。
 * 帮助用户和开发者快速了解系统能力和使用场景。
 * 
 * 核心功能：
 * 1. **渲染模式对比**：对比配置页面和 Vue 组件页面的优劣势
 * 2. **技术架构图**：展示 L3 应用层、L2 路由层、L1 渲染层的三层架构
 * 3. **核心特性展示**：快速启动、混合渲染、响应式设计、类型安全、高性能、可扩展
 * 4. **快速导航**：提供快速跳转到其他示例页面的入口
 * 5. **友好界面**：图标化展示，提升可读性和美观度
 * 
 * @example
 * 路由配置：
 * ```typescript
 * {
 *   path: '/about',
 *   component: About
 * }
 * ```
 * 
 * @author SPARK Team
 * @since 1.0.0
 */
import { ref } from 'vue'
import NavIcon from '@/components/NavIcon.vue'

// 核心特性
const features = ref([
  {
    icon: 'Promotion',
    title: '快速启动',
    description: 'SparkApp.start() 一键启动，零配置开箱即用'
  },
  {
    icon: 'Brush',
    title: '混合渲染',
    description: '支持配置页面和 Vue 组件页面混合使用'
  },
  {
    icon: 'Monitor',
    title: '响应式设计',
    description: '基于 Element Plus 的现代化 UI 界面'
  },
  {
    icon: 'SetUp',
    title: '类型安全',
    description: 'TypeScript 全栈支持，编译时错误检查'
  },
  {
    icon: 'Lightning',
    title: '高性能',
    description: 'Vue 3 + Vite 构建，极速开发体验'
  },
  {
    icon: 'Connection',
    title: '可扩展',
    description: '插件化架构，支持自定义组件和功能'
  }
])

// 导航链接
const navigations = [
  { path: '/', title: '工作台', icon: 'DataBoard', type: 'success' },
  { path: '/vxe-demo', title: '表格演示', icon: 'TrendCharts', type: 'warning' },
  { path: '/settings', title: '系统设置', icon: 'Setting', type: 'info' }
]
</script>

<style scoped>
.about-page {
  padding: 24px;
}

.about-content {
  margin-top: 24px;
}

.info-card {
  max-width: 1200px;
  margin: 0 auto;
}

.description {
  font-size: 16px;
  color: #666;
  margin: 20px 0;
  text-align: center;
}

.comparison-row {
  margin: 30px 0;
}

.mode-card {
  height: 280px;
}

.config-mode {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.vue-mode {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.mode-card :deep(.el-card__header) {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: inherit;
  font-weight: bold;
}

.mode-card :deep(.el-card__body) {
  color: inherit;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 16px 0;
}

.feature-list li {
  padding: 6px 0;
  font-size: 14px;
}

.mode-example {
  margin-top: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-size: 13px;
}

.arch-card {
  margin: 20px 0;
}

.arch-diagram {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.arch-layer {
  background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
  color: white;
  padding: 20px 40px;
  border-radius: 12px;
  text-align: center;
  width: 300px;
}

.layer-title {
  font-weight: bold;
  font-size: 16px;
  margin-bottom: 8px;
}

.layer-content {
  font-size: 14px;
  opacity: 0.9;
}

.arch-arrow {
  font-size: 24px;
  margin: 16px 0;
  color: #74b9ff;
}

.features-card {
  margin: 20px 0;
}

.feature-item {
  text-align: center;
  padding: 20px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.feature-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.feature-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 6px;
  color: #303133;
}

.feature-desc {
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
}

.nav-card {
  margin: 20px 0;
}

.nav-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.nav-buttons .el-button {
  flex: 1;
  min-width: 200px;
}
</style>
