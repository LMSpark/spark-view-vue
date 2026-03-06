# 页面脚本迁移指南

## 核心原则

**脚本格式**：普通函数定义，通过 Function 构造器在 `with (__ctx)` 沙箱内执行。

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
- ✅ 沙箱上下文变量（`$api`、`$dataSet`、`$page` 等）
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
function myFunction() {
  $page.showMessage('成功', 'success')
}
```

### 2. `$data` 已移除 → 使用 `$dataSet` + `_pageState`

`$data` 响应式对象已从沙箱中删除。所有数据必须通过 DataSet 流转，UI 状态使用模块级闭包变量。

❌ **错误**：
```javascript
const pageData = $data
pageData.selectedNode = node
```

✅ **正确**：
```javascript
// 模块顶部声明闭包状态
let _pageState = { selectedNode: null }

function handleSelect(node) {
  _pageState.selectedNode = node
}

// 数据操作通过 DataSet
function loadUsers() {
  const view = $dataSet?.getView('Users', 'default')
  view?.requestData()
}
```

### 3. `ElMessage` / `ElMessageBox` 已移除 → 使用 `$page`

❌ **错误**：
```javascript
ElMessage.success('保存成功')
ElMessageBox.confirm('确定删除？')
```

✅ **正确**：
```javascript
$page.showMessage('保存成功', 'success')
$page.showConfirm('确定删除？').then(confirmed => {
  if (confirmed) { /* ... */ }
})
```

### 4. FormCreate API 访问方式

直接使用沙箱注入的 `$api`。

❌ **错误**：
```javascript
const api = window.__formApi__
```

✅ **正确**：
```javascript
if ($api) {
  $api.setValue('username', 'admin')
}
```

### 5. `h` 渲染函数已直接注入

❌ **错误**：
```javascript
const { h } = $data._imports || {}
```

✅ **正确**：
```javascript
// h 已由沙箱直接注入
function RenderButton() {
  return h('button', { onClick: handleClick }, '点击')
}
```

## 沙箱注入的变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `$api` | IFormAPI \| null | 表单操作（框架无关接口） |
| `$route` | IPageRoute | 当前路由快照（框架无关接口） |
| `$el` | () => HTMLElement \| null | 页面容器元素 |
| `$query` | (sel) => HTMLElement \| null | DOM 单元素查询 |
| `$queryAll` | (sel) => NodeListOf\<Element\> | DOM 多元素查询 |
| `$dataSet` | IDataSet \| null | **页面级 DataSet**（数据唯一入口） |
| `$rebindRules` | () => void | 触发 form-create 完整重建规则（⚠️ 高危） |
| `$refreshData` | (key?) => Promise\<void\> | 刷新数据（可选指定表名） |
| `$page` | IPageServiceCapability | ✅ **推荐** UI 消息、确认、导航 |
| `SparkData` | SparkData 命名空间 | `createTreeManager` 等工具 |
| `h` | Vue `h` 函数 | 渲染函数专用 |

## 迁移示例

### 示例 1：用户提示

**迁移前**：
```javascript
import { ElMessage } from 'element-plus'

export function handleClick() {
  ElMessage.success('点击成功')
}
```

**迁移后**：
```javascript
function handleClick() {
  $page.showMessage('点击成功', 'success')
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
  const view = $dataSet?.getView('Users', 'default')
  view?.requestData()
}
```

### 示例 3：Vue 渲染函数

**迁移前**：
```javascript
import { h } from 'vue'

export function renderInfo(row) {
  return h('span', row.name)
}
```

**迁移后**：
```javascript
// h 已由沙箱注入，直接使用
function RenderInfo() {
  const node = _pageState.selectedNode
  return h('div', node?.name ?? '未选择')
}
```

## 初始化函数

`__init__` 在 form-create 挂载完成后自动调用，`$api` 和 `$dataSet` 均已就绪：

```javascript
function __init__() {
  const view = $dataSet?.getView('Orders', 'default')
  view?.events.on('currentRowChanged', (row) => {
    console.log('当前行变化:', row)
  })
}
```
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
