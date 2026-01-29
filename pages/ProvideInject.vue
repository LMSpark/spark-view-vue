<template>
  <div class="provide-inject-page">
    <div class="page-header">
      <h1>🚀 主动provide/inject架构</h1>
      <p>Vue 3 Composition API 的上下文共享演示</p>
    </div>

    <div class="demo-container">
      <div class="demo-section">
        <h2>父组件</h2>
        <div class="component-box parent-component">
          <h3>数据提供者</h3>
          <p>当前数据: <strong>{{ parentData.message }}</strong></p>
          <p>更新时间: <strong>{{ parentData.timestamp }}</strong></p>
          <el-button type="primary" @click="updateParentData">
            更新父组件数据
          </el-button>
        </div>
      </div>

      <!-- 子组件 -->
      <ChildComponent />

      <!-- 孙子组件 - 现在是独立的兄弟组件 -->
      <GrandchildComponent />
    </div>

    <div class="actions">
      <el-button size="large" @click="goBack">
        ← 返回首页
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { provide, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import ChildComponent from './ChildComponent.vue'
import GrandchildComponent from './GrandchildComponent.vue'

// 父组件数据
const parentData = reactive({
  message: 'Hello from Parent',
  timestamp: new Date().toLocaleTimeString()
})

// 提供数据给子组件
provide('parentData', parentData)
provide('updateParentData', () => {
  parentData.message = `Updated by Parent: ${Date.now()}`
  parentData.timestamp = new Date().toLocaleTimeString()
})

const router = useRouter()

const updateParentData = () => {
  parentData.message = `Updated by Parent: ${Date.now()}`
  parentData.timestamp = new Date().toLocaleTimeString()
  ElMessage.success('父组件数据已更新' as any)
}

const goBack = () => {
  router.push('/')
}
</script>

<style scoped>
.provide-inject-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 2rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.page-header p {
  font-size: 1.1rem;
  color: #7f8c8d;
}

.demo-container {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.demo-section {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}

.demo-section h2 {
  color: #34495e;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
}

.component-box {
  border: 2px solid #e0e6ed;
  border-radius: 8px;
  padding: 1.5rem;
  background: #fafbfc;
}

.component-box h3 {
  color: #2c3e50;
  margin-bottom: 1rem;
  font-size: 1.2rem;
}

.component-box p {
  margin: 0.5rem 0;
  color: #5a6c7d;
}

.parent-component {
  border-color: #3498db;
  background: linear-gradient(135deg, #ecf0f1 0%, #bdc3c7 100%);
}

.child-component {
  border-color: #27ae60;
  background: linear-gradient(135deg, #ecf0f1 0%, #95a5a6 100%);
}

.grandchild-component {
  border-color: #e67e22;
  background: linear-gradient(135deg, #ecf0f1 0%, #7f8c8d 100%);
}

.actions {
  text-align: center;
  margin-top: 2rem;
}
</style>