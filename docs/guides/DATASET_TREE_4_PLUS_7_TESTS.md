# DataSet 4+7 接口测试说明（导航表）

## 目标

验证 Tree 能力的 **4 个远程接口 + 7 个本地接口**，并统一使用“导航表”语义的接口路径：

- 导航基路径：`/api/tenants/tenant-test/projects/homepage/navigation/nodes`
- 对应测试文件：`packages/spark-data/src/tests/dataset-tree-4-plus-7.test.ts`

> 说明：当前后端生产接口以 `navigation/nodes` 为主，测试中通过 mock HTTP 响应验证 DataView/TreeManager 的编排行为，不依赖真实后端树端点。

---

## 覆盖矩阵

### 一、远程 4 接口（DataView 委托）

1. `loadTreeChildren(parentId, limit)`
   - 断言调用 `GET /navigation/nodes`
   - 断言 query 参数包含 `parentId`、`limit`

2. `loadTreePath(id)`
   - 断言调用 `GET /navigation/nodes/path/{id}`
   - 断言返回 `pathIds`

3. `expandTreeToNode(targetId)`
   - 断言先调 `path` 再调 `subtree`
   - 断言缓存已完整时跳过 `subtree`

4. `searchTreeNested(keyword, limit)`
   - 断言调用 `GET /navigation/nodes/nested-search`
   - 断言 query 参数包含 `keyword`、`limit`

### 二、本地 7 接口（TreeManager 内存）

1. `getNode(id)`
2. `getChildren(parentId)`
3. `getRoots()`
4. `getNodePath(nodeId)`
5. `searchNodes(keyword)`
6. `buildNestedTree(rootId?)`
7. `buildSubTree(rootId)`

---

## 运行方式

在仓库根目录执行：

```bash
npx vitest run packages/spark-data/src/tests/dataset-tree-4-plus-7.test.ts --reporter verbose
```

如需连同已有 CRUD 作用域测试一起执行：

```bash
npx vitest run packages/spark-data/src/tests/crud-delegates.test.ts packages/spark-data/src/tests/dataset-tree-4-plus-7.test.ts --reporter verbose
```

---

## 判定标准

- 所有 case 通过（0 failed）
- 远程 4 接口：断言 URL、参数、调用顺序、缓存短路行为
- 本地 7 接口：断言树结构、路径、搜索与子树构建结果
