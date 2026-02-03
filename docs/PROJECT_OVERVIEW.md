# 项目概览

> Form Create SSR Application - 配置驱动的低代码 Vue 3 SSR 应用

## 🎯 项目定位

**强内核 + 低代码页面** 架构：
- **强大内核**: PageRenderer + DataSet 处理所有复杂逻辑
- **低代码页面**: 页面配置专注业务逻辑，零初始化
- **完全解耦**: UI ↔ DataSet ↔ Data 通过观察者模式
- **数据驱动**: 所有 UI 行为由数据和配置驱动

## 📂 核心文件

| 文件/目录 | 作用 | 重要性 |
|-----------|------|--------|
| `packages/spark-renderer/` | **页面渲染引擎**，负责配置渲染和数据绑定 | ⭐⭐⭐⭐⭐ |
| `packages/spark-data/` | 数据空间（DataSet, TreeManager） | ⭐⭐⭐⭐⭐ |
| `packages/spark-core/` | 组件系统（能力、插件、管理器） | ⭐⭐⭐⭐⭐ || `packages/spark-app/` | 应用基础设施（Logger、AppContext、Bootstrap） | ⭐⭐⭐⭐⭐ |
| `packages/spark-page-config/` | 页面配置加载（ConfigLoader、Router） | ⭐⭐⭐⭐ || `public/pages-config/{pageId}/` | 页面配置目录（rule.json + pagedata.json + script.js） | ⭐⭐⭐⭐⭐ |
| `src/App.vue` | 应用入口 | ⭐⭐⭐ |

## 🏗️ 架构层次

```
┌─────────────────────────────────────────────────┐
│  页面配置层 (Low-Code)                            │
│  - rule.json (UI 结构)                           │
│  - pagedata.json (数据定义)                      │
│  - script.js (业务逻辑)                          │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  渲染引擎层 (@spark-view/spark-renderer)        │
│  - 配置加载与解析 (ConfigLoader)                  │
│  - Rule 数据绑定 (useRuleBinding)                 │
│  - 脚本沙箱执行 (Sandbox)                         │
│  - CSS 作用域隔离 (useCssScope)                   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  数据管理层 (@spark-view/spark-data)             │
│  - DataSet (领域逻辑)                            │
│  - DataTable (结构定义)                          │
│  - DataRow (数据行)                              │
│  - BindingContext (视图绑定)                     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  基础设施层 (@spark-view/spark-app)              │
│  - Logger (日志系统)                             │
│  - AppContext (应用上下文)                       │
│  - Bootstrap (初始化流程)                        │
└─────────────────────────────────────────────────┘

独立的组件系统（可选）：
┌─────────────────────────────────────────────────┐
│  组件系统层 (@spark-view/spark-core)            │
│  - ComponentManager (组件管理)                   │
│  - Capability System (能力系统)                  │
│  - Plugin System (插件系统)                      │
└─────────────────────────────────────────────────┘
```

**注：** spark-renderer 不依赖 spark-core，保持轻量级；
spark-core 可以独立使用，构建复杂的组件系统。

## 🔑 关键特性

### 1. 零初始化架构
- ❌ 不需要 `new DataSet()`
- ❌ 不需要手动订阅
- ❌ 不需要手动 rebind
- ✅ 内核自动检测和初始化所有内容

### 2. 完全解耦模式
```javascript
// UI 发起请求（非阻塞）
dataSet.requestTableData('Users')  // 不使用 await！

// 数据加载（异步后台）
// ... 异步处理 ...

// 自动通知（订阅回调）
rebindRules() → UI 自动更新
```

### 3. 数据驱动 UI（包括权限渲染）
```javascript
// ✅ 根据后端返回的数据控制 UI
// 后端返回: { id: 1, name: 'xxx', _perm: { canDelete: true, editable: ['name'] } }

// 示例1：控制按钮显隐
if (row._perm?.canDelete) {
  showDeleteButton();
}

// 示例2：控制字段可编辑性
if (row._perm?.editable?.includes('name')) {
  enableField('name');
}

// 示例3：模型级权限（新增按钮）
if (response._modelPerm?.canAdd) {
  showAddButton();
}

// ❌ 不要硬编码判断逻辑
if (user.role === 'admin') { showButton(); }
```

**核心原则**：前端只负责读取数据并渲染，所有业务规则（包括权限）都由后端计算后返回。

## 📊 DataKey 路径系统

支持多种数据绑定路径：

| DataKey 路径 | 说明 | 场景 |
|--------------|------|------|
| `dataset.tables.Users.rows` | 完整数据 | el-table 绑定 |
| `dataset.tables.Users.currentRow` | 当前选中行 | 表单编辑 |
| `dataset.tables.Users.selectedRows` | 多选行 | 批量操作 |
| `dataset.tables.Users.contexts.detail.rows` | 自定义上下文 | 多视图绑定 |

## 🔄 关键工作流

### 添加新页面（3 步）
1. 在 `public/pages-config/routes.json` 添加路由
2. 创建 `public/pages-config/{pageId}/rule.json` 和 `pagedata.json`
3. （可选）创建 `script.js` 定义事件处理函数（普通函数，无 export）

**PageRenderer 自动渲染！** 无需创建 .vue 文件

### 使用 DataSet
```javascript
// script.js - 沙箱自动注入全局变量: $data, $dataSet, $api, $route, $rebindRules

function __init__() {
  // 注意：沙箱变量是对象，不是函数
  const dataSet = $dataSet
  if (dataSet) {
    dataSet.dataLoader = mockDataLoader  // 注册数据加载器
  }
}

function handleLoadData() {
  const dataSet = $dataSet
  if (dataSet) {
    dataSet.requestTableData('Users')  // 非阻塞请求
  }
}

// 注意：普通函数定义，不使用 export
```
```

## 🚀 开发模式

| 命令 | 端口 | 用途 |
|------|------|------|
| `npm run dev` | 5173 | CSR（快速开发，无 SSR） |
| `npm run dev:ssr` | 3000 | SSR（完整测试） |
| `npm run typecheck` | - | TypeScript 类型检查 |
| `npm run lint:fix` | - | ESLint 自动修复 |

**建议**: 
- 快速迭代用 CSR (`npm run dev`)
- 最终测试用 SSR (`npm run dev:ssr`)
- 提交前必须 `npm run typecheck`（零错误）

## 📚 文档索引

### 必读文档
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) - AI 编码指南（最完整）
- [架构总览](architecture/README_ARCHITECTURE.md) - 深入架构设计
- [SSR 实现](architecture/README_SSR.md) - 服务端渲染细节

### 参考文档
- [DataKey 路径](dataset/DataKey-Paths.md) - 数据绑定路径详解
- [CRUD 指南](dataset/DATASET_CRUD_GUIDE.md) - 增删改查操作
- [树形结构](dataset/README_TREE.md) - TreeManager 使用
- [异步加载](guides/ASYNC_DATA_LOADING.md) - 异步数据处理

### 演示页面
访问 http://localhost:5173 (CSR) 或 http://localhost:3000 (SSR):
- `/dataset-demo` - DataSet 基础演示
- `/cascade-demo` - 级联操作演示
- `/smart-load` - 智能依赖加载
- `/master-detail` - 主从表联动
- `/tree-demo` - 树形结构

## ⚠️ 常见错误

### 1. 使用 await 请求数据
```javascript
// ❌ 错误
await dataSet.requestTableData('Users')

// ✅ 正确（非阻塞）
dataSet.requestTableData('Users')
```

### 2. 手动初始化 DataSet
```javascript
// ❌ 错误
const dataSet = new DataSetManager()

// ✅ 正确（内核自动创建）
const dataSet = $dataSet()
```

### 3. 硬编码业务规则（包括权限）
```javascript
// ❌ 错误：前端判断权限
if (user.role === 'admin') showDeleteButton()

// ✅ 正确：读取后端返回的数据
if (row._perm?.canDelete) showDeleteButton()
```

### 4. 手动调用 refresh
```javascript
// ❌ 错误
formApi.refresh()

// ✅ 正确（依赖 Vue 响应式）
// 数据变化后 Vue 自动更新 UI
```

8. **数据驱动 UI**: 所有业务规则（权限、状态等）由后端计算并通过数据返回，前端只负责渲染
## 🎯 核心理念

1. **低代码优先**: 页面脚本最少代码，内核处理复杂性
2. **完全解耦**: UI 请求不等待，DataSet 通知准备好
3. **非阻塞优先**: 永远不要 `await requestTableData()`
4. **订阅者先行**: 自动订阅必须在 `__init__()` 之前
5. **信任内核**: 不要重复初始化，不要手动绑定
6. **信任 Vue 响应式**: 不要手动 refresh，让 Vue 处理
7. **语义化命名**: `tables.Users` 而不是 `tables[0]`

---

**总结**: 这是一个 **内核驱动、配置优先、数据驱动** 的低代码 SSR 应用框架。
