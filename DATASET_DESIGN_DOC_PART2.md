# DataSet 架构设计文档（第二部分：自引用树架构）

> **PageData 1.1 完整解决方案** - 自引用树（Self-Reference Tree）设计
> 
> 作者：基于 CSDN 系列文章实现  
> 版本：1.1.0  
> 日期：2026-01-09

---

## 📚 目录

1. [树形架构概览](#树形架构概览)
2. [TreeConfig 树配置](#treeconfig-树配置)
3. [扁平化 vs 嵌套存储](#扁平化-vs-嵌套存储)
4. [TreeManager 树管理器](#treemanager-树管理器)
5. [懒加载机制](#懒加载机制)
6. [差量补齐算法](#差量补齐算法)
7. [层级构建](#层级构建)
8. [路径展开与搜索](#路径展开与搜索)
9. [TreeHelper 工具库](#treehelper-工具库)
10. [与 DataSet 集成](#与-dataset-集成)
11. [完整应用示例](#完整应用示例)
12. [性能优化策略](#性能优化策略)

---

## 1. 树形架构概览

### 1.1 设计理念

自引用树采用 **扁平化存储 + 按需构建** 的架构，核心思想：

```
┌────────────────────────────────────────────────────────────┐
│                  Self-Reference Tree 架构                   │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           UI Layer (Element Plus el-tree)            │  │
│  │  需要：嵌套结构 NestedTreeNode[]                      │  │
│  └────────────────────────┬─────────────────────────────┘  │
│                           │                                 │
│                           ↓ buildNestedTree()               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              TreeManager (树管理器)                   │  │
│  │  • 扁平缓存 (FlatTreeCache)                          │  │
│  │  • 懒加载逻辑 (Lazy Loading)                          │  │
│  │  • 差量补齐 (Differential Patching)                   │  │
│  │  • 层级构建 (Nested Building)                         │  │
│  │  • 路径展开 (Path Expansion)                          │  │
│  │  • 节点搜索 (Node Search)                             │  │
│  └────────────────────────┬─────────────────────────────┘  │
│                           │                                 │
│                           ↓ getChildren() / searchNodes()   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Data Layer (扁平化存储)                     │  │
│  │  FlatTreeNode[] = [                                   │  │
│  │    { id: 1, parentId: null, name: '根节点' },         │  │
│  │    { id: 2, parentId: 1, name: '子节点1' },           │  │
│  │    { id: 3, parentId: 1, name: '子节点2' }            │  │
│  │  ]                                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ↓ API 调用                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Backend (数据库)                         │  │
│  │  SELECT * FROM org_tree WHERE parentId = ?            │  │
│  │  • 单表查询（无递归 CTE）                             │  │
│  │  • 索引优化（parentId + id）                          │  │
│  │  • 分页支持（LIMIT/OFFSET）                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

### 1.2 核心特性对比

| 特性 | 传统嵌套树 | PageData 扁平树 |
|------|-----------|----------------|
| **存储结构** | 嵌套 JSON | 扁平数组 + parentId |
| **数据库查询** | 递归 CTE（慢） | 单表查询 + 索引（快） |
| **懒加载** | 难以实现 | 天然支持 |
| **大数据性能** | 全量加载（慢） | 按需加载（快） |
| **路径查询** | 递归遍历（O(n)） | 索引查找（O(log n)） |
| **节点插入** | 需要重建树 | 直接 INSERT |
| **节点移动** | 需要重建树 | 更新 parentId |
| **内存占用** | 重复引用高 | 扁平数组低 |

### 1.3 应用场景

✅ **适合使用**
- **组织架构树**：公司 → 部门 → 团队 → 员工（4 层）
- **商品分类树**：一级类目 → 二级类目 → 三级类目（3 层）
- **地区级联**：国家 → 省 → 市 → 区（4 层）
- **文件目录树**：文件夹 → 子文件夹 → 文件（无限层级）
- **权限菜单树**：模块 → 功能 → 操作（3 层）

❌ **不适合使用**
- 图结构（多父节点）
- 网状关系（多对多）
- 循环引用（A → B → A）

---

## 2. TreeConfig 树配置

### 2.1 类型定义

```typescript
export interface TreeConfig {
  mode: 'flat' | 'nested'    // 存储模式
  tableName?: string         // 表名（多表支持）
  idField?: string           // ID 字段名，默认 'id'
  parentIdField?: string     // 父 ID 字段名，默认 'parentId'
  textField?: string         // 显示文本字段，默认 'name'
  childrenField?: string     // 子节点字段名，默认 'children'
  rootValue?: any            // 根节点的 parentId 值，默认 null
  depthLimit?: number        // 深度限制，防止无限递归
  lazy?: boolean             // 是否启用懒加载，默认 true
}
```

### 2.2 配置示例

#### 示例 1：组织架构树（扁平化）

```json
{
  "treeConfig": {
    "mode": "flat",
    "tableName": "OrgTree",
    "idField": "id",
    "parentIdField": "parentId",
    "textField": "name",
    "rootValue": null,
    "lazy": true
  },
  "treeNodes": [
    { "id": 1, "parentId": null, "name": "武汉领码科技", "type": "company" },
    { "id": 2, "parentId": 1, "name": "研发中心", "type": "department" },
    { "id": 3, "parentId": 1, "name": "市场部", "type": "department" },
    { "id": 4, "parentId": 2, "name": "前端组", "type": "team" },
    { "id": 5, "parentId": 2, "name": "后端组", "type": "team" },
    { "id": 6, "parentId": 4, "name": "张三", "type": "employee" }
  ]
}
```

#### 示例 2：商品分类树（嵌套存储）

```json
{
  "treeConfig": {
    "mode": "nested",
    "childrenField": "children",
    "lazy": false
  },
  "treeNodes": [
    {
      "id": 1,
      "name": "电子产品",
      "children": [
        {
          "id": 2,
          "name": "手机",
          "children": [
            { "id": 3, "name": "iPhone" },
            { "id": 4, "name": "Android" }
          ]
        },
        {
          "id": 5,
          "name": "电脑",
          "children": [
            { "id": 6, "name": "笔记本" },
            { "id": 7, "name": "台式机" }
          ]
        }
      ]
    }
  ]
}
```

### 2.3 配置策略

```typescript
// 策略 1：小数据量（< 1000 节点）→ 嵌套模式 + 非懒加载
{
  mode: 'nested',
  lazy: false
}

// 策略 2：中等数据量（1000-10000 节点）→ 扁平模式 + 懒加载
{
  mode: 'flat',
  lazy: true,
  depthLimit: 5  // 限制深度
}

// 策略 3：大数据量（> 10000 节点）→ 扁平模式 + 懒加载 + 虚拟滚动
{
  mode: 'flat',
  lazy: true,
  virtualScroll: true  // 自定义扩展
}
```

---

## 3. 扁平化 vs 嵌套存储

### 3.1 扁平化存储（Flat）

**数据结构：**

```typescript
export interface FlatTreeNode {
  id: string | number              // 节点 ID（唯一）
  parentId?: string | number | null // 父节点 ID（根节点为 null）
  name: string                     // 节点名称
  level?: number                   // 层级（0 = 根节点）
  hasChildren?: boolean            // 是否有子节点
  isLoaded?: boolean               // 子节点是否已加载
  [key: string]: any               // 其他业务字段
}

// 示例数据
const flatTree: FlatTreeNode[] = [
  { id: 1, parentId: null, name: '公司', level: 0, hasChildren: true },
  { id: 2, parentId: 1, name: '研发部', level: 1, hasChildren: true },
  { id: 3, parentId: 1, name: '市场部', level: 1, hasChildren: false },
  { id: 4, parentId: 2, name: '前端组', level: 2, hasChildren: false }
]
```

**优势：**
- ✅ 数据库友好（单表查询）
- ✅ CRUD 操作简单（直接 INSERT/UPDATE）
- ✅ 天然支持懒加载
- ✅ 内存占用低
- ✅ 易于分页和搜索

**劣势：**
- ❌ UI 渲染需要转换为嵌套结构
- ❌ 获取子树需要多次过滤

### 3.2 嵌套存储（Nested）

**数据结构：**

```typescript
export interface NestedTreeNode extends FlatTreeNode {
  children: NestedTreeNode[]  // 子节点数组
}

// 示例数据
const nestedTree: NestedTreeNode[] = [
  {
    id: 1,
    parentId: null,
    name: '公司',
    level: 0,
    hasChildren: true,
    children: [
      {
        id: 2,
        parentId: 1,
        name: '研发部',
        level: 1,
        hasChildren: true,
        children: [
          {
            id: 4,
            parentId: 2,
            name: '前端组',
            level: 2,
            hasChildren: false,
            children: []
          }
        ]
      },
      {
        id: 3,
        parentId: 1,
        name: '市场部',
        level: 1,
        hasChildren: false,
        children: []
      }
    ]
  }
]
```

**优势：**
- ✅ UI 渲染直接使用（无需转换）
- ✅ 获取子树快速（O(1)）
- ✅ 符合直觉（树形结构）

**劣势：**
- ❌ 数据库存储复杂（需要递归 CTE）
- ❌ CRUD 操作繁琐（需要重建树）
- ❌ 懒加载难以实现
- ❌ 内存占用高（重复引用）
- ❌ 深度嵌套序列化慢

### 3.3 PageData 混合策略

**存储用扁平，渲染用嵌套：**

```typescript
// 1. 数据库/API 使用扁平存储
const dbData: FlatTreeNode[] = await api.getOrgTree();

// 2. 添加到 TreeManager 缓存
treeManager.addNodesToCache(dbData);

// 3. 按需构建嵌套树（只构建可见部分）
const nestedTree = treeManager.buildNestedTree(visibleNodes);

// 4. 绑定到 UI
data.displayTree = nestedTree;
```

**优势：两全其美！**
- ✅ 后端简单（扁平存储）
- ✅ 前端高效（按需构建）
- ✅ 懒加载支持（差量补齐）

---

## 4. TreeManager 树管理器

### 4.1 类定义

```typescript
export class TreeManager {
  private config: TreeConfig
  private cache: FlatTreeCache = {}  // { [id]: FlatTreeNode }
  private eventListeners: Map<string, Function[]> = new Map()

  constructor(config: TreeConfig, initialNodes?: FlatTreeNode[]) {
    this.config = {
      idField: 'id',
      parentIdField: 'parentId',
      textField: 'name',
      lazy: true,
      ...config
    }
    
    if (initialNodes) {
      this.addNodesToCache(initialNodes)
    }
  }
}
```

### 4.2 核心职责

```typescript
class TreeManager {
  // 1. 缓存管理
  addNodesToCache(nodes: FlatTreeNode[]): void
  getCache(): FlatTreeCache
  getNode(id: string | number): FlatTreeNode | undefined
  clearCache(): void
  
  // 2. 节点查询
  getChildren(parentId: string | number | null): FlatTreeNode[]
  getRoots(): FlatTreeNode[]
  getNodePath(nodeId: string | number): TreePath
  
  // 3. 层级构建
  buildNestedTree(flatNodes?: FlatTreeNode[]): NestedTreeNode[]
  buildSubTree(rootId: string | number, flatNodes?: FlatTreeNode[]): NestedTreeNode[]
  
  // 4. 懒加载
  expandToNode(
    targetId: string | number,
    loadPathFn: (targetId) => Promise<TreePath>,
    loadSubTreeFn: (fromId, toId) => Promise<FlatTreeNode[]>
  ): Promise<void>
  
  // 5. 搜索与过滤
  searchNodes(keyword: string, searchFields?: string[]): FlatTreeNode[]
  filterTree(predicate: (node: FlatTreeNode) => boolean): FlatTreeNode[]
  
  // 6. 节点富化
  enrichNodes(nodes?: FlatTreeNode[]): FlatTreeNode[]
  calculateLevel(nodeId: string | number): number
  markHasChildren(nodeId: string | number): void
  
  // 7. 事件系统
  on(event: string, callback: Function): void
  off(event: string, callback: Function): void
  emit(event: string, data: any): void
}
```

### 4.3 缓存管理

```typescript
/**
 * 添加节点到缓存（自动去重）
 */
addNodesToCache(nodes: FlatTreeNode[]): void {
  nodes.forEach(node => {
    const id = node[this.config.idField || 'id']
    this.cache[id] = node
  })
  
  this.emit('cacheUpdated', { cache: this.cache })
}

/**
 * 获取缓存快照
 */
getCache(): FlatTreeCache {
  return { ...this.cache }
}

/**
 * 清空缓存
 */
clearCache(): void {
  this.cache = {}
  this.emit('cacheCleared', {})
}
```

**缓存结构示例：**

```typescript
// FlatTreeCache
{
  1: { id: 1, parentId: null, name: '公司', level: 0 },
  2: { id: 2, parentId: 1, name: '研发部', level: 1 },
  3: { id: 3, parentId: 1, name: '市场部', level: 1 },
  4: { id: 4, parentId: 2, name: '前端组', level: 2 }
}

// 快速查找：O(1)
const node = cache[2];  // { id: 2, parentId: 1, ... }
```

### 4.4 节点查询

```typescript
/**
 * 获取子节点
 */
getChildren(parentId: string | number | null): FlatTreeNode[] {
  const parentIdField = this.config.parentIdField || 'parentId'
  
  return Object.values(this.cache).filter(
    node => node[parentIdField] === parentId
  )
}

/**
 * 获取根节点
 */
getRoots(): FlatTreeNode[] {
  const rootValue = this.config.rootValue ?? null
  return this.getChildren(rootValue)
}

/**
 * 获取节点
 */
getNode(id: string | number): FlatTreeNode | undefined {
  return this.cache[id]
}
```

**示例：**

```typescript
// 获取根节点
const roots = treeManager.getRoots();
// [{ id: 1, parentId: null, name: '公司' }]

// 获取 id=1 的子节点
const children = treeManager.getChildren(1);
// [
//   { id: 2, parentId: 1, name: '研发部' },
//   { id: 3, parentId: 1, name: '市场部' }
// ]
```

---

## 5. 懒加载机制

### 5.1 设计原理

**核心思想：** 只加载用户请求的节点及其直接子节点，不加载整棵树。

```
初始状态（只加载根节点）
└─ 公司 [+]

用户点击展开
└─ 公司 [-]
    ├─ 研发部 [+]  ← 动态加载
    └─ 市场部 [+]  ← 动态加载

用户点击研发部
└─ 公司 [-]
    ├─ 研发部 [-]
    │   ├─ 前端组 [+]  ← 动态加载
    │   └─ 后端组 [+]  ← 动态加载
    └─ 市场部 [+]
```

### 5.2 实现方式

#### 方式 1：API 接口（推荐）

```typescript
// 后端接口
GET /api/org-tree/:parentId/children

// 示例
GET /api/org-tree/null/children      // 获取根节点
GET /api/org-tree/1/children         // 获取 id=1 的子节点
GET /api/org-tree/2/children         // 获取 id=2 的子节点
```

**页面脚本实现：**

```typescript
// treeHelper.js 模拟 API
export async function getChildren(parentId) {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 调用真实 API
  const response = await fetch(`/api/org-tree/${parentId}/children`);
  return response.json();
}

// script.js 中使用
export async function handleNodeExpand(data, node) {
  if (data.hasChildren && !data.children?.length) {
    // 显示加载状态
    data.loading = true;
    
    try {
      // 调用 API 加载子节点
      const children = await getChildren(data.id);
      
      // 添加到缓存
      const manager = $dataSetManager();
      manager.addNodesToCache(children);
      
      // 挂载子节点
      data.children = children;
      
    } catch (error) {
      ElMessage.error('加载子节点失败');
    } finally {
      data.loading = false;
    }
  }
}
```

#### 方式 2：全量加载 + 按需展示

```typescript
// 初始加载所有节点（但不构建嵌套树）
const allNodes = await api.getAllNodes();
treeManager.addNodesToCache(allNodes);

// 只构建根节点的嵌套树
const rootTree = treeManager.buildSubTree(null);

// 用户展开时从缓存获取
export function handleNodeExpand(data, node) {
  if (data.hasChildren && !data.children?.length) {
    // 从缓存获取子节点
    const children = treeManager.getChildren(data.id);
    
    // 构建嵌套结构
    const nestedChildren = treeManager.buildNestedTree(children);
    
    // 挂载
    data.children = nestedChildren;
  }
}
```

### 5.3 懒加载事件

```typescript
// 监听加载事件
treeManager.on('nodeLoading', ({ nodeId }) => {
  console.log(`正在加载节点 ${nodeId} 的子节点...`);
});

treeManager.on('nodeLoaded', ({ nodeId, children }) => {
  console.log(`节点 ${nodeId} 的子节点加载完成，共 ${children.length} 个`);
});

treeManager.on('loadError', ({ nodeId, error }) => {
  console.error(`节点 ${nodeId} 加载失败:`, error);
});
```

---

## 6. 差量补齐算法

### 6.1 问题场景

**场景：** 用户通过搜索定位到深层节点（如员工"张三"），需要展开从根到该节点的完整路径。

```
初始状态（未展开）
└─ 公司 [+]

搜索"张三"后（需要展开路径）
└─ 公司 [-]
    └─ 研发部 [-]
        └─ 前端组 [-]
            └─ 张三 ✓  ← 搜索目标
```

**问题：** 如何高效加载路径上的节点，而不加载无关节点？

### 6.2 差量补齐算法

```typescript
/**
 * 展开到目标节点（差量补齐）
 * @param targetId 目标节点 ID
 * @param loadPathFn 加载路径的函数，返回路径 ID 数组
 * @param loadSubTreeFn 加载子树的函数，返回缺失区间的节点
 */
async expandToNode(
  targetId: string | number,
  loadPathFn: (targetId: string | number) => Promise<TreePath>,
  loadSubTreeFn: (fromId: string | number | null, toId: string | number) => Promise<FlatTreeNode[]>
): Promise<void> {
  // 1. 获取目标节点的祖先链 ID
  const path = await loadPathFn(targetId);
  const { pathIds } = path;  // [1, 2, 4, 6] (公司 → 研发部 → 前端组 → 张三)

  // 2. 对比缓存，找出缺失的节点
  const missing = pathIds.filter(id => !this.cache[id]);
  
  if (missing.length === 0) {
    // 路径已完整，直接返回
    this.emit('pathExpanded', { targetId, path });
    return;
  }

  // 3. 找出缺失的区间
  const gaps: Array<{ from: string | number | null; to: string | number }> = [];
  let lastExisting: string | number | null = null;

  for (const id of pathIds) {
    if (!this.cache[id]) {
      // 缺失节点
      if (gaps.length === 0 || gaps[gaps.length - 1].to !== id) {
        gaps.push({ from: lastExisting, to: id });
      }
    } else {
      lastExisting = id;
    }
  }

  // 4. 加载缺失区间的节点
  for (const gap of gaps) {
    const nodes = await loadSubTreeFn(gap.from, gap.to);
    this.addNodesToCache(nodes);
  }

  // 5. 触发路径展开事件
  this.emit('pathExpanded', { targetId, path });
}
```

### 6.3 算法示例

**初始缓存：**

```typescript
cache = {
  1: { id: 1, parentId: null, name: '公司' },
  3: { id: 3, parentId: 1, name: '市场部' }
}
```

**目标节点：** id = 6（张三）

**路径：** [1, 2, 4, 6]

**对比缓存：**
- id=1 存在 ✓
- id=2 缺失 ✗
- id=4 缺失 ✗
- id=6 缺失 ✗

**缺失区间：** [{ from: 1, to: 6 }]

**加载请求：** `loadSubTreeFn(1, 6)`

**返回数据：**

```typescript
[
  { id: 2, parentId: 1, name: '研发部' },
  { id: 4, parentId: 2, name: '前端组' },
  { id: 6, parentId: 4, name: '张三' }
]
```

**更新缓存后：**

```typescript
cache = {
  1: { id: 1, parentId: null, name: '公司' },
  2: { id: 2, parentId: 1, name: '研发部' },  // 新增
  3: { id: 3, parentId: 1, name: '市场部' },
  4: { id: 4, parentId: 2, name: '前端组' },  // 新增
  6: { id: 6, parentId: 4, name: '张三' }    // 新增
}
```

### 6.4 后端 API 实现

```typescript
// API 端点
GET /api/org-tree/path/:targetId        // 获取路径 ID
GET /api/org-tree/subtree?from=1&to=6   // 获取区间节点

// 路径查询（SQL）
WITH RECURSIVE path_cte AS (
  SELECT id, parentId, 0 as level
  FROM org_tree
  WHERE id = ?  -- targetId
  
  UNION ALL
  
  SELECT t.id, t.parentId, p.level + 1
  FROM org_tree t
  JOIN path_cte p ON t.id = p.parentId
)
SELECT id FROM path_cte ORDER BY level DESC;

// 区间查询（SQL）
WITH RECURSIVE subtree_cte AS (
  SELECT * FROM org_tree WHERE id = ?  -- fromId
  
  UNION ALL
  
  SELECT t.*
  FROM org_tree t
  JOIN subtree_cte s ON t.parentId = s.id
  WHERE t.id <= ?  -- toId (限制深度)
)
SELECT * FROM subtree_cte;
```

---

## 7. 层级构建

### 7.1 buildNestedTree - 构建完整嵌套树

```typescript
/**
 * 从扁平节点构建嵌套树
 * @param flatNodes 扁平节点数组（不传则使用缓存）
 * @returns 嵌套树数组
 */
buildNestedTree(flatNodes?: FlatTreeNode[]): NestedTreeNode[] {
  const nodes = flatNodes || Object.values(this.cache);
  const rootValue = this.config.rootValue ?? null;
  
  // 获取根节点
  const roots = nodes.filter(
    node => node[this.config.parentIdField || 'parentId'] === rootValue
  );
  
  // 递归构建子树
  return roots.map(root => this.buildSubTreeRecursive(root, nodes));
}

/**
 * 递归构建子树
 */
private buildSubTreeRecursive(
  node: FlatTreeNode,
  allNodes: FlatTreeNode[]
): NestedTreeNode {
  const idField = this.config.idField || 'id';
  const parentIdField = this.config.parentIdField || 'parentId';
  const childrenField = this.config.childrenField || 'children';
  
  // 查找子节点
  const children = allNodes.filter(
    n => n[parentIdField] === node[idField]
  );
  
  // 递归构建子节点
  const nestedChildren = children.map(child =>
    this.buildSubTreeRecursive(child, allNodes)
  );
  
  // 返回嵌套节点
  return {
    ...node,
    [childrenField]: nestedChildren
  } as NestedTreeNode;
}
```

### 7.2 buildSubTree - 构建指定子树

```typescript
/**
 * 构建指定根节点的子树
 * @param rootId 根节点 ID（null 表示真实根节点）
 * @param flatNodes 扁平节点数组
 * @returns 嵌套树数组
 */
buildSubTree(
  rootId: string | number | null,
  flatNodes?: FlatTreeNode[]
): NestedTreeNode[] {
  const nodes = flatNodes || Object.values(this.cache);
  const parentIdField = this.config.parentIdField || 'parentId';
  
  // 获取直接子节点
  const roots = nodes.filter(
    node => node[parentIdField] === rootId
  );
  
  // 递归构建
  return roots.map(root => this.buildSubTreeRecursive(root, nodes));
}
```

### 7.3 性能优化

#### 优化 1：Map 索引优化

```typescript
buildNestedTree(flatNodes?: FlatTreeNode[]): NestedTreeNode[] {
  const nodes = flatNodes || Object.values(this.cache);
  const idField = this.config.idField || 'id';
  const parentIdField = this.config.parentIdField || 'parentId';
  
  // 1. 建立 parentId → children 索引（O(n)）
  const childrenMap = new Map<string | number, FlatTreeNode[]>();
  
  nodes.forEach(node => {
    const parentId = node[parentIdField];
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(node);
  });
  
  // 2. 递归构建（查找子节点 O(1)）
  const buildNode = (node: FlatTreeNode): NestedTreeNode => {
    const children = childrenMap.get(node[idField]) || [];
    return {
      ...node,
      children: children.map(child => buildNode(child))
    } as NestedTreeNode;
  };
  
  // 3. 构建根节点
  const rootValue = this.config.rootValue ?? null;
  const roots = childrenMap.get(rootValue) || [];
  
  return roots.map(root => buildNode(root));
}
```

**复杂度分析：**
- 旧版本：O(n²)（每次查找子节点遍历数组）
- 优化版：O(n)（使用 Map 索引）

#### 优化 2：深度限制

```typescript
buildNestedTree(flatNodes?: FlatTreeNode[], maxDepth?: number): NestedTreeNode[] {
  const depthLimit = maxDepth ?? this.config.depthLimit;
  
  const buildNode = (node: FlatTreeNode, currentDepth: number): NestedTreeNode => {
    // 达到深度限制，不再构建子节点
    if (depthLimit !== undefined && currentDepth >= depthLimit) {
      return { ...node, children: [] } as NestedTreeNode;
    }
    
    const children = childrenMap.get(node[idField]) || [];
    return {
      ...node,
      children: children.map(child => buildNode(child, currentDepth + 1))
    } as NestedTreeNode;
  };
  
  const roots = childrenMap.get(rootValue) || [];
  return roots.map(root => buildNode(root, 0));
}
```

---

## 8. 路径展开与搜索

### 8.1 getNodePath - 获取节点路径

```typescript
/**
 * 获取节点路径（从根到目标节点）
 * @param nodeId 节点 ID
 * @returns 路径对象
 */
getNodePath(nodeId: string | number): TreePath {
  const pathIds: Array<string | number> = [];
  const pathNodes: FlatTreeNode[] = [];
  const parentIdField = this.config.parentIdField || 'parentId';
  
  let currentId: string | number | null = nodeId;
  
  // 向上查找父节点
  while (currentId !== null && currentId !== undefined) {
    const node = this.cache[currentId];
    
    if (!node) {
      console.warn(`节点 ${currentId} 不在缓存中`);
      break;
    }
    
    pathIds.unshift(currentId);
    pathNodes.unshift(node);
    
    currentId = node[parentIdField];
  }
  
  return { pathIds, pathNodes };
}
```

**示例：**

```typescript
// 获取"张三"的路径
const path = treeManager.getNodePath(6);

// 结果
{
  pathIds: [1, 2, 4, 6],
  pathNodes: [
    { id: 1, parentId: null, name: '公司' },
    { id: 2, parentId: 1, name: '研发部' },
    { id: 4, parentId: 2, name: '前端组' },
    { id: 6, parentId: 4, name: '张三' }
  ]
}
```

### 8.2 searchNodes - 节点搜索

```typescript
/**
 * 搜索节点（支持多字段模糊匹配）
 * @param keyword 关键词
 * @param searchFields 搜索字段列表
 * @returns 匹配的节点数组
 */
searchNodes(
  keyword: string,
  searchFields: string[] = ['name']
): FlatTreeNode[] {
  if (!keyword) return [];
  
  const lowerKeyword = keyword.toLowerCase();
  
  return Object.values(this.cache).filter(node => {
    return searchFields.some(field => {
      const value = node[field];
      if (typeof value === 'string') {
        return value.toLowerCase().includes(lowerKeyword);
      }
      return false;
    });
  });
}
```

### 8.3 高级搜索（带路径）

```typescript
/**
 * 搜索节点并返回路径信息
 * @param keyword 关键词
 * @param searchFields 搜索字段
 * @returns 搜索结果（包含路径）
 */
searchWithPath(
  keyword: string,
  searchFields: string[] = ['name']
): TreeSearchResult {
  const matchedNodes = this.searchNodes(keyword, searchFields);
  
  const paths: Record<string | number, TreePath> = {};
  
  matchedNodes.forEach(node => {
    const idField = this.config.idField || 'id';
    paths[node[idField]] = this.getNodePath(node[idField]);
  });
  
  return { matchedNodes, paths };
}
```

**示例应用：**

```typescript
// 页面脚本
export async function handleSearch() {
  const pageData = $data();
  const keyword = pageData.searchKeyword;
  
  if (!keyword) {
    pageData.searchResults = [];
    return;
  }
  
  const manager = $dataSetManager();
  const result = manager.searchWithPath(keyword, ['name', 'code', 'email']);
  
  // 格式化搜索结果（带路径）
  pageData.searchResults = result.matchedNodes.map(node => {
    const path = result.paths[node.id];
    return {
      ...node,
      pathText: path.pathNodes.map(n => n.name).join(' > ')
    };
  });
  
  ElMessage.success(`找到 ${result.matchedNodes.length} 个匹配节点`);
}
```

---

## 9. TreeHelper 工具库

### 9.1 工具函数列表

```typescript
// src/pageScripts/treeHelper.js

// 1. 树结构转换
export function buildTreeFromFlat(flatNodes, options)
export function flattenTree(tree, options)

// 2. 节点查找
export function findNode(tree, nodeId, options)
export function findNodeByPath(tree, path, options)
export function getNodePath(flatNodes, nodeId, options)

// 3. 树遍历
export function traverseTree(tree, callback, options)
export function traverseBFS(tree, callback, options)  // 广度优先
export function traverseDFS(tree, callback, options)  // 深度优先

// 4. 树过滤与排序
export function filterTree(tree, predicate, options)
export function sortTree(tree, compareFn, options)

// 5. 树统计
export function getMaxDepth(tree, options)
export function countNodes(tree, options)
export function getLeafNodes(tree, options)

// 6. API 模拟（用于演示）
export async function getChildren(parentId)
export async function getNodePathIds(nodeId)
export async function getSubTreeByRange(fromId, toId)
export async function searchNodes(keyword)
```

### 9.2 核心函数实现

#### buildTreeFromFlat - 扁平转嵌套

```typescript
/**
 * 扁平数组转嵌套树
 */
export function buildTreeFromFlat(flatNodes, options = {}) {
  const {
    idField = 'id',
    parentIdField = 'parentId',
    childrenField = 'children',
    rootValue = null
  } = options;
  
  // 建立 parentId → children 索引
  const childrenMap = new Map();
  flatNodes.forEach(node => {
    const parentId = node[parentIdField];
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId).push(node);
  });
  
  // 递归构建
  const buildNode = (node) => {
    const children = childrenMap.get(node[idField]) || [];
    return {
      ...node,
      [childrenField]: children.map(child => buildNode(child))
    };
  };
  
  // 构建根节点
  const roots = childrenMap.get(rootValue) || [];
  return roots.map(root => buildNode(root));
}
```

#### filterTree - 树过滤

```typescript
/**
 * 过滤树节点（保留满足条件的节点及其祖先）
 */
export function filterTree(tree, predicate, options = {}) {
  const { 
    childrenField = 'children',
    keepParents = true  // 是否保留父节点
  } = options;
  
  const filterNode = (node) => {
    const children = node[childrenField] || [];
    const filteredChildren = children
      .map(child => filterNode(child))
      .filter(child => child !== null);
    
    // 当前节点或子节点满足条件
    if (predicate(node) || filteredChildren.length > 0) {
      return {
        ...node,
        [childrenField]: filteredChildren
      };
    }
    
    return keepParents ? node : null;
  };
  
  return tree
    .map(node => filterNode(node))
    .filter(node => node !== null);
}
```

#### traverseTree - 树遍历

```typescript
/**
 * 深度优先遍历（前序）
 */
export function traverseTree(tree, callback, options = {}) {
  const { childrenField = 'children' } = options;
  
  const traverse = (node, level, parent) => {
    callback(node, level, parent);
    
    const children = node[childrenField] || [];
    children.forEach(child => traverse(child, level + 1, node));
  };
  
  tree.forEach(node => traverse(node, 0, null));
}

/**
 * 广度优先遍历
 */
export function traverseBFS(tree, callback, options = {}) {
  const { childrenField = 'children' } = options;
  
  const queue = tree.map(node => ({ node, level: 0, parent: null }));
  
  while (queue.length > 0) {
    const { node, level, parent } = queue.shift();
    callback(node, level, parent);
    
    const children = node[childrenField] || [];
    children.forEach(child => {
      queue.push({ node: child, level: level + 1, parent: node });
    });
  }
}
```

---

## 10. 与 DataSet 集成

### 10.1 SelfReferenceTable 类型

```typescript
export interface SelfReferenceTable extends DataTable {
  treeConfig: TreeConfig       // 树配置
  flatTreeCache?: FlatTreeCache // 扁平树缓存（懒加载模式）
  
  // 扩展方法（运行时添加）
  loadChildren?(parentId: string | number | null): Promise<FlatTreeNode[]>
  expandToNode?(targetId: string | number): Promise<void>
  searchNodes?(keyword: string): Promise<FlatTreeNode[]>
}
```

### 10.2 集成示例

```json
{
  "dataset": {
    "dataSetName": "OrgManagement",
    "tables": {
      "OrgTree": {
        "tableName": "OrgTree",
        "columns": [
          { "columnName": "id", "dataType": "number", "isPrimaryKey": true },
          { "columnName": "parentId", "dataType": "number" },
          { "columnName": "name", "dataType": "string" },
          { "columnName": "type", "dataType": "string" },
          { "columnName": "order", "dataType": "number" }
        ],
        "rows": [],
        "treeConfig": {
          "mode": "flat",
          "lazy": true,
          "idField": "id",
          "parentIdField": "parentId"
        }
      }
    }
  }
}
```

### 10.3 页面脚本集成

```typescript
import { TreeManager } from '../../utils/treeManager';
import { $data, $dataSetManager } from '../common.js';
import { buildTreeFromFlat } from '../treeHelper.js';

let treeManager = null;

export function init() {
  const data = $data();
  
  // 创建 TreeManager 实例
  treeManager = new TreeManager(data.dataset.tables.OrgTree.treeConfig);
  
  // 添加初始节点到缓存
  treeManager.addNodesToCache(data.dataset.tables.OrgTree.rows);
  
  // 富化节点（计算 level、hasChildren）
  const enrichedNodes = treeManager.enrichNodes();
  
  // 构建嵌套树（用于 el-tree）
  const nestedTree = treeManager.buildNestedTree(enrichedNodes);
  
  // 更新到响应式数据
  data.displayTree = nestedTree;
  
  console.log('✅ TreeManager 初始化完成');
}
```

---

## 11. 完整应用示例

### 11.1 组织架构树（tree-demo）

**数据配置（data.json）：**

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
    { "id": 1, "parentId": null, "name": "武汉领码科技", "type": "company", "level": 0 },
    { "id": 2, "parentId": 1, "name": "研发中心", "type": "department", "level": 1 },
    { "id": 3, "parentId": 1, "name": "市场部", "type": "department", "level": 1 },
    { "id": 4, "parentId": 2, "name": "前端组", "type": "team", "level": 2 },
    { "id": 5, "parentId": 2, "name": "后端组", "type": "team", "level": 2 },
    { "id": 6, "parentId": 4, "name": "张三", "type": "employee", "level": 3 }
  ],
  "currentNode": null,
  "nodePath": [],
  "searchKeyword": "",
  "searchResults": [],
  "displayTree": []
}
```

**UI 配置（rule.json）：**

```json
[
  {
    "type": "div",
    "class": "tree-demo-container",
    "children": [
      {
        "type": "el-input",
        "props": {
          "placeholder": "搜索节点...",
          "dataKey": "searchKeyword"
        },
        "on": {
          "input": "handleSearch"
        }
      },
      {
        "type": "el-tree",
        "props": {
          "data": "dataKey:displayTree",
          "nodeKey": "id",
          "defaultExpandAll": false,
          "highlightCurrent": true
        },
        "on": {
          "node-click": "handleNodeClick",
          "node-expand": "handleNodeExpand"
        }
      }
    ]
  }
]
```

**业务逻辑（script.js）：**

```typescript
import { TreeManager } from '../../utils/treeManager';
import { $data } from '../common.js';
import { ElMessage } from 'element-plus';

let treeManager = null;

// 初始化
export function init() {
  const data = $data();
  
  treeManager = new TreeManager(data.treeConfig);
  treeManager.addNodesToCache(data.treeNodes);
  
  const enrichedNodes = treeManager.enrichNodes();
  data.displayTree = treeManager.buildNestedTree(enrichedNodes);
}

// 节点点击
export function handleNodeClick(data, node) {
  const pageData = $data();
  pageData.currentNode = data;
  
  // 获取节点路径
  const path = treeManager.getNodePath(data.id);
  pageData.nodePath = path.pathNodes;
}

// 节点展开（懒加载）
export async function handleNodeExpand(data, node) {
  if (data.hasChildren && !data.children?.length) {
    data.loading = true;
    
    try {
      const children = await getChildren(data.id);
      treeManager.addNodesToCache(children);
      data.children = children;
    } catch (error) {
      ElMessage.error('加载子节点失败');
    } finally {
      data.loading = false;
    }
  }
}

// 搜索节点
export function handleSearch() {
  const pageData = $data();
  const keyword = pageData.searchKeyword;
  
  if (!keyword) {
    pageData.searchResults = [];
    return;
  }
  
  const result = treeManager.searchWithPath(keyword, ['name', 'type']);
  
  pageData.searchResults = result.matchedNodes.map(node => ({
    ...node,
    pathText: result.paths[node.id].pathNodes.map(n => n.name).join(' > ')
  }));
  
  ElMessage.success(`找到 ${result.matchedNodes.length} 个匹配节点`);
}

// 定位节点（展开路径）
export async function handleLocateNode(nodeId) {
  await treeManager.expandToNode(
    nodeId,
    getNodePathIds,       // API: 获取路径 ID
    getSubTreeByRange     // API: 加载区间节点
  );
  
  // 展开路径后，高亮节点
  const pageData = $data();
  const node = treeManager.getNode(nodeId);
  pageData.currentNode = node;
  
  ElMessage.success('已展开到目标节点');
}

// Mock API
async function getChildren(parentId) {
  await new Promise(resolve => setTimeout(resolve, 300));
  return mockData.filter(n => n.parentId === parentId);
}

async function getNodePathIds(nodeId) {
  return treeManager.getNodePath(nodeId);
}

async function getSubTreeByRange(fromId, toId) {
  // 模拟加载区间节点
  return mockData.filter(n => n.id >= fromId && n.id <= toId);
}
```

---

## 12. 性能优化策略

### 12.1 缓存策略

```typescript
// 策略 1：全量缓存（小数据量 < 1000 节点）
treeManager.addNodesToCache(allNodes);

// 策略 2：分页缓存（中等数据量 1000-10000 节点）
async function loadPage(page, size) {
  const nodes = await api.getNodes({ page, size });
  treeManager.addNodesToCache(nodes);
}

// 策略 3：LRU 缓存（大数据量 > 10000 节点）
class LRUTreeCache {
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // 删除最久未使用的节点
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

### 12.2 渲染优化

```typescript
// 优化 1：虚拟滚动（大数据量树）
{
  "type": "el-tree",
  "props": {
    "virtualScroll": true,  // Element Plus 虚拟滚动
    "itemSize": 28,
    "data": "dataKey:displayTree"
  }
}

// 优化 2：按需展开（只构建可见部分）
export function handleNodeExpand(data, node) {
  // 只构建当前节点的直接子节点
  const children = treeManager.getChildren(data.id);
  data.children = children;  // 不递归构建子树
}

// 优化 3：延迟加载（debounce）
import { debounce } from 'lodash-es';

export const handleSearch = debounce(function() {
  const keyword = $data().searchKeyword;
  const results = treeManager.searchNodes(keyword);
  $data().searchResults = results;
}, 300);
```

### 12.3 网络优化

```typescript
// 优化 1：批量加载
async function batchLoadChildren(parentIds) {
  // 一次请求加载多个父节点的子节点
  const children = await api.batchGetChildren(parentIds);
  treeManager.addNodesToCache(children);
}

// 优化 2：预加载（Prefetch）
export function handleNodeExpand(data, node) {
  // 加载当前节点的子节点
  const children = await api.getChildren(data.id);
  data.children = children;
  
  // 预加载下一层（后台加载）
  children.forEach(child => {
    api.getChildren(child.id).then(grandchildren => {
      treeManager.addNodesToCache(grandchildren);
    });
  });
}

// 优化 3：数据压缩
// 后端返回压缩格式
{
  "compressed": true,
  "fields": ["id", "parentId", "name", "type"],
  "data": [
    [1, null, "公司", "company"],
    [2, 1, "研发部", "department"]
  ]
}

// 前端解压
function decompressNodes(response) {
  const { fields, data } = response;
  return data.map(row => {
    const node = {};
    fields.forEach((field, index) => {
      node[field] = row[index];
    });
    return node;
  });
}
```

---

## 总结

### 核心设计原则

1. **扁平存储** - 数据库友好，CRUD 简单
2. **按需构建** - 只构建可见部分，提升性能
3. **懒加载** - 大数据场景天然支持
4. **差量补齐** - 智能加载缺失节点
5. **缓存优先** - 减少网络请求
6. **事件驱动** - 解耦架构，易扩展
7. **类型安全** - TypeScript 保障

### 技术优势

| 维度 | 传统方案 | PageData Tree |
|------|---------|--------------|
| 存储复杂度 | O(n log n) | O(n) |
| 查询复杂度 | O(n) | O(log n) |
| 插入复杂度 | O(n) | O(1) |
| 内存占用 | 高（嵌套引用） | 低（扁平数组） |
| 懒加载 | 难实现 | 天然支持 |
| 大数据性能 | 差 | 优 |

### 最佳实践

1. **小数据量（< 1000）** → 嵌套模式 + 非懒加载
2. **中等数据量（1000-10000）** → 扁平模式 + 懒加载
3. **大数据量（> 10000）** → 扁平模式 + 懒加载 + 虚拟滚动
4. **超大数据量（> 100000）** → 扁平模式 + LRU 缓存 + 服务端分页

### 扩展方向

- **多选支持** - checkable 树
- **拖拽排序** - draggable 树
- **权限控制** - 节点级权限
- **实时更新** - WebSocket 推送
- **离线支持** - IndexedDB 缓存
- **AI 预测** - 智能展开推荐

---

**📄 文档版本：1.0**  
**📅 更新日期：2026-01-09**  
**👨‍💻 基于：PageData 1.1 CSDN 系列文章**  
**🔗 配套文档：** [第一部分 - 核心数据层](DATASET_DESIGN_DOC.md)
