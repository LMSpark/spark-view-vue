# SPARK 架构深度分析与重构方案

> **文档目的**：以高级架构师视野，系统性分析当前项目存在的架构问题，并制定分阶段重构方案
>
> **分析日期**：2026-03-04
>
> **分析范围**：5 个核心包 + 主项目

---

## 📊 项目现状概览

### 包结构统计

| 包名 | 版本 | 源文件数 | 依赖数 | peer 依赖 | 最大文件行数 |
|------|------|----------|--------|-----------|--------------|
| spark-utils | 0.4.2 | 13 | 1 | 0 | 506 行 (FileLoader) |
| spark-data | 0.5.2 | 38 | 1 | 0 | **1727 行** (data-view) |
| spark-page-config | 0.3.4 | 8 | 2 | 0 | 330 行 (loader) |
| spark-component | 0.4.3 | 33 | 3 | 4 | 442 行 (usePageRenderer) |
| spark-app | 0.3.5 | 27 | 3 | 2 | 629 行 (AuthService) |

### 测试覆盖情况

| 包 | 测试文件 | 测试用例 | 关键覆盖 |
|---|---|---|---|
| spark-utils | 2 | 16 | Logger, 类型测试 |
| spark-data | 13 | 226+ | DataKey, 计算列, TreeManager |
| spark-page-config | 3 | 43 | 配置加载, 编译 |
| spark-component | 14 | 53 | Sandbox, 渲染器 |
| spark-app | - | - | ⚠️ 无覆盖 |

---

## 🔴 P0 - 严重问题（需立即修复）

### 1. 架构验证脚本与实际设计不一致

**问题描述**：`tools/verify-architecture.mjs` 中的依赖规则与 `copilot-instructions.md` 中的官方设计不匹配。

```javascript
// verify-architecture.mjs 中的配置（错误）
const allowedDeps = {
  'spark-component': ['spark-utils', 'spark-app'],     // ❌ 缺少 spark-data, spark-page-config
  'spark-page-config': ['spark-utils', 'spark-app'],   // ❌ 缺少 spark-data
}

// copilot-instructions.md 中的正确设计
spark-page-config    ← 仅依赖 spark-data + spark-utils
spark-component      ← 依赖 spark-data + spark-page-config + spark-utils
```

**影响**：
- 运行 `node tools/verify-architecture.mjs` 报告 17 个"架构问题"，实际是误报
- 新贡献者可能被错误警告误导

**状态**：✅ **已修复** (2026-03-04)

### 2. ~~时序竞争风险（Race Condition）~~ ✅ 已通过事件来源标识机制解决

> **历史问题**：旧版使用模块级 `isSyncingToUI` 标志，存在时序竞争风险。
>
> **当前状态**：已通过 `originatorId` 参数替代全局标志。每个 `useRuleBinding` 实例有唯一
> `bindingId`，事件携带 `originatorId`，接收方仅跳过同一实例的回写。
>
> 参见 [EVENT_SOURCE_MECHANISM.md](./EVENT_SOURCE_MECHANISM.md)

### 3. data-view.ts 超大文件（1727 行）

**问题描述**：单文件包含过多职责，违反单一职责原则。

**当前职责混合**：
- 数据行管理（rows, currentRow, selectedRows）
- 选择逻辑委托
- 计算列委托
- 脏数据追踪委托
- CRUD 操作委托
- 聚合计算（summaryRow, selectionSummaryRow）
- 树结构代理（TreeManager）
- 事件总线管理

**重构方案**：参见下方「DataView 解耦重构」章节。

---

## 🟡 P1 - 重要问题（本季度解决）

### 4. 废弃 API 堆积

**统计**：共发现 20+ 处 `@deprecated` 标注

| 模块 | 废弃项 | 状态 |
|------|--------|------|
| spark-app/auth | `authService` 单例 | 待移除 |
| spark-app/plugins | `PluginRegistry` 静态方法 | 已有替代 API |
| spark-app/start | `registerComponents` 选项 | 已有自动发现 |
| spark-utils/http | `FileCacheEntry` 类型别名 | 已有替代 |

**建议**：在 0.6.0 版本做一次清理，移除所有 deprecated API。

### 5. spark-app 测试覆盖为零

**风险**：
- `AuthService`（629 行）无测试
- `TokenManager`（349 行）无测试
- `PluginManager` 逻辑无测试

**修复方案**：为 spark-app 补充核心模块测试。

### 6. ~~多实例干扰风险~~ ✅ 已通过实例级标识解决

> **历史问题**：旧版使用模块级 `isSyncingToUI`，所有 PageRenderer 实例共享。
>
> **当前状态**：每个 `useRuleBinding` 实例有唯一 `instanceId = 'binding-${++_bindingIdCounter}'`，
> 事件携带 `originatorId`，只跳过同一实例的回写，其他实例正常工作。

---

## 🟢 P2 - 改进建议（长期优化）

### 7. 类型系统改进

**7.1 泛型约束不足**

```typescript
// 当前：宽松的 IDataRow
interface IDataRow {
  [key: string]: unknown
}

// 改进：支持泛型约束
interface IDataRow<T extends object = Record<string, unknown>> extends T {
  _perm?: IInstancePermission
  // ...
}
```

**7.2 严格空值检查增强**

当前 `tsconfig.json` 已启用 `strictNullChecks`，但部分返回值仍使用 `unknown`。

### 8. 可观测性不足

**问题描述**：
- 缺少结构化日志标准
- 缺少性能指标采集
- 缺少追踪 ID

**改进方案**：
```typescript
// 建议：结构化日志
logger.info({
  event: 'currentRowChanged',
  table: tableName,
  viewId: viewId,
  rowId: getPkKey(row),
  source: originatorId,
  durationMs: performance.now() - startTime,
})
```

### 9. 错误处理标准化

**问题描述**：部分模块使用 `throw new Error()`，部分使用 `logger.error()`，缺乏统一规范。

**建议**：
- 定义 `SparkError` 基类
- 使用 `SharedErrorCodes` 分类错误
- 为关键操作添加 Result 类型返回

### 10. 权限模块未接入业务

**现状**：`permission/` 模块（PermissionChecker, PermissionFilter, FieldRenderHelper）已实现，但未被渲染层消费。

**建议**：在 r-table / r-form 组件中接入权限渲染逻辑。

---

## 📐 重构方案

### 阶段 1：紧急修复（1 周）

| 任务 | 优先级 | 状态 |
|------|--------|------|
| 修复 verify-architecture.mjs 依赖配置 | P0 | ✅ 已完成 |
| 时序竞争（originatorId 机制） | P0 | ✅ 已实现 |
| 多实例干扰（实例级 bindingId） | P1 | ✅ 已实现 |

### 阶段 2：DataView 解耦（2 周）

**目标**：将 `data-view.ts` 从 1727 行拆分为 5-6 个职责单一的模块。

```
data-view/
├── index.ts                    # DataView 主类（~400 行）
├── row-state.ts                # 行状态管理（currentRow, selectedRows）
├── computed-facade.ts          # 计算列门面（委托 ComputedColumnDelegate）
├── aggregation.ts              # 聚合逻辑（summaryRow, selectionSummaryRow）
├── tree-proxy.ts               # 树操作代理（委托 TreeManager）
├── events.ts                   # 事件总线封装
└── types.ts                    # DataView 专用类型
```

**拆分策略**：
1. 保持公共 API 不变（`DataView` 类继续导出）
2. 内部使用组合替代继承
3. 每个模块有独立的单元测试文件

### 阶段 3：废弃 API 清理（1 周）

**破坏性变更计划**（0.6.0）：
- 移除 `authService` 单例 → 迁移到 `APP_SERVICES.auth`
- 移除 `PluginRegistry` 静态方法 → 使用 `getGlobalPluginRegistry()`
- 移除 `registerComponents` 启动选项 → 自动发现
- 移除 `FileCacheEntry` 类型别名

**迁移指南模板**：
```typescript
// ❌ 0.5.x（即将移除）
import { authService } from '@spark-view/spark-app'
authService.login(...)

// ✅ 0.6.x
const services = consume(APP_SERVICES)
services?.auth?.login(...)
```

### 阶段 4：补充测试（2 周）

| 模块 | 目标覆盖率 | 关键场景 |
|------|------------|----------|
| spark-app/AuthService | 80% | login/logout/refresh/expire |
| spark-app/TokenManager | 80% | storage/expiry/refresh |
| spark-app/PluginManager | 70% | load/install/uninstall |
| 防循环机制 | 90% | el-table 事件模拟 |

### 阶段 5：可观测性增强（1 周）

1. 定义日志事件标准（JSON schema）
2. 添加可选 OpenTelemetry 集成
3. 添加性能 Timeline 记录

---

## 📋 实施路线图

```
Week 1      Week 2      Week 3      Week 4      Week 5      Week 6
├─ 阶段1 ───┤
         ├──── 阶段2 (DataView 拆分) ─────────┤
                              ├─ 阶段3 ──┤
                                       ├──── 阶段4 (测试) ────────┤
                                                    ├─ 阶段5 ──┤
```

**里程碑**：
- **M1（Week 1）**：P0 问题全部修复，通过 CI
- **M2（Week 3）**：DataView 拆分完成，API 不变
- **M3（Week 4）**：0.6.0-beta 发布，废弃 API 移除
- **M4（Week 6）**：测试覆盖达标，可观测性上线

---

## 🎯 成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| verify-architecture.mjs 通过 | ✅ 0 errors | ✅ 已达成 |
| 防循环机制 | ✅ originatorId | ✅ 已达成 |
| data-view.ts 行数 | 1727 | < 500 |
| spark-app 测试覆盖 | 0% | 70%+ |
| 废弃 API 数量 | 20+ | 0 |
| 循环依赖检测 | 手动 | 自动 (CI) |

---

## 📚 附录

### A. 包依赖关系图（正确版本）

```
                    ┌────────────────┐
                    │   主项目 src/   │
                    └───────┬────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
   ┌─────────────┐   ┌─────────────┐   ┌───────────────┐
   │  spark-app  │   │spark-component│   │ features/    │
   └──────┬──────┘   └──────┬──────┘   │ pages-config │
          │                 │          └───────────────┘
          │    ┌────────────┴────────────┐
          │    ▼                         ▼
          │  ┌───────────────┐   ┌───────────────┐
          │  │spark-page-config│   │  spark-data  │
          │  └───────┬───────┘   └───────┬───────┘
          │          │                   │
          │          └─────────┬─────────┘
          │                    ▼
          │          ┌───────────────┐
          └─────────▶│  spark-utils  │
                     └───────────────┘
```

### B. DataView 当前职责分析

| 职责域 | 方法/属性 | 行数估算 |
|--------|-----------|----------|
| 行管理 | rows, appendRow, updateRowById, deleteRowById, replaceRows | ~300 |
| 选择状态 | currentRow, selectedRows, setCurrentRow, setSelectedRows | ~200 |
| 计算列 | setComputedContext, recomputeColumns, _applyComputedColumns | ~150 |
| 聚合 | summaryRow, selectionSummaryRow, _recomputeSummary | ~200 |
| 树代理 | loadTreeChildren, expandTreeToNode, loadTreePath, searchTreeNested | ~150 |
| CRUD 委托 | crud.*, load, save, delete | ~100 |
| 脏追踪 | dirtyTracking.*, getDirtyRows, hasDirtyRows | ~100 |
| 事件 | events, on, off, emit | ~100 |
| 生命周期 | constructor, destroy, link/unlink | ~200 |
| 工具方法 | getPkKey, buildServerPk, stripComputedColumns | ~100 |

### C. 关键文件引用

- [ANTI_LOOP_MECHANISM_REVIEW.md](./ANTI_LOOP_MECHANISM_REVIEW.md) - 防循环机制详细分析
- [EVENT_SOURCE_MECHANISM.md](./EVENT_SOURCE_MECHANISM.md) - 事件来源标识机制
- [copilot-instructions.md](../../.github/copilot-instructions.md) - 官方架构设计文档
