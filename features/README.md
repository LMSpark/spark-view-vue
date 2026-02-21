# Features 目录说明

## 📋 概述

`features/` 目录包含 SPARK 组件系统的**测试示例实现**，用于验证 SPARK 核心架构的能力。

⚠️ **重要提示**：
- 主应用**不使用** features 中的组件
- 主应用采用 **L3 层包 (@spark-view/spark-renderer)** 实现渲染逻辑
- features 仅用于**单元测试**和**架构验证**

## 🏗️ 目录结构

```
features/
├── spark/              # SPARK 组件注册
│   └── components/     # 组件定义和注册
│       ├── index.ts    # 组件注册入口
│       └── ej2/        # EJ2 组件包装
└── spark-ej2/          # EJ2 组件初始化
    ├── components/     # Syncfusion EJ2 组件
    ├── initialize.ts   # 初始化逻辑
    └── index.ts
```

## 🎯 用途

### 1. 组件注册

`features/spark/` 中的组件用于：

- `tests/spark-component.test.ts` - SPARK 组件核心功能测试
- `tests/spark-destroy.test.ts` - 组件销毁测试
- `tests/EJ2GridDemo.test.ts` - EJ2 集成测试
- `tests/column-manager-*.test.ts` - 能力系统测试

### 2. 架构验证

验证 SPARK 核心能力：
- ✅ 能力提供/消费模式
- ✅ 无限层级递归
- ✅ 父子上下文通信
- ✅ 组件生命周期管理
- ✅ 延迟绑定机制

## 📦 生产环境架构

主应用采用以下分层架构（**不使用 features**）：

```
L1: @spark-view/spark-app           - 应用基础设施
L2: @spark-view/spark-page-config   - 页面配置系统
L3: @spark-view/spark-renderer      - 页面渲染引擎 ⭐ 核心
L4: @spark-view/spark-component     - 组件核心系统
L5: @spark-view/spark-data          - 数据管理
```

**L3 渲染引擎** (`@spark-view/spark-renderer`) 负责：
- PageRenderer.vue - 页面级渲染
- FormCreate 规则绑定
- DataSet 集成
- CSS 作用域
- 脚本沙箱

## 🔄 迁移说明

如果需要将 features 中的组件用于生产：

1. **方案 A**：创建独立的 npm 包（推荐）
   ```
   packages/spark-ej2-components/
   └── src/
       ├── SparkEJ2Grid.vue
       └── SparkEJ2Column.vue
   ```

2. **方案 B**：使用 FormCreate + EJ2 组件（当前方案）
   - 通过 PageRenderer + FormCreate 渲染
   - 不需要 SPARK 包装层

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
