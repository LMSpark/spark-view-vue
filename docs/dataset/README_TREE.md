# 自引用树架构文档 (Self-Reference Tree)

> 基于 PageData 1.1 的扁平化 + 懒加载 + 层级构建方案
> **设计理念**：TreeManager 关联到 BindingContext（视图层），而非 DataTable（结构层）

## 📋 目录

- [核心概念](#核心概念)
- [TreeManager API](#treemanager-api)
- [TreeManager API 参考](#treemanager-api)
  - [基础配置](#基础配置)
  - [节点管理](#节点管理)
  - [树结构操作](#树结构操作)
  - [懒加载支持](#懒加载支持)
- [使用指南](#使用指南)
- [完整示例](#完整示例)
- [最佳实践](#最佳实践)

---

## 核心概念

### 设计理念

自引用树采用**扁平化存储 + 按需构建**的架构：

```
存储层 (Flat)     →  视图层 (BindingContext + TreeManager)  →  展示层 (Nested)
[{id, parentId}]  →  智能缓存 + 懒加载 + 视图管理            →  嵌套树结构
```

**关键设计决策**：
- ✅ **TreeManager 关联 BindingContext**（视图层）- 树形数据是数据的一种展示形式
- ❌ **不关联 DataTable**（结构层）- DataTable 只定义表结构，不涉及特定展示逻辑
- 💡 **双向绑定**：BindingContext ↔ TreeManager，方便相互引用

### 核心特性

1. **扁平化存储** - 数据库友好，简化 CRUD
2. **懒加载机制** - 按需加载，优化大数据场景
3. **差量补齐** - 路径展开时只加载缺失节点
4. **轻量路径查询** - 快速获取节点层级路径
5. **契约驱动** - TypeScript 类型安全
6. **层级构建** - 运行时动态构建嵌套树
7. **事件系统** - 缓存更新、路径展开监听

---

## TreeManager API

### 初始化

```typescript
import { SparkData } from '@spark-view/spark-data'
// 推荐使用命名空间 API
const treeManager = SparkData.createTreeManager(config, nodes)

// 或者直接导入类（向后兼容）
import { TreeManager, BindingContext } from '@spark-view/spark-data'

// 方式1: 独立创建（不关联 BindingContext）
const treeManager = new TreeManager({
  mode: 'flat',           // 'flat' | 'nested'
  lazy: false,            // 是否懒加载
  idField: 'id',          // ID 字段名
  parentIdField: 'parentId',  // 父节点字段名
  childrenField: 'children',  // 子节点字段名（nested 模式）
  rootValue: null         // 根节点的 parentId 值
})

// 方式2: 关联到 BindingContext（推荐）
const context: BindingContext = dataSet.getTable('Departments')
const treeManager = new TreeManager(
  { idField: 'id', parentIdField: 'parentId' },
  initialNodes,
  context  // 传入 BindingContext
)

// 方式3: 通过 BindingContext 设置（双向绑定）
context.setTreeManager(treeManager)
// 此时 context.getTreeManager() === treeManager
// 且 treeManager.getBindingContext() === context
```

### 核心方法

#### 1. 缓存管理

```typescript
// 添加节点到缓存（自动去重）
treeManager.addNodesToCache(nodes: FlatTreeNode[])

// 获取缓存快照
const cache = treeManager.getCache()

// 清空缓存
treeManager.clearCache()
```

#### 2. 节点查询

```typescript
// 获取根节点列表
const roots = treeManager.getRoots()

// 获取指定节点的子节点
const children = await treeManager.getChildren(
  parentId,
  { forceRefresh: false }  // 是否强制刷新
)

// 搜索节点（支持关键词匹配）
const results = await treeManager.searchNodes(
  keyword,
  searchFields  // ['name', 'title', 'code']
)
```

#### 3. 路径操作

```typescript
// 获取节点路径（从根到目标节点）
const path = await treeManager.getNodePath(nodeId)
// 返回: TreePath[] = [{ id, parentId, level, name, ... }]

// 展开到指定节点（差量加载路径上的节点）
await treeManager.expandToNode(nodeId)
```

#### 4. 树构建

```typescript
// 构建完整嵌套树
const tree = treeManager.buildNestedTree(flatNodes)

// 构建子树
const subtree = treeManager.buildSubTree(rootId, flatNodes)

// 节点富化（计算 level、hasChildren）
const enrichedNodes = treeManager.enrichNodes(nodes)
```

#### 5. 事件监听

```typescript
// 缓存更新事件
treeManager.on('cacheUpdated', (newNodes) => {
  console.log('新增节点:', newNodes)
})

// 路径展开事件
treeManager.on('pathExpanded', (nodeId, path) => {
  console.log('展开路径:', path)
})

// 缓存清空事件
treeManager.on('cacheCleared', () => {
  console.log('缓存已清空')
})
```

---

## TreeHelper 工具函数

> 位置: `src/utils/page-helpers/treeHelper.js`

### 树结构转换

```javascript
import { 
  buildTreeFromFlat, 
  flattenTree 
} from '@/utils/page-helpers/treeHelper.js'

// 扁平 → 嵌套
const tree = buildTreeFromFlat(flatNodes, {
  idField: 'id',
  parentIdField: 'parentId',
  childrenField: 'children',
  rootValue: null
})

// 嵌套 → 扁平
const flatList = flattenTree(tree, {
  childrenField: 'children',
  includeLevel: true  // 是否包含 level 字段
})
```

### 节点查找

```javascript
import { findNode, getNodePath } from '@/utils/page-helpers/treeHelper.js'

// 递归查找节点
const node = findNode(tree, nodeId, {
  idField: 'id',
  childrenField: 'children'
})

// 获取节点路径（扁平数组）
const path = getNodePath(flatNodes, nodeId, {
  idField: 'id',
  parentIdField: 'parentId'
})
```

### 树遍历与操作

```javascript
import { 
  traverseTree, 
  filterTree, 
  sortTree 
} from '@/utils/page-helpers/treeHelper.js'

// 遍历所有节点
traverseTree(tree, (node, level, parent) => {
  console.log(`Level ${level}:`, node.name)
}, { childrenField: 'children' })

// 过滤树节点
const filtered = filterTree(tree, (node) => {
  return node.type === 'department'
}, { childrenField: 'children', keepParents: true })

// 排序树节点
const sorted = sortTree(tree, (a, b) => {
  return a.order - b.order
}, { childrenField: 'children' })
```

### 树统计

```javascript
// 富化节点信息（计算 level 和 hasChildren）
treeManager.enrichNodes()

// 获取节点层级
const level = treeManager.calculateLevel(nodeId)

// 获取所有缓存节点
const cache = treeManager.getCache()
const nodeCount = Object.keys(cache).length

// 获取最大深度
const depth = getMaxDepth(tree, { childrenField: 'children' })

// 统计节点总数
const total = countNodes(tree, { childrenField: 'children' })
```

---

## 使用指南

### 1. 配置 pagedata.json

```json
{
  "treeConfig": {
    "mode": "flat",
    "lazy": false,
    "idField": "id",
    "parentIdField": "parentId",
    "childrenField": "children",
    "rootValue": null
  },
  "treeNodes": [
    { "id": 1, "parentId": null, "name": "根节点" },
    { "id": 2, "parentId": 1, "name": "子节点1" },
    { "id": 3, "parentId": 1, "name": "子节点2" }
  ]
}
```

### 2. 在 script.js 中初始化（关联 BindingContext）

```javascript
import { TreeManager } from '@/models/treeManager'
import { $data, $dataSet } from '@/utils/page-helpers/common.js'

let treeManager = null

export function init() {
  const data = $data()
  const dataSet = $dataSet()
  
  // 获取树数据对应的 BindingContext
  const treeContext = dataSet.getTable('Departments')  // 假设表名是 Departments
  
  // 创建 TreeManager 实例并关联 BindingContext
  treeManager = new TreeManager(
    data.treeConfig, 
    data.treeNodes,
    treeContext  // 关联到 BindingContext
  )
  
  // 或者通过 BindingContext 设置（双向绑定）
  treeContext.setTreeManager(treeManager)
  
  // 富化节点（计算 level、hasChildren）
  treeManager.enrichNodes()
  
  // 构建嵌套树（用于 el-tree）
  const nestedTree = treeManager.buildNestedTree()
  
  // 更新到 BindingContext 的 rows
  treeContext.rows = nestedTree
  
  // 通知 UI 更新
  dataSet.notifySubscribers('Departments')
  
  console.log('✅ TreeManager 初始化完成，已关联 BindingContext')
}
```

### 3. 在 rule.json 中绑定 el-tree（使用 DataKey）

```json
{
  "type": "el-tree",
  "dataKey": "dataset.tables.Departments.rows",
  "props": {
    "nodeKey": "id",
    "defaultExpandAll": false,
    "highlightCurrent": true
  },
  "on": {
    "node-click": "handleNodeClick",
    "node-expand": "handleNodeExpand"
  }
}
```

### 4. 实现事件处理器

```javascript
// 节点点击
export function handleNodeClick(data, node) {
  console.log('点击节点:', data)
  const pageData = $data()
  pageData.currentNode = data
  
  // 获取节点路径
  treeManager.getNodePath(data.id).then(path => {
    pageData.nodePath = path
  })
}

// 节点展开（懒加载）
export async function handleNodeExpand(data, node) {
  if (data.hasChildren && !data.children?.length) {
    // 懒加载子节点
    const children = await treeManager.getChildren(data.id)
    data.children = children
  }
}

// 搜索节点
export async function handleSearch() {
  const pageData = $data()
  const keyword = pageData.searchKeyword
  
  if (!keyword) {
    pageData.searchResults = []
    return
  }
  
  const results = await treeManager.searchNodes(keyword, ['name', 'code'])
  pageData.searchResults = results
}
```

---

## 完整示例

查看 `/tree-demo` 页面源码：

- **配置**: [src/pages-config/tree-demo/pagedata.json](src/pages-config/tree-demo/pagedata.json)
- **逻辑**: [src/pages-config/tree-demo/script.js](src/pages-config/tree-demo/script.js)
- **UI**: [src/pages-config/tree-demo/rule.json](src/pages-config/tree-demo/rule.json)
- **样式**: [src/pages-config/tree-demo/style.css](src/pages-config/tree-demo/style.css)

### 示例功能

1. ✅ 组织架构树展示（22 节点，4 层级）
2. ✅ 节点搜索与高亮
3. ✅ 路径面包屑展示
4. ✅ 节点详情面板
5. ✅ 节点增删改操作
6. ✅ 扁平/嵌套模式切换
7. ✅ 树数据导出

---

## 最佳实践

### 1. 性能优化

**大数据场景（1000+ 节点）**

```javascript
// ✅ 使用懒加载
const config = {
  mode: 'flat',
  lazy: true  // 启用懒加载
}

// ✅ 按需构建嵌套树（只构建可见部分）
const visibleTree = treeManager.buildSubTree(expandedNodeId, flatNodes)

// ❌ 避免全树构建
// const fullTree = treeManager.buildNestedTree(allNodes) // 性能差
```

**搜索优化**

```javascript
// ✅ 限制搜索字段
const results = await treeManager.searchNodes(keyword, ['name'])

// ✅ 客户端缓存搜索结果
let searchCache = {}
if (searchCache[keyword]) {
  return searchCache[keyword]
}
```

### 2. 数据一致性

**更新节点后同步缓存**

```javascript
export async function handleUpdateNode(nodeId, updates) {
  // 1. 更新后端数据
  await api.updateNode(nodeId, updates)
  
  // 2. 更新缓存
  const cache = treeManager.getCache()
  const node = cache.get(nodeId)
  if (node) {
    Object.assign(node, updates)
  }
  
  // 3. 触发缓存更新事件
  treeManager.emit('cacheUpdated', [node])
}
```

**删除节点时清理缓存**

```javascript
export async function handleDeleteNode(nodeId) {
  // 1. 删除后端数据（级联删除子节点）
  await api.deleteNode(nodeId)
  
  // 2. 清空缓存（强制重新加载）
  treeManager.clearCache()
  
  // 3. 重新加载树
  await loadTree()
}
```

### 3. 类型安全

**使用 TypeScript 类型定义**

```typescript
import type { 
  TreeConfig, 
  FlatTreeNode, 
  NestedTreeNode 
} from '@/types/pageData'

// 定义自己的树节点类型
interface OrgNode extends FlatTreeNode {
  name: string
  type: 'company' | 'department' | 'team' | 'employee'
  email?: string
  phone?: string
}

// 使用泛型
const treeManager = new TreeManager<OrgNode>(config)
const nodes: OrgNode[] = treeManager.getCache().values()
```

### 4. 错误处理

```javascript
export async function handleNodeOperation(nodeId) {
  try {
    // 1. 检查节点是否存在
    const cache = treeManager.getCache()
    if (!cache.has(nodeId)) {
      throw new Error(`节点 ${nodeId} 不存在`)
    }
    
    // 2. 执行操作
    await api.updateNode(nodeId, updates)
    
    // 3. 成功提示
    ElMessage.success('操作成功')
    
  } catch (error) {
    console.error('操作失败:', error)
    ElMessage.error(error.message || '操作失败')
  }
}
```

### 5. 懒加载实现

**TreeManager API**

TreeManager 提供了完整的树形数据管理功能，所有操作都通过实例方法完成。

```javascript
export async function getChildren(parentId) {
  // 模拟 API 调用
  await new Promise(resolve => setTimeout(resolve, 300))
  
  // 返回子节点数据
  return [
    { id: 101, parentId, name: '子节点1', hasChildren: false },
    { id: 102, parentId, name: '子节点2', hasChildren: true }
  ]
}
```

**集成到页面**

```javascript
export async function handleNodeExpand(data, node) {
  if (data.hasChildren && !data.children?.length) {
    // 显示加载状态
    data.loading = true
    
    try {
      // 调用 API
      const children = await getChildren(data.id)
      
      // 添加到缓存
      treeManager.addNodesToCache(children)
      
      // 挂载子节点
      data.children = children
      
    } catch (error) {
      ElMessage.error('加载子节点失败')
    } finally {
      data.loading = false
    }
  }
}
```

---

## 架构对比

### 传统方案 vs PageData Tree

| 特性 | 传统方案 | PageData Tree |
|------|---------|---------------|
| 数据存储 | 嵌套 JSON | 扁平数组 + parentId |
| 数据库查询 | 递归查询 | 单表查询 |
| 大数据性能 | 差（全量加载） | 优（懒加载 + 缓存） |
| 类型安全 | 弱 | 强（TypeScript） |
| 路径查询 | 递归遍历 | 索引查找 |
| 契约驱动 | 无 | TreeConfig 配置 |

### 适用场景

**✅ 适合使用**
- 组织架构树
- 商品分类树
- 地区级联选择
- 文件目录树
- 权限菜单树

**❌ 不适合使用**
- 图结构（多父节点）
- 网状关系
- 循环引用

---

## API 参考

### TreeConfig

```typescript
interface TreeConfig {
  mode: 'flat' | 'nested'        // 存储模式
  lazy: boolean                  // 是否懒加载
  idField: string                // ID 字段名
  parentIdField: string          // 父节点字段名
  childrenField?: string         // 子节点字段名
  rootValue?: any                // 根节点 parentId 值
}
```

### FlatTreeNode

```typescript
interface FlatTreeNode {
  id: string | number
  parentId: string | number | null
  level?: number                 // 节点层级（从 0 开始）
  hasChildren?: boolean          // 是否有子节点
  [key: string]: any            // 其他业务字段
}
```

### NestedTreeNode

```typescript
interface NestedTreeNode extends FlatTreeNode {
  children?: NestedTreeNode[]    // 子节点数组
}
```

### TreePath

```typescript
interface TreePath {
  id: string | number
  parentId: string | number | null
  level: number
  name?: string
  [key: string]: any
}
```

---

## 常见问题

### Q1: 如何处理循环引用？

```javascript
// TreeManager 内置循环检测
const tree = treeManager.buildNestedTree(nodes)
// 如果检测到循环引用，会抛出错误
```

### Q2: 懒加载时如何显示 loading 状态？

```javascript
export async function handleNodeExpand(data, node) {
  if (data.hasChildren && !data.children?.length) {
    // 方案1: 添加 loading 属性
    data.loading = true
    
    // 方案2: 使用 el-tree 的 loading 插槽
    // 在 rule.json 中配置 slot
  }
}
```

### Q3: 如何自定义节点渲染？

```json
{
  "type": "el-tree",
  "props": {
    "renderContent": "customRenderNode"
  }
}
```

```javascript
export function customRenderNode(h, { node, data }) {
  return h('span', [
    h('i', { class: getIconClass(data.type) }),
    h('span', data.name),
    h('el-tag', { props: { size: 'small' } }, data.type)
  ])
}
```

---

## 相关文档

- [架构总览](../architecture/README_ARCHITECTURE.md)
- [DataSet 主从表](../architecture/README_ARCHITECTURE.md#dataset-数据集)
- [级联操作](../architecture/README_ARCHITECTURE.md#级联操作)
- [SSR 配置](../architecture/README_SSR.md)

---

**🌳 自引用树架构 - 让树形数据管理更简单、更高效！**

