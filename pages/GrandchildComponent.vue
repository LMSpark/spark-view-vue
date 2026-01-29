<template>
  <div class="demo-section">
    <h2>孙子组件</h2>
    <div class="component-box grandchild-component">
      <h3>深度数据消费者</h3>
      <p>从父组件接收: <strong>{{ parentData?.message || '暂无数据' }}</strong></p>
      <!-- 兄弟组件无法注入子组件数据，移除这个引用 -->
      <p>孙子组件时间: <strong>{{ grandchildData.timestamp }}</strong></p>
      <el-button type="warning" @click="updateGrandchildData">
        孙子组件操作
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, reactive, provide } from 'vue'
import { ElMessage } from 'element-plus'

// 注入父组件提供的数据
const parentData = inject<{ message: string; timestamp: string }>('parentData') || {
  message: '暂无数据',
  timestamp: '暂无数据'
}

// 注入子组件提供的数据 - 兄弟组件无法注入，移除这个
// const childData = inject('childData')

// 孙子组件自己的数据
const grandchildData = reactive({
  message: 'Hello from Grandchild',
  timestamp: new Date().toLocaleTimeString()
})

// 提供数据给更深层的组件（如果需要）
provide('grandchildData', grandchildData)
provide('updateGrandchildData', () => {
  grandchildData.message = `Updated by Grandchild: ${Date.now()}`
  grandchildData.timestamp = new Date().toLocaleTimeString()
})

const updateGrandchildData = () => {
  grandchildData.message = `Updated by Grandchild: ${Date.now()}`
  grandchildData.timestamp = new Date().toLocaleTimeString()
  ElMessage.success('孙子组件数据已更新' as any)
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

.grandchild-component {
  border-color: #e67e22;
  background: linear-gradient(135deg, #ecf0f1 0%, #7f8c8d 100%);
}
</style>