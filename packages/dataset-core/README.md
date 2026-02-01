# @spark-view/dataset-core

数据集核心包 - 提供类似 .NET DataSet 的数据管理能力

## 功能

- **DataSet**: 数据集管理（表、关系、订阅）
- **DataTable**: 数据表结构和 CRUD 操作
- **BindingContext**: 数据绑定上下文（视图层）
- **TreeManager**: 树形数据管理（扁平/嵌套转换、懒加载）
- **FilterExpressionParser**: 过滤表达式解析

## 安装

```bash
pnpm add @spark-view/dataset-core
```

## 使用

```typescript
import { DataSet, DataSetManager, TreeManager } from '@spark-view/dataset-core'
import type { IDataSet, DataRow } from '@spark-view/dataset-core'

// 创建 DataSet
const dataSet = DataSetManager.create({
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

// 使用 TreeManager
const treeManager = new TreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  lazy: true
})
```

## 架构对应关系

| 模块 | 职责 | 对应 .NET |
|------|------|----------|
| DataSet | 数据集管理 | System.Data.DataSet |
| DataTable | 数据表结构 | System.Data.DataTable |
| BindingContext | 数据绑定上下文 | System.Windows.Forms.BindingContext |

## License

MIT
