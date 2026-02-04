<template>
  <div class="capability-demo">
    <h1>🎯 能力管理系统演示</h1>
    
    <div class="demo-section">
      <h2>📊 DataSet 能力管理器</h2>
      <div class="info-box">
        <p><strong>上下文 ID:</strong> {{ dataSetContext?.id }}</p>
        <p><strong>注册能力数:</strong> {{ providersCount }}</p>
      </div>

      <div class="capability-grid">
        <!-- DataSet State 能力 -->
        <div class="capability-card">
          <h3>🗄️ DataSet State</h3>
          <div class="capability-content">
            <p><strong>表数量:</strong> {{ tableCount }}</p>
            <p><strong>页面参数:</strong></p>
            <pre>{{ JSON.stringify(pageParams, null, 2) }}</pre>
            <p><strong>页面权限:</strong></p>
            <pre>{{ JSON.stringify(pagePermission, null, 2) }}</pre>
            <button @click="addTableRow" class="btn-primary">
              添加数据行
            </button>
            <p v-if="lastAddedRow" class="success-msg">
              ✅ 已添加: {{ lastAddedRow.name }}
            </p>
          </div>
        </div>

        <!-- Global Data 能力 -->
        <div class="capability-card">
          <h3>🌐 Global Data</h3>
          <div class="capability-content">
            <p><strong>用户信息:</strong></p>
            <pre>{{ JSON.stringify(userInfo, null, 2) }}</pre>
            <p><strong>主题配置:</strong> {{ themeConfig }}</p>
            <p><strong>字典选项:</strong></p>
            <ul>
              <li v-for="item in dictionary" :key="item.value">
                {{ item.label }} ({{ item.value }})
              </li>
            </ul>
          </div>
        </div>

        <!-- Page Service 能力 -->
        <div class="capability-card">
          <h3>🔔 Page Service</h3>
          <div class="capability-content">
            <div class="button-group">
              <button @click="showSuccessMessage" class="btn-success">
                成功消息
              </button>
              <button @click="showErrorMessage" class="btn-error">
                错误消息
              </button>
              <button @click="showWarningMessage" class="btn-warning">
                警告消息
              </button>
              <button @click="showConfirmDialog" class="btn-primary">
                确认对话框
              </button>
              <button @click="navigateExample" class="btn-secondary">
                导航示例
              </button>
            </div>
            <p v-if="lastMessage" class="message-log">
              {{ lastMessage }}
            </p>
          </div>
        </div>

        <!-- API Client 能力 -->
        <div class="capability-card">
          <h3>🌐 API Client</h3>
          <div class="capability-content">
            <button @click="makeApiCall" class="btn-primary" :disabled="apiLoading">
              {{ apiLoading ? '请求中...' : '发起 API 请求' }}
            </button>
            <div v-if="apiResponse" class="api-response">
              <p><strong>响应:</strong></p>
              <pre>{{ JSON.stringify(apiResponse, null, 2) }}</pre>
            </div>
            <p v-if="apiError" class="error-msg">
              ❌ {{ apiError }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="demo-section">
      <h2>🧩 表变化监听</h2>
      <div class="info-box">
        <p><strong>监听状态:</strong> {{ isListening ? '✅ 已启动' : '⏸️ 已停止' }}</p>
        <p><strong>变化次数:</strong> {{ changeCount }}</p>
        <button @click="toggleListener" :class="isListening ? 'btn-warning' : 'btn-primary'">
          {{ isListening ? '停止监听' : '启动监听' }}
        </button>
      </div>
      <div v-if="changeHistory.length > 0" class="change-history">
        <h4>变化历史:</h4>
        <ul>
          <li v-for="(change, index) in changeHistory" :key="index">
            {{ change }}
          </li>
        </ul>
      </div>
    </div>

    <div class="demo-section">
      <h2>📋 数据表内容</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>姓名</th>
              <th>年龄</th>
              <th>部门</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="row.id">
              <td>{{ row.id }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.age }}</td>
              <td>{{ row.department }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="demo-section">
      <h2>📊 统计信息</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ providersCount }}</div>
          <div class="stat-label">注册能力</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ tableCount }}</div>
          <div class="stat-label">数据表</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ tableRows.length }}</div>
          <div class="stat-label">数据行</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ changeCount }}</div>
          <div class="stat-label">变化次数</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// @ts-nocheck
/* 演示页面 - 禁用类型检查以简化实现 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SparkData, createDataSetCapabilityManager } from '@spark-view/spark-data'

// DataSet 能力管理器
let capabilityManager: any = null
const dataSetContext = ref<any>(null)
const userInfo = ref<any>(null)
const themeConfig = ref<string>('')
const dictionary = ref<any[]>([])
const pageParams = ref<any>({})
const pagePermission = ref<any>({})
const tableCount = ref(0)
const tableRows = ref<any[]>([])
const lastAddedRow = ref<any>(null)
const lastMessage = ref('')
const apiResponse = ref<any>(null)
const apiError = ref('')
const apiLoading = ref(false)

// 监听器状态
const isListening = ref(false)
const changeCount = ref(0)
const changeHistory = ref<string[]>([])
let unsubscribe: (() => void) | null = null

const providersCount = computed(() => {
  return dataSetContext.value?.providers?.size ?? 0
})

// 初始化 DataSet
const mockDataSet = SparkData.createDataSet({
  dataSetName: 'DemoData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'string', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'department', type: 'string' }
      ],
      rows: [
        { id: '1', name: '张三', age: 30, department: '技术部' },
        { id: '2', name: '李四', age: 28, department: '产品部' },
        { id: '3', name: '王五', age: 35, department: '设计部' }
      ]
    }
  }
})

// 模拟 API 客户端
const mockApiClient = {
  async request<T>(config: any): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return {
      data: {
        status: 'success',
        timestamp: new Date().toISOString(),
        endpoint: config.url,
        method: config.method || 'GET'
      },
      message: '请求成功'
    } as T
  }
}

// 初始化能力管理器
onMounted(() => {
  capabilityManager = createDataSetCapabilityManager('demo-page', {
    dataSet: mockDataSet,
    pageParams: { id: '123', type: 'demo' },
    pagePermission: { canEdit: true, canDelete: false, canExport: true },
    globalData: {
      getUserInfo: () => ({ id: 'user001', name: '演示用户', roles: ['admin', 'developer'] }),
      getConfig: (key: string) => {
        const configs: Record<string, any> = {
          theme: 'dark',
          language: 'zh-CN',
          timezone: 'Asia/Shanghai'
        }
        return configs[key]
      },
      getDictionary: (type: string) => {
        if (type === 'department') {
          return [
            { label: '技术部', value: 'tech' },
            { label: '产品部', value: 'product' },
            { label: '设计部', value: 'design' }
          ]
        }
        return []
      }
    },
    pageService: {
      showMessage: (message: string, type: 'success' | 'error' | 'warning') => {
        lastMessage.value = `[${type.toUpperCase()}] ${message}`
        setTimeout(() => { lastMessage.value = '' }, 3000)
      },
      showConfirm: async (message: string) => {
        lastMessage.value = `[确认对话框] ${message}`
        return confirm(message)
      },
      showLoading: (show: boolean) => {
        lastMessage.value = show ? '⏳ 加载中...' : '✅ 加载完成'
      },
      navigate: (path: string, params?: Record<string, unknown>) => {
        lastMessage.value = `🧭 导航到: ${path} ${params ? JSON.stringify(params) : ''}`
      }
    },
    apiClient: mockApiClient
  })

  // 获取上下文和能力
  const context = capabilityManager.getContext()
  dataSetContext.value = context

  // 获取各个能力
  const providers = Array.from(context.providers)
  
  // 获取 GlobalData 能力
  const globalDataProvider = providers.find((p: any) => p.name === 'globalData')
  if (globalDataProvider) {
    userInfo.value = (globalDataProvider.implementation as any).getUserInfo()
    themeConfig.value = (globalDataProvider.implementation as any).getConfig('theme')
    dictionary.value = (globalDataProvider.implementation as any).getDictionary('department')
  }

  // 获取 DataSetState 能力
  const dataSetStateProvider = providers.find((p: any) => p.name === 'dataSetState')
  if (dataSetStateProvider) {
    pageParams.value = (dataSetStateProvider.implementation as any).getPageParams()
    pagePermission.value = (dataSetStateProvider.implementation as any).getPagePermission()
    const ds = (dataSetStateProvider.implementation as any).getDataSet()
    tableCount.value = Object.keys(ds.tables).length
    tableRows.value = ds.tables.Users.rows
  }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
  capabilityManager?.dispose()
})

// 操作方法
function addTableRow() {
  const newRow = {
    id: `${Date.now()}`,
    name: `新用户${tableRows.value.length + 1}`,
    age: Math.floor(Math.random() * 30) + 20,
    department: ['技术部', '产品部', '设计部'][Math.floor(Math.random() * 3)]
  }
  
  mockDataSet.tables.Users.rows.push(newRow)
  tableRows.value = [...mockDataSet.tables.Users.rows]
  lastAddedRow.value = newRow
  
  // 触发变化通知
  if (capabilityManager) {
    capabilityManager.notifyTableChange('Users', mockDataSet.tables.Users)
  }
  
  setTimeout(() => { lastAddedRow.value = null }, 3000)
}

function showSuccessMessage() {
  const context = capabilityManager?.getContext()
  const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'pageService')
  if (provider) {
    (provider.implementation as any).showMessage('操作成功完成！', 'success')
  }
}

function showErrorMessage() {
  const context = capabilityManager?.getContext()
  const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'pageService')
  if (provider) {
    (provider.implementation as any).showMessage('发生错误，请重试', 'error')
  }
}

function showWarningMessage() {
  const context = capabilityManager?.getContext()
  const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'pageService')
  if (provider) {
    (provider.implementation as any).showMessage('请注意检查输入', 'warning')
  }
}

async function showConfirmDialog() {
  const context = capabilityManager?.getContext()
  const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'pageService')
  if (provider) {
    const result = await (provider.implementation as any).showConfirm('确定要执行此操作吗？')
    lastMessage.value = result ? '✅ 用户确认' : '❌ 用户取消'
  }
}

function navigateExample() {
  const context = capabilityManager?.getContext()
  const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'pageService')
  if (provider) {
    (provider.implementation as any).navigate('/example', { id: 123, type: 'demo' })
  }
}

async function makeApiCall() {
  apiLoading.value = true
  apiError.value = ''
  apiResponse.value = null
  
  try {
    const context = capabilityManager?.getContext()
    const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'apiClient')
    if (provider) {
      const response = await (provider.implementation as any).request({
        url: '/api/demo',
        method: 'GET',
        params: { page: 1 }
      })
      apiResponse.value = response
    }
  } catch (error) {
    apiError.value = error instanceof Error ? error.message : '未知错误'
  } finally {
    apiLoading.value = false
  }
}

function toggleListener() {
  if (isListening.value) {
    // 停止监听
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    isListening.value = false
  } else {
    // 启动监听
    const context = capabilityManager?.getContext()
    const provider = Array.from(context?.providers ?? []).find((p: any) => p.name === 'dataSetState')
    if (provider) {
      unsubscribe = (provider.implementation as any).onTableChange('Users', (table: any) => {
        changeCount.value++
        const timestamp = new Date().toLocaleTimeString()
        changeHistory.value.unshift(`${timestamp}: Users 表发生变化，当前 ${table.rows.length} 行`)
        if (changeHistory.value.length > 5) {
          changeHistory.value.pop()
        }
      })
      isListening.value = true
    }
  }
}
</script>

<style scoped>
.capability-demo {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

h1 {
  color: #2c3e50;
  margin-bottom: 2rem;
  font-size: 2.5rem;
}

h2 {
  color: #34495e;
  margin: 2rem 0 1rem;
  font-size: 1.8rem;
  border-bottom: 3px solid #3498db;
  padding-bottom: 0.5rem;
}

.demo-section {
  margin-bottom: 3rem;
}

.info-box {
  background: #ecf0f1;
  padding: 1.5rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.info-box p {
  margin: 0.5rem 0;
  font-size: 1rem;
}

.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.capability-card {
  background: white;
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.capability-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.15);
}

.capability-card h3 {
  margin: 0 0 1rem;
  color: #2980b9;
  font-size: 1.3rem;
  border-bottom: 2px solid #3498db;
  padding-bottom: 0.5rem;
}

.capability-content {
  font-size: 0.95rem;
}

pre {
  background: #2c3e50;
  color: #ecf0f1;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85rem;
  line-height: 1.4;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}

button {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
  transform: translateY(-2px);
}

.btn-success {
  background: #27ae60;
  color: white;
}

.btn-success:hover {
  background: #229954;
}

.btn-error {
  background: #e74c3c;
  color: white;
}

.btn-error:hover {
  background: #c0392b;
}

.btn-warning {
  background: #f39c12;
  color: white;
}

.btn-warning:hover {
  background: #e67e22;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background: #7f8c8d;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.success-msg {
  color: #27ae60;
  font-weight: 600;
  margin-top: 0.5rem;
}

.error-msg {
  color: #e74c3c;
  font-weight: 600;
  margin-top: 0.5rem;
}

.message-log {
  background: #ecf0f1;
  padding: 0.8rem;
  border-radius: 6px;
  margin-top: 1rem;
  font-family: monospace;
}

.api-response {
  margin-top: 1rem;
}

.change-history {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
  border: 1px solid #e0e0e0;
}

.change-history ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
}

.change-history li {
  padding: 0.5rem;
  border-bottom: 1px solid #ecf0f1;
  font-family: monospace;
  font-size: 0.9rem;
}

.table-container {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: #34495e;
  color: white;
}

th, td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #ecf0f1;
}

tbody tr:hover {
  background: #f8f9fa;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stat-value {
  font-size: 3rem;
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 1rem;
  opacity: 0.9;
}
</style>
