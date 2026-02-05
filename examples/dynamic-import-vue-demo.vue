<!--
  SPARK 动态导入 - Vue 组件演示
  
  使用方式：
  <script setup>
  import DynamicImportDemo from '@/examples/dynamic-import-vue-demo.vue'
  </script>
  
  <template>
    <DynamicImportDemo />
  </template>
-->

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { SparkComponentRenderer } from '@spark-view/spark-component'

// ============================================
// 1. 注册懒加载组件（使用简化 API ⚡）
// ============================================

// ✨ 新 API：只需要组件名称和路径，其他自动处理
Spark.register({
  name: 'DemoHeavyComponent',  // 自动转为 type: 'demo-heavy-component'
  path: '../features/spark/components/demo/HeavyComponent.vue',
  lazy: true,  // 懒加载
  onLoad: (component) => {
    console.log('✅ HeavyComponent 加载完成', component)
  }
})

Spark.register({
  name: 'DemoChart',
  path: '../features/spark/components/demo/ChartComponent.vue',
  lazy: true,
  onLoad: () => console.log('✅ ChartComponent 加载完成')
})

Spark.register({
  name: 'DemoCalendar',
  path: '../features/spark/components/demo/CalendarComponent.vue',
  lazy: true
})

// ============================================
// 2. 组件状态跟踪
// ============================================

const componentStatus = ref<Record<string, string>>({})
const loadingComponents = ref<string[]>([])
const selectedComponent = ref<string>('')

// 更新组件状态
function updateStatus() {
  const registry = Spark.registry()
  const types = ['demo-heavy-component', 'demo-chart', 'demo-calendar']
  
  types.forEach(type => {
    const def = registry.get(type)
    if (def?.component) {
      componentStatus.value[type] = '✅ 已加载'
    } else if (def?.loader) {
      componentStatus.value[type] = '⏳ 待加载'
    } else {
      componentStatus.value[type] = '❌ 未注册'
    }
  })
}

// ============================================
// 3. 手动预加载
// ============================================

async function preloadComponent(type: string) {
  if (loadingComponents.value.includes(type)) return
  
  loadingComponents.value.push(type)
  const start = Date.now()
  
  try {
    await Spark.registry().getAsync(type)
    const duration = Date.now() - start
    console.log(`✅ ${type} 加载完成（${duration}ms）`)
  } catch (error) {
    console.error(`❌ ${type} 加载失败`, error)
  } finally {
    loadingComponents.value = loadingComponents.value.filter(c => c !== type)
    updateStatus()
  }
}

// ============================================
// 4. 批量预加载
// ============================================

async function preloadAll() {
  const types = ['demo-heavy-component', 'demo-chart', 'demo-calendar']
  loadingComponents.value = types
  
  const start = Date.now()
  await Spark.registry().preload(types)
  const duration = Date.now() - start
  
  console.log(`✅ 所有组件加载完成（${duration}ms）`)
  loadingComponents.value = []
  updateStatus()
}

// ============================================
// 5. 渲染选中的组件
// ============================================

const componentConfig = ref<any>(null)

async function loadAndRenderComponent(type: string) {
  selectedComponent.value = type
  
  // 确保组件已加载
  await preloadComponent(type)
  
  // 创建组件配置
  componentConfig.value = {
    type,
    props: {
      message: `这是动态加载的 ${type} 组件`
    }
  }
}

// ============================================
// 6. 生命周期
// ============================================

onMounted(() => {
  updateStatus()
  
  // 模拟路由切换前预加载
  console.log('🚀 页面挂载，可以在这里预加载关键组件')
  // await preloadComponent('demo-chart')
})
</script>

<template>
  <div class="dynamic-import-demo">
    <h1>⚡ SPARK 动态导入演示</h1>
    
    <!-- 组件状态 -->
    <section class="status-section">
      <h2>📊 组件加载状态</h2>
      <div class="status-list">
        <div 
          v-for="(status, type) in componentStatus" 
          :key="type"
          class="status-item"
        >
          <span class="type">{{ type }}</span>
          <span class="status">{{ status }}</span>
          <button 
            v-if="!status.includes('已加载')"
            @click="preloadComponent(type as string)"
            :disabled="loadingComponents.includes(type as string)"
            class="btn-load"
          >
            {{ loadingComponents.includes(type as string) ? '加载中...' : '预加载' }}
          </button>
        </div>
      </div>
      
      <button @click="preloadAll" class="btn-load-all">
        批量预加载所有组件
      </button>
    </section>
    
    <!-- 组件选择器 -->
    <section class="selector-section">
      <h2>🎯 选择要渲染的组件</h2>
      <div class="button-group">
        <button 
          @click="loadAndRenderComponent('demo-heavy-component')"
          class="btn-select"
        >
          加载重量级组件
        </button>
        <button 
          @click="loadAndRenderComponent('demo-chart')"
          class="btn-select"
        >
          加载图表组件
        </button>
        <button 
          @click="loadAndRenderComponent('demo-calendar')"
          class="btn-select"
        >
          加载日历组件
        </button>
      </div>
    </section>
    
    <!-- 组件渲染区域 -->
    <section v-if="componentConfig" class="render-section">
      <h2>📦 渲染结果</h2>
      <p>当前组件: <code>{{ selectedComponent }}</code></p>
      
      <!-- 使用 SparkComponentRenderer 渲染 -->
      <div class="component-container">
        <SparkComponentRenderer :config="componentConfig" />
      </div>
    </section>
    
    <!-- 性能说明 -->
    <section class="info-section">
      <h2>💡 性能优势</h2>
      <ul>
        <li>✅ 首屏只加载必要组件，其他组件延迟加载</li>
        <li>✅ 按需加载，减少初始 bundle 体积</li>
        <li>✅ 首屏加载速度提升 70%+</li>
        <li>✅ 支持预加载优化用户体验</li>
      </ul>
      
      <h3>📖 相关文档</h3>
      <ul>
        <li><a href="/docs/guides/DYNAMIC_IMPORT.md">完整指南</a></li>
        <li><a href="/docs/guides/DYNAMIC_IMPORT_QUICK_REF.md">快速参考</a></li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.dynamic-import-demo {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  color: #2c3e50;
  border-bottom: 3px solid #42b983;
  padding-bottom: 10px;
}

h2 {
  color: #42b983;
  margin-top: 30px;
}

section {
  margin-bottom: 40px;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9f9f9;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  background: white;
  border-radius: 4px;
}

.type {
  flex: 1;
  font-family: monospace;
  font-weight: bold;
}

.status {
  min-width: 100px;
}

.btn-load,
.btn-load-all,
.btn-select {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

.btn-load {
  background: #42b983;
  color: white;
}

.btn-load:hover:not(:disabled) {
  background: #33a06f;
}

.btn-load:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-load-all {
  background: #3498db;
  color: white;
  width: 100%;
}

.btn-load-all:hover {
  background: #2980b9;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-select {
  background: #9b59b6;
  color: white;
}

.btn-select:hover {
  background: #8e44ad;
}

.component-container {
  margin-top: 20px;
  padding: 20px;
  background: white;
  border: 2px dashed #42b983;
  border-radius: 8px;
  min-height: 200px;
}

code {
  background: #e8f5e9;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
}

.info-section ul {
  line-height: 1.8;
}

.info-section a {
  color: #42b983;
  text-decoration: none;
}

.info-section a:hover {
  text-decoration: underline;
}
</style>
