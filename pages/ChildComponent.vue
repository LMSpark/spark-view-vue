<template>
  <div class="demo-section">
    <h2>子组件</h2>
    <div class="component-box child-component">
      <h3>数据消费者</h3>
      <p>接收到的数据: <strong>{{ injectedData?.message || '暂无数据' }}</strong></p>
      <p>接收时间: <strong>{{ injectedData?.timestamp || '暂无数据' }}</strong></p>
      <el-button type="success" @click="updateChildData">
        子组件处理数据
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, reactive, provide } from 'vue'
import { ElMessage } from 'element-plus'

// 注入父组件提供的数据
const injectedData = inject<{ message: string; timestamp: string }>('parentData') || {
  message: '暂无数据',
  timestamp: '暂无数据'
}

// 子组件自己的数据
const childData = reactive({
  message: 'Hello from Child',
  timestamp: new Date().toLocaleTimeString()
})

// 提供数据给孙子组件
provide('childData', childData)
provide('updateChildData', () => {
  childData.message = `Updated by Child: ${Date.now()}`
  childData.timestamp = new Date().toLocaleTimeString()
})

const updateChildData = () => {
  childData.message = `Updated by Child: ${Date.now()}`
  childData.timestamp = new Date().toLocaleTimeString()
  ElMessage.success('子组件数据已更新' as any)
}
</script>

<style scoped>
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

.child-component {
  border-color: #27ae60;
  background: linear-gradient(135deg, #ecf0f1 0%, #95a5a6 100%);
}
</style>