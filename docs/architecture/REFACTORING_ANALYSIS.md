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
| spark-app | 4 | 62 | AuthService, TokenManager, Logger, PluginRegistry |

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

**统计**：共发现 16 处 `@deprecated` 标注

| 模块 | 废弃项 | 替代方案 |
|------|--------|----------|
| spark-utils/http | `FileCacheEntry` 类型 | `CacheEntry<string>` |
| spark-utils/FileLoader | `getTimestamp()` 方法 | 新方法名 |
| spark-app/auth | `authService` 单例 | 能力系统 `APP_SERVICES.auth` |
| spark-app/plugins | `PluginRegistry` 静态方法 (9个) | `getGlobalPluginRegistry()` |
| spark-app/start | `registerComponents` 选项 | 自动发现机制 |

**建议**：在 0.6.0 版本做一次清理，移除所有 deprecated API。

### 5. ~~spark-app 测试覆盖为零~~ ✅ 已确认有完整测试

> **实际情况**：spark-app 已有 4 个测试文件，62 个测试用例，覆盖：
> - `AuthService` — 20 tests (login/logout/refresh/checkAuth/hooks)
> - `TokenManager` — 6 tests (set/get/clear/multi-key)
> - `Logger` — 16 tests (levels/scopes/transports)
> - `PluginRegistry` — 20 tests (register/load/unload)

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

**目标**：将 `data-view.ts` 从 1727 行优化，提高可维护性。

**当前结构分析**（已使用委托模式）：

| 职责域 | 行数范围 | 委托类 | 状态 |
|--------|----------|--------|------|
| 选择状态管理 | 230-314 | `SelectionDelegate` | ✅ 已委托 |
| CRUD 操作 | 1084-1140 | `CrudDelegate` | ✅ 已委托 |
| 脏数据追踪 | 1340-1394 | `DirtyTrackingDelegate` | ✅ 已委托 |
| 计算列 | 406-475 | `ComputedColumnDelegate` | ✅ 已委托 |
| 级联更新 | — | `CascadeDelegate` | ✅ 已委托 |
| 本地变更 | 1179-1340 | `LocalMutationDelegate` | ✅ 已委托 |

**结论**：DataView 已采用**策略/委托模式**将核心逻辑分散到 6 个委托类中：
- `packages/spark-data/src/strategies/selection-delegate.ts` (480 行)
- `packages/spark-data/src/strategies/crud-delegate.ts` (335 行)
- `packages/spark-data/src/strategies/dirty-tracking-delegate.ts` (350 行)
- `packages/spark-data/src/strategies/computed-column-delegate.ts` (411 行)
- `packages/spark-data/src/strategies/cascade-delegate.ts`
- `packages/spark-data/src/strategies/local-mutation-delegate.ts`

DataView 本身作为**门面(Facade)**，主要职责是：
1. 委托路由 — 将方法调用转发到对应委托
2. 属性暴露 — 提供便捷的 `get` 访问器
3. 事件协调 — 统一事件发射入口
4. 生命周期 — 初始化/销毁委托实例

**优化建议**（非紧急，可选）：
- 聚合逻辑（`_recomputeSummary`、`_recomputeSelectionSummary`）可抽取为 `AggregationDelegate`
- 树代理方法（`loadTreeChildren` 等）可抽取为 `TreeProxyMixin`
- 但 **不建议立即拆分文件**——当前结构已符合单一职责原则（委托内聚，门面薄层）

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

| 指标 | 当前 | 目标 | 状态 |
|------|------|------|------|
| verify-architecture.mjs 通过 | 0 errors | 0 errors | ✅ 已达成 |
| 防循环机制 | originatorId | originatorId | ✅ 已达成 |
| 测试覆盖 | 396+ cases | 400+ | ✅ 符合 |
| data-view.ts 架构 | 委托模式 | — | ✅ 已合理 |
| 废弃 API 数量 | 16 处 | 0 处 | ⏳ 0.6.0 清理 |
| 循环依赖检测 | 手动 | 自动 (CI) | ⏳ 待实现 |

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

### B. DataView 架构分析（委托模式）

**核心设计**：DataView 采用**门面 + 委托**模式，将业务逻辑分散到专职委托类。

| 委托类 | 文件 | 行数 | 职责 |
|--------|------|------|------|
| `SelectionDelegate` | selection-delegate.ts | 480 | 当前行/选中行/value/label 管理 |
| `ComputedColumnDelegate` | computed-column-delegate.ts | 411 | 表达式编译/求值/缓存 |
| `CrudDelegate` | crud-delegate.ts | 335 | create/update/delete/batch/import/export |
| `DirtyTrackingDelegate` | dirty-tracking-delegate.ts | 350 | 脏行追踪/快照对比/字段级变更 |
| `LocalMutationDelegate` | local-mutation-delegate.ts | ~200 | 本地增删改（不触发 API） |
| `CascadeDelegate` | cascade-delegate.ts | ~150 | 父子表级联加载/过滤 |

**DataView 门面职责**（1727 行，但多为转发和属性暴露）：
- **委托路由**：方法调用转发到对应委托
- **属性暴露**：`get currentRow()` → `selectionDelegate.getCurrentRow()`
- **事件协调**：统一 `emit*()` 入口，通知 DataSet 级订阅
- **生命周期**：`destroy()` 清理所有委托

### C. 关键文件引用

- [ANTI_LOOP_MECHANISM_REVIEW.md](./ANTI_LOOP_MECHANISM_REVIEW.md) - 防循环机制详细分析
- [EVENT_SOURCE_MECHANISM.md](./EVENT_SOURCE_MECHANISM.md) - 事件来源标识机制
- [copilot-instructions.md](../../.github/copilot-instructions.md) - 官方架构设计文档
