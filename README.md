# SPARK 架构 - 上下文接口模块

本模块实现了 SPARK 架构中的上下文契约化设计，遵循“能力分层 × 职责解耦 × 上下文契约”原则。

## 核心概念

### 上下文 vs 数据
- **上下文（Context）**：通过 `provide/inject` 传递语义化、低频、结构稳定的信息
- **业务数据（Data）**：通过 props、store 或 API 流转

### 设计原则
- 使用 `Symbol` 作为 key 避免命名冲突
- 上下文只读、不传递响应式数据
- 包含审计字段（`providedAt`、`providedBy`）

## 接口说明

### PageContext
页面级上下文，包含模块、页面信息和权限。

### ModelContext
模型级上下文，包含模型元信息和字段权限。

### OperationContext
操作级上下文，包含操作信息和事务ID。

### AppContext
应用级上下文，包含用户、租户和全局配置。

## 使用示例

```vue
<script setup lang="ts">
import { providePageContext, useModelContext } from '@/context/composables';

// 在父组件中提供上下文
providePageContext({
  moduleCode: 'order',
  pageCode: 'order-list',
  pageMode: 'runtime',
  pagePermissions: ['read', 'create']
});

// 在子组件中注入上下文
const modelContext = useModelContext();
</script>
```

## 工程约束

- 禁止在上下文中传递 `ref` 或 `reactive` 对象
- 上下文应只包含低频稳定信息
- 必须记录 `providedAt` 和 `providedBy` 用于审计

## 测试

运行契约测试确保上下文接口的正确性：

```bash
npm run test:contract
```

## 使用 Spark 命名空间（推荐）

统一导入入口，便于维护与迁移：

```ts
// 导入命名空间
import { Spark } from '@spark-view/spark-core'

// 使用 manager
const manager = Spark.manager()

// 使用 logger
const logger = Spark.logger()
```