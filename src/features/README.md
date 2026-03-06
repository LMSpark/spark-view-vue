# Features 目录说明

## 概述

`features/` 目录包含 SPARK 组件系统的**功能扩展包**，用于集成第三方组件库。

## 目录结构

```
features/
└── spark-ej2/          # Syncfusion EJ2 组件集成
    ├── components/     # SparkEJ2Grid, SparkEJ2Column
    ├── composables/    # useSyncfusionLoader
    ├── initialize.ts   # 组件注册逻辑
    └── index.ts        # 公共入口
```

## 用途

### EJ2 组件集成

`features/spark-ej2/` 提供 Syncfusion EJ2 DataGrid 的 SPARK 包装：

- `SparkEJ2Grid` — 表格容器，接入 SPARK 能力系统
- `SparkEJ2Column` — 列定义组件

测试覆盖：
- `tests/spark-component.test.ts` — SPARK 组件核心功能
- `tests/EJ2GridDemo.test.ts` — EJ2 集成验证
- `tests/column-manager-*.test.ts` — 能力系统测试

### 注册方式

```typescript
import { initializeSparkEJ2Components } from '@/features/spark-ej2'

const registry = Spark.getRegistry()
initializeSparkEJ2Components(registry)
```

## ⚙️ 开发指南

### 运行测试

```bash
pnpm run test                    # 运行所有测试
pnpm run test spark-component   # 运行特定测试
```

### 添加新示例组件

1. 在 `features/spark-xxx/` 创建组件
2. 使用 `useSparkComponent` composable
3. 在 `tests/` 中编写测试
4. 不要在 `src/` 主应用中引用

## 📚 相关文档

- [数据流架构](../docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [组件开发指南](../docs/guides/COMPONENT_DEVELOPMENT.md)
- [PageRenderer API](../packages/spark-component/API.md)
