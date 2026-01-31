<template>
  <div class="ej2-grid-demo">
    <div class="page-header">
      <h1>🎯 EJ2 Grid 组件演示</h1>
      <p>Renderer + 注册组件 (spark-ej2-grid / spark-ej2-column) 架构测试</p>
    </div>

    <div class="demo-sections">
      <!-- 基础网格演示 -->
      <div class="demo-section">
        <h2>基础网格演示</h2>
        <div class="grid-container">
          <RendererComponent :config="basicGridConfig" />
        </div>
      </div>

      <!-- 嵌套列演示 -->
      <div class="demo-section">
        <h2>嵌套列演示</h2>
        <div class="grid-container">
          <RendererComponent :config="nestedColumnsConfig" />
        </div>
      </div>

      <!-- 分页网格演示 -->
      <div class="demo-section">
        <h2>分页网格演示</h2>
        <div class="grid-container">
          <RendererComponent :config="pagingGridConfig" />
        </div>
      </div>

      <!-- 配置展示 -->
      <div class="demo-section">
        <h2>配置结构展示</h2>
        <div class="config-tabs">
          <div class="tab-buttons">
            <button
              v-for="tab in configTabs"
              :key="tab.key"
              :class="['tab-button', { active: activeTab === tab.key }]"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <div class="tab-content">
            <pre><code>{{ JSON.stringify(getCurrentConfig(), null, 2) }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import RendererComponent from '../features/ej2/components/RendererComponent.vue'

// 基础网格配置
const basicGridConfig = {
  type: 'spark-ej2-grid',
  dataSource: [
    { id: 1, name: '张三', age: 25, department: '技术部', salary: 8000 },
    { id: 2, name: '李四', age: 30, department: '销售部', salary: 7500 },
    { id: 3, name: '王五', age: 28, department: '人事部', salary: 7000 },
    { id: 4, name: '赵六', age: 35, department: '财务部', salary: 9000 },
    { id: 5, name: '孙七', age: 27, department: '技术部', salary: 8500 }
  ],
  allowPaging: false,
  height: '300px',
  children: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID', width: '80', textAlign: 'Center' },
    { type: 'spark-ej2-column', field: 'name', headerText: '姓名', width: '120' },
    { type: 'spark-ej2-column', field: 'age', headerText: '年龄', width: '80', textAlign: 'Center' },
    { type: 'spark-ej2-column', field: 'department', headerText: '部门', width: '120' },
    { type: 'spark-ej2-column', field: 'salary', headerText: '薪资', width: '100', textAlign: 'Right', format: 'C2' }
  ]
}

// 嵌套列配置
const nestedColumnsConfig = {
  type: 'spark-ej2-grid',
  dataSource: [
    { id: 1, name: '张三', personal: { age: 25, gender: '男' }, work: { department: '技术部', position: '工程师' }, salary: 8000 },
    { id: 2, name: '李四', personal: { age: 30, gender: '女' }, work: { department: '销售部', position: '经理' }, salary: 7500 },
    { id: 3, name: '王五', personal: { age: 28, gender: '男' }, work: { department: '人事部', position: '专员' }, salary: 7000 },
    { id: 4, name: '赵六', personal: { age: 35, gender: '女' }, work: { department: '财务部', position: '主管' }, salary: 9000 },
    { id: 5, name: '孙七', personal: { age: 27, gender: '男' }, work: { department: '技术部', position: '设计师' }, salary: 8500 }
  ],
  allowPaging: false,
  height: '350px',
  children: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID', width: '80', textAlign: 'Center' },
    { type: 'spark-ej2-column', field: 'name', headerText: '姓名', width: '120' },
    // 个人信息组
    {
      type: 'spark-ej2-column',
      headerText: '个人信息',
      textAlign: 'Center',
      children: [
        { type: 'spark-ej2-column', field: 'personal.age', headerText: '年龄', width: '80', textAlign: 'Center' },
        { type: 'spark-ej2-column', field: 'personal.gender', headerText: '性别', width: '80', textAlign: 'Center' }
      ]
    },
    // 工作信息组
    {
      type: 'spark-ej2-column',
      headerText: '工作信息',
      textAlign: 'Center',
      children: [
        { type: 'spark-ej2-column', field: 'work.department', headerText: '部门', width: '120' },
        { type: 'spark-ej2-column', field: 'work.position', headerText: '职位', width: '100' }
      ]
    },
    { type: 'spark-ej2-column', field: 'salary', headerText: '薪资', width: '100', textAlign: 'Right', format: 'C2' }
  ]
} 

// 分页网格配置
const pagingGridConfig = {
  type: 'spark-ej2-grid',
  dataSource: Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    name: `员工${i + 1}`,
    age: 20 + (i % 20),
    department: ['技术部', '销售部', '人事部', '财务部', '市场部'][i % 5],
    salary: 5000 + (i * 100),
    status: i % 3 === 0 ? '在职' : i % 3 === 1 ? '试用' : '离职'
  })),
  allowPaging: true,
  pageSettings: { pageSize: 10, pageSizes: [5, 10, 20, 50] },
  height: '400px',
  children: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID', width: '80', textAlign: 'Center' },
    { type: 'spark-ej2-column', field: 'name', headerText: '姓名', width: '120' },
    { type: 'spark-ej2-column', field: 'age', headerText: '年龄', width: '80', textAlign: 'Center' },
    { type: 'spark-ej2-column', field: 'department', headerText: '部门', width: '120' },
    { type: 'spark-ej2-column', field: 'salary', headerText: '薪资', width: '100', textAlign: 'Right', format: 'C2' },
    { type: 'spark-ej2-column', field: 'status', headerText: '状态', width: '80', textAlign: 'Center' }
  ]
}

// 配置标签页
const activeTab = ref('basic')
const configTabs = [
  { key: 'basic', label: '基础网格' },
  { key: 'nested', label: '嵌套列' },
  { key: 'paging', label: '分页网格' }
]

const getCurrentConfig = () => {
  switch (activeTab.value) {
    case 'basic': return basicGridConfig
    case 'nested': return nestedColumnsConfig
    case 'paging': return pagingGridConfig
    default: return basicGridConfig
  }
}

// Expose reactive data for testing
defineExpose({
  getActiveTab: () => activeTab.value,
  setActiveTab: (value: string) => activeTab.value = value
})

</script>

<style scoped>
.ej2-grid-demo {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  font-weight: 700;
}

.page-header p {
  font-size: 1.2rem;
  opacity: 0.9;
}

.demo-sections {
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  gap: 3rem;
}

.demo-section {
  background: rgba(255, 255, 255, 0.95);
  color: #333;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.demo-section h2 {
  color: #2c3e50;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.grid-container {
  border: 2px solid #e1e8ed;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.config-tabs {
  background: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
}

.tab-buttons {
  display: flex;
  background: #e9ecef;
  border-bottom: 1px solid #dee2e6;
}

.tab-button {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  color: #6c757d;
  transition: all 0.3s ease;
}

.tab-button:hover {
  background: #dee2e6;
}

.tab-button.active {
  background: white;
  color: #495057;
  border-bottom: 2px solid #007bff;
}

.tab-content {
  padding: 1.5rem;
  background: white;
  max-height: 400px;
  overflow-y: auto;
}

.tab-content pre {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
}

.tab-content code {
  background: #f1f3f4;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: #d73a49;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .ej2-grid-demo {
    padding: 1rem;
  }

  .page-header h1 {
    font-size: 2rem;
  }

  .demo-section {
    padding: 1.5rem;
  }

  .tab-buttons {
    flex-direction: column;
  }

  .tab-button {
    text-align: left;
  }
}
</style>