# @spark-view/spark-data

> SPARK 数据空间 - 类似 .NET DataSet 的数据管理能力

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## 特性

-  **DataSet** - 多表数据管理和订阅
-  **DataTable** - 数据表 CRUD 操作
-  **BindingContext** - 数据绑定上下文
-  **TreeManager** - 树形数据管理（扁平/嵌套转换、懒加载）
-  **FilterParser** - 过滤表达式解析

## 安装

\\\ash
pnpm add @spark-view/spark-data
\\\

## 快速开始

### 命名空间 API（推荐）

\\\	ypescript
import { SparkData } from '@spark-view/spark-data'
import type { IDataSet, DataRow } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyDataSet',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      rows: []
    }
  }
})

// 添加数据
dataSet.tables.Users.addRow({ id: 1, name: 'Alice' })

// 订阅变化
dataSet.subscribe('Users', (event) => {
  console.log('数据变化:', event)
})
\\\

### 树形数据管理

\\\	ypescript
// 创建 TreeManager
const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  lazy: true
})

// 扁平数据转树形
const flatData = [
  { id: 1, name: '根节点', parentId: null },
  { id: 2, name: '子节点', parentId: 1 }
]
const tree = treeManager.buildTree(flatData)

// 懒加载子节点
treeManager.loadChildren(1, async (parentId) => {
  return fetchChildrenFromAPI(parentId)
})
\\\

### 数据绑定

\\\	ypescript
// 创建绑定上下文
const context = SparkData.createContext('Users', 'default', dataSet)

// 当前行
const currentRow = context.getCurrentRow()

// 移动指针
context.moveNext()
context.movePrevious()

// 获取所有行
const allRows = context.getRows()
\\\

## 核心概念

### DataSet 结构

\\\	ypescript
{
  dataSetName: 'MyData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [...],
      rows: [...]
    },
    Orders: { ... }
  }
}
\\\

### 数据操作

\\\	ypescript
// 添加
dataSet.tables.Users.addRow({ id: 1, name: 'Bob' })

// 更新
dataSet.tables.Users.updateRow(0, { name: 'Alice' })

// 删除
dataSet.tables.Users.deleteRow(0)

// 查询
const users = dataSet.tables.Users.rows.filter(r => r.age > 18)
\\\

### 向后兼容

\\\	ypescript
// 直接导入类（旧方式）
import { DataSetManager, TreeManager } from '@spark-view/spark-data'

const ds = DataSetManager.create({ ... })
const tree = new TreeManager({ ... })
\\\

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

无外部依赖（纯 TypeScript 实现）

## 开发命令

\\\ash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
\\\

## License

MIT