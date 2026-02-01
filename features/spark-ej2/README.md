# SPARK-EJ2 Integration

统一的 SPARK 与 Syncfusion EJ2 集成模块。

## 目录结构

```
features/spark-ej2/
├── components/
│   ├── spark/              # SPARK 集成组件（推荐）
│   │   ├── SparkEJ2Grid.vue
│   │   └── SparkEJ2Column.vue
│   └── basic/              # 基础 EJ2 包装组件
│       ├── GridComponent.vue
│       └── ColumnComponent.vue
├── types.ts                # 类型定义
├── initialize.ts           # 组件初始化
├── index.ts                # 统一导出
└── README.md
```

## 组件说明

### SPARK 集成组件（推荐）

#### SparkEJ2Grid
集成 SPARK 能力系统的 Grid 组件，支持：
- 能力系统（provide/consume）
- 组件注册表
- 递归渲染子组件

#### SparkEJ2Column
集成 SPARK 能力系统的 Column 组件，支持：
- 消费父组件能力
- 嵌套列（children）
- 测试友好（轻量级占位符）

### 基础 EJ2 包装组件

#### GridComponent
基础 EJ2 Grid 包装，直接使用 `<ejs-grid>` 标签。

#### ColumnComponent
基础 EJ2 Column 包装，直接使用 `<e-column>` 标签。

## 使用方式

### 初始化

```typescript
import { initializeSparkEJ2Components } from '@/features/spark-ej2'
import { Spark } from '@spark-view/spark-core'

const manager = Spark.createComponentManager()

// 初始化 SPARK-EJ2 组件
await initializeSparkEJ2Components(manager)
```

### 使用 SPARK 集成组件

```vue
<script setup lang="ts">
import { SparkComponentRenderer } from '@/features/spark/components'
import type { SparkEJ2GridConfig } from '@/features/spark-ej2'

const gridConfig: SparkEJ2GridConfig = {
  type: 'spark-ej2-grid',
  dataSource: [...],
  allowPaging: true,
  children: [
    { type: 'spark-ej2-column', field: 'id', headerText: 'ID' },
    { type: 'spark-ej2-column', field: 'name', headerText: 'Name' }
  ]
}
</script>

<template>
  <SparkComponentRenderer :config="gridConfig" />
</template>
```

### 使用基础包装组件

```vue
<script setup lang="ts">
import { GridComponent, ColumnComponent } from '@/features/spark-ej2'

const gridConfig = {
  type: 'ejs-grid',
  dataSource: [...],
  allowPaging: true,
  children: [
    { field: 'id', headerText: 'ID' },
    { field: 'name', headerText: 'Name' }
  ]
}
</script>

<template>
  <GridComponent :config="gridConfig">
    <ColumnComponent :config="gridConfig.children[0]" parent-type="ejs-grid" />
    <ColumnComponent :config="gridConfig.children[1]" parent-type="ejs-grid" />
  </GridComponent>
</template>
```

## 类型定义

```typescript
export interface SparkEJ2GridConfig extends ComponentConfig {
  type: 'spark-ej2-grid'
  dataSource?: unknown[]
  allowSorting?: boolean
  allowFiltering?: boolean
  allowGrouping?: boolean
  allowPaging?: boolean
  pageSettings?: {
    pageSize?: number
    currentPage?: number
    pageSizes?: number[]
  }
  height?: string | number
  width?: string | number
  children?: SparkEJ2ColumnConfig[]
}

export interface SparkEJ2ColumnConfig extends ComponentConfig {
  type: 'spark-ej2-column'
  field?: string
  headerText?: string
  width?: string | number
  textAlign?: 'Left' | 'Center' | 'Right' | 'Justify'
  format?: string
  template?: unknown
  visible?: boolean
  children?: SparkEJ2ColumnConfig[]
}
```

## 架构优势

1. **统一位置**: 所有 EJ2 相关代码集中在 `features/spark-ej2/`
2. **清晰分层**: SPARK 集成 vs 基础包装分离
3. **可扩展**: 未来可轻松提取为独立包 `@spark-view/spark-ej2`
4. **向后兼容**: 保留基础包装组件供过渡使用
