# Features 目录说明

## 概述

`features/` 目录包含 SPARK 组件系统的**功能扩展包**，用于集成第三方组件库。

## 目录结构

```
features/
└── (暂无活跃 feature 包)
```

## ⚙️ 开发指南

### 添加新 Feature 组件

1. 在 `features/spark-xxx/` 创建组件
2. 使用 `useSparkComponent` composable
3. 在 `tests/` 中编写测试

### 运行测试

```bash
pnpm run test                    # 运行所有测试
```

## 📚 相关文档

- [数据流架构](../docs/architecture/DATAFLOW_ARCHITECTURE.md)
- [组件开发指南](../docs/guides/COMPONENT_DEVELOPMENT.md)
- [PageRenderer API](../packages/spark-component/API.md)
