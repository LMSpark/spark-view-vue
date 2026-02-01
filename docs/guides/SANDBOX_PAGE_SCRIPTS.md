# 页面配置脚本沙箱执行指南

> 版本：v1.0.0 | 日期：2026-02-02  
> 简化业务代码，在沙箱中安全执行页面配置脚本

## 📋 目录

1. [概述](#概述)
2. [沙箱优势](#沙箱优势)
3. [快速开始](#快速开始)
4. [可用 API](#可用-api)
5. [实战示例](#实战示例)
6. [迁移指南](#迁移指南)
7. [最佳实践](#最佳实践)

---

## 概述

**页面配置脚本沙箱化**是指将 `pages-config/{pageId}/script.js` 中的业务逻辑在受控的沙箱环境中执行，而不是直接作为 ES 模块加载。

### 当前架构对比

| 特性 | 传统 ES Module 导入 | 沙箱执行 |
|------|-------------------|---------|
| **安全性** | ❌ 完全访问权限 | ✅ 受限环境，白名单 API |
| **隔离性** | ❌ 共享全局作用域 | ✅ 独立上下文 |
| **动态性** | ❌ 静态导入 | ✅ 动态执行 |
| **错误处理** | ⚠️ 全局错误 | ✅ 沙箱捕获 |
| **热更新** | ⚠️ 需要刷新 | ✅ 即时生效 |

---

## 沙箱优势

### ✅ **安全隔离**
- 防止恶意代码访问敏感 API（`window`, `document`, `localStorage`）
- 限制执行时间，避免无限循环
- 白名单机制，只暴露必要的 API

### ✅ **简化业务代码**
- 自动注入常用工具（`SparkData`, `ElMessage` 等）
- 统一的上下文管理（`$data`, `$dataSet`, `$api`）
- 减少样板代码，专注业务逻辑

### ✅ **热更新支持**
- 配置更改即时生效，无需刷新页面
- 开发体验更流畅

---

## 快速开始

### 1️⃣ **创建沙箱化页面脚本**

**之前（ES Module）：**
```javascript
// pages-config/my-page/script.js
import { SparkData } from '@spark-view/spark-data'
import { ElMessage } from 'element-plus'
import { $data, $dataSet, $rebindRules } from '@/utils/page-helpers/common.js'

export function __init__() {
  console.log('页面初始化')
  // 业务逻辑
}

export function handleClick() {
  ElMessage.success('点击成功')
}
```

**现在（沙箱执行）：**
```javascript
// pages-config/my-page/script.js
// 无需 import，所有 API 自动注入！

function __init__() {
  console.log('页面初始化')
  console.log('DataSet:', $dataSet)
  console.log('SparkData:', SparkData)
}

function handleClick() {
  ElMessage.success('点击成功')
}
```

### 2️⃣ **配置沙箱上下文**

在 `DynamicPage.vue` 中配置沙箱：

```typescript
import { Spark } from '@spark-view/spark-core'
import { SparkData } from '@spark-view/spark-data'
import { ElMessage } from 'element-plus'

// 创建沙箱实例
const pageSandbox = Spark.sandbox({
  globals: {
    // 数据空间 API
    SparkData,
    
    // Element Plus
    ElMessage,
    
    // 页面上下文
    $data: pageData,
    $dataSet: dataSet,
    $api: formApi.value,
    $route: route,
    $el: pageContainer.value,
    $rebindRules: rebindRules,
    $refreshData: refreshData,
    
    // 工具函数
    console: {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    }
  },
  timeout: 5000,  // 5秒超时
  allowAsync: true // 允许异步操作
})

// 执行页面脚本
const scriptContent = await loadScriptContent(pageId)
const pageFunctions = pageSandbox.run(scriptContent)
```

---

## 可用 API

### 📦 **自动注入的全局对象**

| API | 类型 | 说明 |
|-----|------|------|
| `SparkData` | Namespace | 数据空间命名空间 |
| `$data` | `Record<string, unknown>` | 响应式页面数据 |
| `$dataSet` | `DataSet \| null` | DataSet 实例 |
| `$api` | `FormCreateAPI \| null` | form-create API |
| `$route` | `RouteLocationNormalizedLoaded` | 当前路由 |
| `$el` | `HTMLElement \| null` | 页面容器元素 |
| `$rebindRules` | `Function` | 重新绑定规则 |
| `$refreshData` | `Function` | 刷新 API 数据 |
| `ElMessage` | `ElMessage` | Element Plus 消息提示 |
| `console` | `Console` | 受限的控制台（仅 log/warn/error） |

### 🔧 **SparkData API（命名空间）**

```javascript
// 创建 DataSet
const ds = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
})

// 创建 TreeManager
const tree = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId'
})

// 过滤解析器（静态工具类）
const sql = SparkData.FilterParser.toSQL(expression)
const query = SparkData.FilterParser.toMongoDB(expression)
```

---

## 实战示例

### 示例 1：DataSet CRUD 操作

```javascript
// pages-config/dataset-demo/script.js

function __init__() {
  console.log('🎯 DataSet Demo 初始化')
  
  // 使用 SparkData 命名空间
  const users = $dataSet.getTable('Users')
  console.log('用户表数据:', users.getRows())
}

function addUser() {
  const newUser = {
    id: Date.now(),
    name: '新用户',
    email: 'new@example.com',
    status: '激活'
  }
  
  $dataSet.getTable('Users').addRow(newUser)
  ElMessage.success('用户添加成功')
  $rebindRules() // 刷新 UI
}

function deleteUser(row) {
  $dataSet.getTable('Users').deleteRow(row)
  ElMessage.success('用户删除成功')
  $rebindRules()
}

function generateSQL() {
  const relation = $dataSet.getRelation('Users', 'Orders')
  const result = SparkData.FilterParser.toSQL(relation.filterExpression)
  
  console.log('生成的 SQL:', result.sql)
  console.log('参数:', result.params)
  ElMessage.info(`SQL: ${result.sql}`)
}
```

### 示例 2：异步数据加载

```javascript
// pages-config/async-demo/script.js

async function __init__() {
  console.log('🔄 开始异步加载数据')
  
  // 注册数据加载器
  $dataSet.registerDataLoader('Users', async () => {
    // 模拟 API 请求
    await new Promise(resolve => setTimeout(resolve, 1000))
    return [
      { id: 1, name: '张三' },
      { id: 2, name: '李四' }
    ]
  })
  
  // 触发加载
  await $dataSet.getTable('Users').loadData()
  ElMessage.success('数据加载完成')
  $rebindRules()
}
```

### 示例 3：表单验证

```javascript
// pages-config/form-demo/script.js

function validateEmail(value) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!regex.test(value)) {
    ElMessage.error('邮箱格式不正确')
    return false
  }
  return true
}

function submitForm() {
  const formData = $data.formModel
  
  if (!validateEmail(formData.email)) {
    return
  }
  
  // 保存到 DataSet
  $dataSet.getTable('Users').addRow(formData)
  ElMessage.success('表单提交成功')
  
  // 重置表单
  $api?.resetFields()
}
```

---

## 迁移指南

### 从 ES Module 迁移到沙箱

#### Step 1: 移除 import 语句

**之前：**
```javascript
import { SparkData } from '@spark-view/spark-data'
import { ElMessage } from 'element-plus'
import { $data, $dataSet } from '@/utils/page-helpers/common.js'
```

**之后：**
```javascript
// 无需 import，直接使用注入的全局对象
```

#### Step 2: 调整函数导出方式

**之前：**
```javascript
export function __init__() { }
export function handleClick() { }
```

**之后：**
```javascript
// 方式 1：函数声明（推荐）
function __init__() { }
function handleClick() { }

// 方式 2：返回对象
return {
  __init__: function() { },
  handleClick: function() { }
}
```

#### Step 3: 检查依赖的 API

确保使用的所有 API 都在沙箱的 `globals` 中注入：

```typescript
// DynamicPage.vue 中配置沙箱
const pageSandbox = Spark.sandbox({
  globals: {
    SparkData,
    ElMessage,
    // 添加其他需要的 API
    moment,
    lodash: _,
    // ...
  }
})
```

---

## 最佳实践

### ✅ **推荐做法**

#### 1. **使用命名空间 API**
```javascript
// ✅ 推荐：使用 SparkData 命名空间
const ds = SparkData.createDataSet({ ... })
const tree = SparkData.createTreeManager({ ... })

// ❌ 避免：直接使用类（无法在沙箱中导入）
import { DataSet } from '@spark-view/spark-data' // 沙箱中不可用
```

#### 2. **错误处理**
```javascript
function __init__() {
  try {
    // 业务逻辑
  } catch (error) {
    console.error('初始化失败:', error)
    ElMessage.error('页面初始化失败')
  }
}
```

#### 3. **异步操作**
```javascript
// ✅ 使用 async/await
async function loadData() {
  const data = await fetch('/api/data')
  return data
}

// ❌ 避免回调地狱
function loadData(callback) {
  fetch('/api/data').then(...)
}
```

### ❌ **避免的做法**

#### 1. **避免直接操作 DOM**
```javascript
// ❌ 禁止：沙箱中没有 document/window
document.getElementById('xxx')
window.location.href = '...'

// ✅ 使用：$el 和 $route
$el.querySelector('#xxx')
$route.push({ path: '...' })
```

#### 2. **避免长时间运行**
```javascript
// ❌ 禁止：会触发超时
while(true) { /* 无限循环 */ }

// ✅ 使用：异步批处理
async function processLargeData() {
  for (let i = 0; i < items.length; i += 100) {
    await processBatch(items.slice(i, i + 100))
    await new Promise(resolve => setTimeout(resolve, 0)) // 让出控制权
  }
}
```

#### 3. **避免依赖外部变量**
```javascript
// ❌ 禁止：沙箱无法访问模块作用域
let moduleVar = 10
function useModuleVar() {
  return moduleVar // undefined 在沙箱中
}

// ✅ 使用：$data 存储状态
function __init__() {
  $data.myVar = 10
}
function useData() {
  return $data.myVar
}
```

---

## 安全限制

沙箱默认**禁止**以下操作：

- ❌ 访问 `window`, `document`, `globalThis`
- ❌ 使用 `eval()`, `Function()` 构造器
- ❌ 访问 `localStorage`, `sessionStorage`
- ❌ 创建定时器 `setTimeout`, `setInterval`
- ❌ 发起 HTTP 请求（`fetch`, `XMLHttpRequest`）
- ❌ 使用 `import()` 动态导入
- ❌ 访问 Node.js API（`process`, `require`, `__dirname`）

如需使用这些功能，请在 `globals` 中显式注入安全的替代实现。

---

## 常见问题

### Q1: 如何在沙箱中使用第三方库？

**A:** 在创建沙箱时注入到 `globals`：

```typescript
const pageSandbox = Spark.sandbox({
  globals: {
    moment: moment,
    _: lodash,
    axios: axios,
  }
})
```

### Q2: 如何调试沙箱中的代码？

**A:** 使用注入的 `console` 对象：

```javascript
function debugFunction() {
  console.log('变量值:', $data)
  console.warn('警告信息')
  console.error('错误信息')
}
```

### Q3: 沙箱超时怎么办？

**A:** 优化代码逻辑或增加超时时间：

```typescript
const pageSandbox = Spark.sandbox({
  timeout: 10000, // 增加到 10 秒
})
```

### Q4: 如何在沙箱外访问沙箱内的函数？

**A:** 通过返回值或 `$data` 共享：

```javascript
// 页面脚本
function myFunction() {
  return 'result'
}

// 将函数挂载到 $data
$data.myFunction = myFunction
```

---

## 总结

✅ **沙箱化页面脚本**提供了：

- 🛡️ **安全隔离**：防止恶意代码
- 🚀 **简化开发**：自动注入 API，减少样板代码
- 🔄 **热更新**：配置即改即生效
- 🧪 **易于测试**：独立上下文，便于单元测试

通过 `@spark-view/spark-core` 的沙箱系统和 `@spark-view/spark-data` 的命名空间 API，业务代码更简洁、更安全！

---

**相关文档：**
- [Spark Core API 文档](../../packages/spark-core/API.md)
- [SparkData API 文档](../../packages/spark-data/API.md)
- [项目结构清理总结](../REFACTORING_SUMMARY.md)
