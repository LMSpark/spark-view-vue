<template>
  <div class="ej2-native-demo">
    <div class="page-header">
      <h1>🎯 EJ2 原生组件演示</h1>
      <p>直接使用 GridComponent + ColumnComponent</p>
    </div>

    <div class="demo-sections">
      <!-- 基础网格演示 -->
      <div class="demo-section">
        <h2>基础网格演示</h2>
        <div class="grid-container">
          <GridComponent :config="basicGridConfig" />
        </div>
      </div>

      <!-- 嵌套列演示 -->
      <div class="demo-section">
        <h2>嵌套列演示</h2>
        <div class="grid-container">
          <GridComponent :config="nestedColumnsConfig" />
        </div>
      </div>

      <!-- 分页网格演示 -->
      <div class="demo-section">
        <h2>分页网格演示</h2>
        <div class="grid-container">
          <GridComponent :config="pagingGridConfig" />
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
import GridComponent from '../features/ej2/components/GridComponent.vue'

// 基础网格配置
const basicGridConfig = {
  dataSource: [
    { id: 1, name: '张三', age: 25, city: '北京' },
    { id: 2, name: '李四', age: 30, city: '上海' },
    { id: 3, name: '王五', age: 28, city: '广州' },
    { id: 4, name: '赵六', age: 35, city: '深圳' },
    { id: 5, name: '孙七', age: 22, city: '杭州' }
  ],
  allowPaging: false,
  height: '300px',
  children: [
    { type: 'ColumnComponent', field: 'id', headerText: 'ID', width: '80' },
    { type: 'ColumnComponent', field: 'name', headerText: '姓名', width: '120' },
    { type: 'ColumnComponent', field: 'age', headerText: '年龄', width: '100' },
    { type: 'ColumnComponent', field: 'city', headerText: '城市', width: '120' }
  ]
}

// 嵌套列配置
const nestedColumnsConfig = {
  dataSource: [
    { id: 1, name: '张三', age: 25, city: '北京', department: '技术部', position: '工程师' },
    { id: 2, name: '李四', age: 30, city: '上海', department: '销售部', position: '经理' },
    { id: 3, name: '王五', age: 28, city: '广州', department: '技术部', position: '设计师' },
    { id: 4, name: '赵六', age: 35, city: '深圳', department: '财务部', position: '会计' },
    { id: 5, name: '孙七', age: 22, city: '杭州', department: '人事部', position: '助理' }
  ],
  allowPaging: false,
  height: '350px',
  children: [
    { type: 'ColumnComponent', field: 'id', headerText: 'ID', width: '80' },
    { type: 'ColumnComponent', field: 'name', headerText: '姓名', width: '120' },
    {
      type: 'ColumnComponent',
      headerText: '个人信息',
      children: [
        { type: 'ColumnComponent', field: 'age', headerText: '年龄', width: '100' },
        { type: 'ColumnComponent', field: 'city', headerText: '城市', width: '120' }
      ]
    },
    {
      type: 'ColumnComponent',
      headerText: '工作信息',
      children: [
        { type: 'ColumnComponent', field: 'department', headerText: '部门', width: '120' },
        { type: 'ColumnComponent', field: 'position', headerText: '职位', width: '120' }
      ]
    }
  ]
}

// 分页网格配置
const pagingGridConfig = {
  dataSource: [
    { id: 1, name: '张三', age: 25, city: '北京', email: 'zhangsan@example.com' },
    { id: 2, name: '李四', age: 30, city: '上海', email: 'lisi@example.com' },
    { id: 3, name: '王五', age: 28, city: '广州', email: 'wangwu@example.com' },
    { id: 4, name: '赵六', age: 35, city: '深圳', email: 'zhaoliu@example.com' },
    { id: 5, name: '孙七', age: 22, city: '杭州', email: 'sunqi@example.com' },
    { id: 6, name: '周八', age: 27, city: '南京', email: 'zhouba@example.com' },
    { id: 7, name: '吴九', age: 33, city: '苏州', email: 'wujiu@example.com' },
    { id: 8, name: '郑十', age: 29, city: '武汉', email: 'zhengshi@example.com' },
    { id: 9, name: '王十一', age: 31, city: '西安', email: 'wangshiyi@example.com' },
    { id: 10, name: '陈十二', age: 26, city: '成都', email: 'chenshier@example.com' },
    { id: 11, name: '林十三', age: 24, city: '厦门', email: 'linshisan@example.com' },
    { id: 12, name: '黄十四', age: 32, city: '青岛', email: 'huangshisi@example.com' },
    { id: 13, name: '徐十五', age: 28, city: '大连', email: 'xushiwu@example.com' },
    { id: 14, name: '刘十六', age: 34, city: '沈阳', email: 'liushiliu@example.com' },
    { id: 15, name: '杨十七', age: 23, city: '长春', email: 'yangshiqi@example.com' }
  ],
  allowPaging: true,
  pageSettings: { pageSize: 5, pageSizes: [5, 10, 20] },
  height: '400px',
  children: [
    { type: 'ColumnComponent', field: 'id', headerText: 'ID', width: '80' },
    { type: 'ColumnComponent', field: 'name', headerText: '姓名', width: '120' },
    { type: 'ColumnComponent', field: 'age', headerText: '年龄', width: '100' },
    { type: 'ColumnComponent', field: 'city', headerText: '城市', width: '120' },
    { type: 'ColumnComponent', field: 'email', headerText: '邮箱', width: '200' }
  ]
}

// 配置标签页
const configTabs = [
  { key: 'basic', label: '基础网格' },
  { key: 'nested', label: '嵌套列' },
  { key: 'paging', label: '分页网格' }
]

const activeTab = ref('basic')

const getCurrentConfig = () => {
  switch (activeTab.value) {
    case 'basic':
      return basicGridConfig
    case 'nested':
      return nestedColumnsConfig
    case 'paging':
      return pagingGridConfig
    default:
      return basicGridConfig
  }
}
</script>

<style scoped>
.ej2-native-demo {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 40px;
}

.page-header h1 {
  color: #2c3e50;
  margin-bottom: 10px;
}

.page-header p {
  color: #7f8c8d;
  font-size: 16px;
}

.demo-sections {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.demo-section {
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  padding: 20px;
  background: #fff;
}

.demo-section h2 {
  color: #34495e;
  margin-bottom: 20px;
  border-bottom: 2px solid #3498db;
  padding-bottom: 10px;
}

.grid-container {
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.config-tabs {
  border: 1px solid #ddd;
  border-radius: 4px;
}

.tab-buttons {
  display: flex;
  border-bottom: 1px solid #ddd;
}

.tab-button {
  padding: 10px 20px;
  border: none;
  background: #f8f9fa;
  cursor: pointer;
  border-right: 1px solid #ddd;
  transition: background-color 0.3s;
}

.tab-button:last-child {
  border-right: none;
}

.tab-button.active {
  background: #3498db;
  color: white;
}

.tab-button:hover:not(.active) {
  background: #e9ecef;
}

.tab-content {
  padding: 20px;
  background: #f8f9fa;
}

.tab-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.tab-content code {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.4;
}
</style>