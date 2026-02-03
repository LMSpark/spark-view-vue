# 页面脚本迁移指南

## 核心原则

**脚本格式**：普通函数定义，通过 Function 构造器编译执行。

**编译策略**："统一编译，按需返回"
- 整个脚本统一编译（避免重复解析）
- 只返回 rules 中引用的函数（减少内存）
- 支持函数间互相调用（同一作用域）

**不支持特性**：
- ❌ ES6 模块系统（`import`/`export`）
- ❌ CommonJS 模块（`require`/`module.exports`）
- ❌ 顶层 `await`

**支持特性**：
- ✅ 普通函数定义
- ✅ 沙箱上下文变量（`$api`、`$data` 等）
- ✅ 函数间互相调用
- ✅ `__init__` 生命周期钩子

## 必须修改的内容

### 1. 移除 ES6 import/export

❌ **错误**：
```javascript
import { ElMessage } from 'element-plus'
export function myFunction() {}
```

✅ **正确**：
```javascript
// 从 pageData._imports 获取依赖
function myFunction() {
  const pageData = $data
  const { ElMessage } = pageData._imports || {}
  ElMessage?.success('成功')
}
```

### 2. $data() → $data

沙箱变量是直接注入的对象，不是函数。

❌ **错误**：
```javascript
const pageData = $data()
```

✅ **正确**：
```javascript
const pageData = $data
```

### 3. FormCreate API 访问方式

直接使用沙箱注入的 $api（通过 v-model:api 绑定）。

❌ **错误**：
```javascript
const api = window.__formApi__  // 旧方式，已废弃
```

✅ **正确**：
```javascript
const api = $api  // 直接使用沙箱变量
if (api) {
  api.setValue('username', 'admin')
}
```

**说明**：
- PageRenderer 使用 `v-model:api="formApi"` 绑定（官方推荐方式）
- 通过 PageContext 的 getter 动态获取最新 API 实例
- 不再使用 `window.__formApi__` 全局变量

### 4. $dataSet() → $dataSet

❌ **错误**：
```javascript
const dataSet = $dataSet()
```

✅ **正确**：
```javascript
const dataSet = $dataSet
```

## 沙箱注入的变量

所有页面脚本自动注入以下变量：

| 变量 | 类型 | 说明 |
|------|------|------|
| `$api` | FormCreateAPI \| null | FormCreate API 实例 |
| `$route` | RouteLocationNormalizedLoaded | Vue Router 当前路由 |
| `$data` | reactive<Record> | 页面数据（响应式） |
| `$el` | () => HTMLElement \| null | 页面容器元素（getter） |
| `$query` | (selector) => Element \| null | 查询单个元素 |
| `$queryAll` | (selector) => NodeListOf | 查询所有元素 |
| `$dataSet` | DataSetManager \| null | DataSet 实例 |
| `$rebindRules` | () => void | 重新绑定规则 |
| `$refreshData` | async () => void | 刷新数据 |

## 外部依赖注入

页面配置需要在 `data._imports` 中提供外部依赖：

```javascript
// pagedata.json
{
  "data": {
    "_imports": {
      "ElMessage": "需在运行时注入 element-plus 的 ElMessage",
      "TreeManager": "需在运行时注入 @spark-view/spark-data 的 TreeManager",
      "h": "需在运行时注入 vue 的 h 渲染函数"
    },
    // ... 其他页面数据
  }
}
```

## 迁移示例

### 示例 1：简单函数

**迁移前**：
```javascript
import { ElMessage } from 'element-plus'

export function handleClick() {
  const data = $data()
  ElMessage.success('点击成功')
}
```

**迁移后**：
```javascript
function handleClick() {
  const pageData = $data
  const { ElMessage } = pageData._imports || {}
  ElMessage?.success('点击成功')
}
```

### 示例 2：DataSet 操作

**迁移前**：
```javascript
export function loadUsers() {
  const dataSet = $dataSet()
  dataSet.requestTableData('Users')
}
```

**迁移后**：
```javascript
function loadUsers() {
  const dataSet = $dataSet
  dataSet.requestTableData('Users')
}
```

### 示例 3：Vue 渲染函数

**迁移前**：
```javascript
import { h } from 'vue'
import { ElButton } from 'element-plus'

export function renderButton(row) {
  return h(ElButton, {
    onClick: () => handleClick(row)
  }, '点击')
}
```

**迁移后**：
```javascript
function renderButton(row) {
  const pageData = $data
  const { h, ElButton } = pageData._imports || {}
  
  if (!h || !ElButton) {
    return null
  }
  
  return h(ElButton, {
    onClick: () => handleClick(row)
  }, '点击')
}
```

## 初始化函数

`__init__` 函数会在页面加载时自动调用：

```javascript
function __init__() {
  console.log('页面初始化')
  const pageData = $data
  const { TreeManager, ElMessage } = pageData._imports || {}
  
  // 初始化逻辑
  if (TreeManager) {
    // ...
  }
}
```

## 待迁移文件清单

- ✅ users/script.js - 已完成
- ✅ settings/script.js - 已完成
- ✅ renderer-demo/script.js - 已完成
- ✅ tree-demo/script.js - 已完成
- ✅ smart-load/script.js - 已完成
- ✅ home/script.js - 已完成
- ⚠️ permission-render/script.js - 需要手动迁移（包含复杂 Vue 渲染）
- ⚠️ dataset-demo/script.js - 需要迁移
- ⚠️ cascade-demo/script.js - 需要迁移
- ⚠️ master-detail/script.js - 需要检查
- ⚠️ formcreate-api/script.js - 需要检查
- ⚠️ async-demo/script.js - 需要检查

## 注意事项

1. **所有函数无需 export** - 沙箱会自动提取函数定义
2. **可选链调用** - 外部依赖使用 `?.` 避免报错
3. **类型检查** - 使用前检查依赖是否存在
4. **console.error** - 依赖缺失时记录错误日志

## 运行时提供 _imports

在 PageRenderer 或页面加载器中：

```typescript
import { ElMessage, ElMessageBox } from 'element-plus'
import { h } from 'vue'
import { TreeManager } from '@spark-view/spark-data'

pageData._imports = {
  ElMessage,
  ElMessageBox,
  h,
  TreeManager
  // ... 其他需要的依赖
}
```
