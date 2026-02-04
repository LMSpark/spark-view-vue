# 业务脚本开发指南

> 适用于 `public/pages-config/{pageId}/script.js` 页面脚本开发

## 沙箱环境

业务脚本在隔离的沙箱环境中执行，自动注入以下全局变量：

### 页面上下文

| 变量 | 类型 | 说明 |
|------|------|------|
| `$api` | `FormCreateAPI \| null` | FormCreate 表单 API |
| `$route` | `RouteLocationNormalizedLoaded` | 当前路由对象 |
| `$data` | `Record<string, unknown>` | 页面数据（响应式对象） |
| `$el` | `() => HTMLElement \| null` | 页面容器元素（函数） |
| `$query` | `(selector: string) => HTMLElement \| null` | 查询单个元素 |
| `$queryAll` | `(selector: string) => NodeListOf<Element>` | 查询所有元素 |
| `$dataSet` | `IDataSet \| null` | DataSet 实例 |
| `$rebindRules` | `() => void` | 重新绑定规则 |
| `$refreshData` | `(key?: string) => Promise<void>` | 刷新数据 |

### 第三方库

| 变量 | 类型 | 说明 |
|------|------|------|
| `ElMessage` | `ElMessage` | Element Plus 消息提示 |
| `ElMessageBox` | `ElMessageBox` | Element Plus 消息框 |
| `SparkData` | `Namespace` | SPARK 数据空间命名空间 |
| `h` | `Function` | Vue h 函数（渲染函数） |

## 脚本规范

### ✅ 正确写法

```javascript
// 普通函数定义（自动返回给页面）
function handleClick() {
  ElMessage.success('点击成功')
  console.log('当前数据:', $data)
}

// 初始化函数（页面加载时自动调用）
function __init__() {
  console.log('页面初始化')
  const dataSet = $dataSet
  if (dataSet) {
    // 注册数据加载器
    dataSet.dataLoader = async (tableName) => {
      const res = await fetch(`/api/${tableName}`)
      return res.json()
    }
  }
}

// 异步函数
async function loadData() {
  await $refreshData()
  ElMessage.success('数据加载完成')
}

// 渲染函数（使用 h 函数）
function RenderCustom() {
  return h('div', { class: 'custom' }, [
    h('h1', '自定义组件'),
    h('button', { onClick: handleClick }, '点击')
  ])
}
```

### ❌ 错误写法

```javascript
// ❌ 不支持 ES6 模块语法
import { ElMessage } from 'element-plus'
export function handleClick() { }

// ❌ 不要将对象当函数调用
const data = $data()  // 错误！$data 是对象
const api = $api()    // 错误！$api 是对象

// ✅ 正确：直接访问
const data = $data
const api = $api

// ❌ 不支持 JSX
function RenderComponent() {
  return <div>Hello</div>
}

// ✅ 使用 h 函数
function RenderComponent() {
  return h('div', 'Hello')
}
```

## 常用模式

### 1. 数据加载

```javascript
function __init__() {
  const dataSet = $dataSet
  
  // 注册数据加载器
  dataSet.dataLoader = async (tableName) => {
    const response = await fetch(`/api/${tableName}`)
    return response.json()
  }
  
  // 监听加载事件
  dataSet.on('loadSuccess', ({ tableName }) => {
    ElMessage.success(`${tableName} 加载成功`)
  })
  
  // 主动加载
  dataSet.requestTableData('Users')
}
```

### 2. 事件处理

```javascript
function handleRowClick(row) {
  console.log('点击行:', row)
  $data.selectedRow = row
}

async function handleSubmit() {
  try {
    const formData = $api.formData()
    await fetch('/api/submit', {
      method: 'POST',
      body: JSON.stringify(formData)
    })
    ElMessage.success('提交成功')
  } catch (error) {
    ElMessage.error('提交失败')
  }
}
```

### 3. DataSet 操作

```javascript
function addUser() {
  const dataSet = $dataSet
  const users = dataSet.getTable('Users')
  
  // 添加数据
  users.addRow({
    id: Date.now(),
    name: '新用户',
    email: 'new@example.com'
  })
  
  // 通知更新
  dataSet.notifySubscribers('Users')
}

function handleUserSelect(row) {
  const dataSet = $dataSet
  const users = dataSet.getTable('Users')
  
  // 设置当前行（自动触发关系过滤）
  users.setCurrentRow(row)
}
```

### 4. 自定义渲染

```javascript
function RenderStatus(row) {
  const color = row.status === 'active' ? 'success' : 'info'
  return h('el-tag', { type: color }, row.status)
}

function RenderActions(row) {
  return h('div', [
    h('el-button', {
      size: 'small',
      onClick: () => handleEdit(row)
    }, '编辑'),
    h('el-button', {
      size: 'small',
      type: 'danger',
      onClick: () => handleDelete(row)
    }, '删除')
  ])
}
```

### 5. 表单 API

```javascript
function handleValidate() {
  const api = $api
  
  api.validate((valid) => {
    if (valid) {
      ElMessage.success('验证通过')
      const data = api.formData()
      console.log('表单数据:', data)
    } else {
      ElMessage.error('验证失败')
    }
  })
}

function handleDisableField() {
  const api = $api
  api.disabled(true, 'email')  // 禁用邮箱字段
}

function handleHideField() {
  const api = $api
  api.hidden(true, 'phone')  // 隐藏电话字段
}
```

## 调试技巧

### 1. 使用 console

```javascript
function __init__() {
  console.log('=== 页面初始化 ===')
  console.log('页面数据:', $data)
  console.log('DataSet:', $dataSet)
  console.log('路由:', $route)
}
```

### 2. 查看 DataSet 状态

```javascript
function debugDataSet() {
  const dataSet = $dataSet
  console.log('所有表:', Object.keys(dataSet.dataSet.tables))
  console.log('Users 表:', dataSet.getTable('Users')?.rows)
  console.log('关系配置:', dataSet.dataSet.relations)
}
```

### 3. 错误处理

```javascript
async function handleAction() {
  try {
    // 业务逻辑
  } catch (error) {
    console.error('操作失败:', error)
    ElMessage.error(error.message || '操作失败')
  }
}
```

## 性能优化

### 1. 避免频繁 rebind

```javascript
// ❌ 不要在循环中调用
for (let i = 0; i < 100; i++) {
  $data.items.push(i)
  $rebindRules()  // 每次都重新渲染！
}

// ✅ 批量更新后调用一次
for (let i = 0; i < 100; i++) {
  $data.items.push(i)
}
$rebindRules()  // 只渲染一次
```

### 2. 使用 DataSet 事件

```javascript
// ✅ DataSet 会自动通知订阅者
function handleRowSelect(row) {
  const users = $dataSet.getTable('Users')
  users.setCurrentRow(row)  // 内部会自动通知，不需要手动 rebind
}
```

## 示例页面

参考以下页面的实现：

- `async-demo` - 异步数据刷新
- `dataset-demo` - DataSet 主从表
- `cascade-demo` - 级联删除
- `formcreate-api` - 表单 API 操作
- `permission-render` - 权限控制渲染
