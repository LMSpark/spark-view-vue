<template>
  <div class="capability-demo">
    <h1>🎯 SPARK 能力系统完整演示</h1>
    <p class="subtitle">三层级组件：模型级 → 实例级 → 字段级</p>

    <!-- 模型级组件：UserGrid -->
    <div class="model-level">
      <h2>📊 模型级组件 (UserGrid)</h2>
      <UserGrid :config="gridConfig" />
    </div>

    <!-- 调试信息 -->
    <div class="debug-panel">
      <h3>🔍 能力系统调试信息</h3>
      <div class="debug-content">
        <div class="debug-section">
          <h4>能力树结构：</h4>
          <pre>{{ capabilityTreeInfo }}</pre>
        </div>
        <div class="debug-section">
          <h4>事件日志：</h4>
          <div class="event-log">
            <div v-for="(log, index) in eventLogs" :key="index" class="log-item">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-event">{{ log.event }}</span>
              <span class="log-data">{{ log.data }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import UserGrid from '../components/demo/UserGrid.vue'
import type { ComponentConfig } from '@spark-view/spark-component'

// 模拟用户数据
const users = [
  { id: 1, name: '张三', age: 28, email: 'zhangsan@example.com', status: 'active' },
  { id: 2, name: '李四', age: 32, email: 'lisi@example.com', status: 'inactive' },
  { id: 3, name: '王五', age: 25, email: 'wangwu@example.com', status: 'active' },
]

// Grid 配置
const gridConfig = reactive<ComponentConfig>({
  type: 'user-grid',
  id: 'demo-user-grid',
  props: {
    users: users,
    columns: [
      { field: 'name', label: '姓名', width: 120 },
      { field: 'age', label: '年龄', width: 80 },
      { field: 'email', label: '邮箱', width: 200 },
      { field: 'status', label: '状态', width: 100 }
    ]
  }
})

// 事件日志
const eventLogs = ref<Array<{ time: string, event: string, data: string }>>([])

// 能力树信息
const capabilityTreeInfo = ref('')

// 添加事件日志
const addLog = (event: string, data: unknown) => {
  const time = new Date().toLocaleTimeString()
  eventLogs.value.unshift({
    time,
    event,
    data: JSON.stringify(data)
  })
  if (eventLogs.value.length > 10) {
    eventLogs.value.pop()
  }
}

onMounted(() => {
  // 模拟能力树信息
  capabilityTreeInfo.value = `
APP Context (app-root-context)
  └─ Page Context (page-root-context)
      └─ UserGrid (demo-user-grid) [模型级]
          ├─ Providers: 
          │   ├─ selection (选择能力)
          │   ├─ gridEvents (Grid事件)
          │   └─ dataSource (数据源能力)
          └─ Children:
              ├─ UserRow (row-1) [实例级]
              │   ├─ Consumers: selection, gridEvents
              │   └─ Children:
              │       ├─ NameField (field-name-1) [字段级]
              │       │   └─ Consumers: rowData
              │       ├─ AgeField (field-age-1) [字段级]
              │       │   └─ Consumers: rowData
              │       └─ EmailField (field-email-1) [字段级]
              │           └─ Consumers: rowData
              ├─ UserRow (row-2) [实例级]
              └─ UserRow (row-3) [实例级]
  `
  
  addLog('demo:mounted', { message: 'Capability system demo initialized' })
})
</script>

<style scoped>
.capability-demo {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

h1 {
  color: #2c3e50;
  margin-bottom: 8px;
}

.subtitle {
  color: #7f8c8d;
  font-size: 14px;
  margin-bottom: 30px;
}

.model-level {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
  border: 2px solid #e9ecef;
}

.model-level h2 {
  margin-top: 0;
  color: #495057;
  font-size: 18px;
  margin-bottom: 20px;
}

.debug-panel {
  background: #fff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
}

.debug-panel h3 {
  margin-top: 0;
  color: #495057;
  font-size: 16px;
  margin-bottom: 16px;
}

.debug-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.debug-section h4 {
  font-size: 14px;
  color: #6c757d;
  margin-top: 0;
  margin-bottom: 12px;
}

.debug-section pre {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
}

.event-log {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.log-item {
  display: grid;
  grid-template-columns: 80px 150px 1fr;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #e9ecef;
  font-size: 12px;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  color: #6c757d;
}

.log-event {
  color: #0d6efd;
  font-weight: 500;
}

.log-data {
  color: #495057;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
