# 方案计划书：spark-ai class/interface 统一优化

## 任务目标

统一 spark-ai 全仓的 class implements interface 模式，清理不合理结构，不向后兼容，先内后外迭代修改。

## 影响范围

| 文件 | 变更类型 | 概要 |
|---|---|---|
| `core/protocol/business-registration.ts` | 改 | 删除重复的 `ModulePromptContext`，改为从 `protocol.ts` import |
| `core/protocol/protocol.ts` | 改 | 无变化（保留 `ModulePromptContext` 定义） |
| `core/internal/knowledge/knowledge-projection.ts` | 改 | `AiKnowledgeProjection` 重命名为 `AiKnowledgeProjectionBehavior`，更新 class implements |
| `core/index.ts` | 改 | 更新 export 条目名称 |
| `core/internal/runtime/ai-runtime.ts` | 改 | 移除 `implements AiRuntimeApi`，改为独立 class |
| `core/host/types.ts` | 改 | 提取 `AiHostOptions.registry` 内联类型为 `AiHostBusinessRegistryApi` 接口 |
| `core/host/business-registry.ts` | 改 | `AiHostBusinessRegistry implements AiHostBusinessRegistryApi` |
| `registrations/leave-request/leave-request-module.ts` | 改 | `LeaveRequestModule extends LeaveRequestModuleRegistration` 消除重复；删除冗余 `*Options` 接口 |
| `registrations/page-design/page-design-module.ts` | 改 | `PageDesignModule extends AiModuleRegistrationBase`；删除冗余 `*Options` 接口 |
| `registrations/page-design/modules/lifecycle-tool-catalog.ts` | 改 | `LifecycleModule extends AiModuleRegistrationBase` |
| `registrations/page-design/modules/text-model-tool-catalog.ts` | 改 | `TextModelModule extends AiModuleRegistrationBase` |
| `registrations/page-design/modules/node-tree-tool-catalog.ts` | 改 | `NodeTreeModule extends AiModuleRegistrationBase` |
| `registrations/page-design/modules/dataset-tool-catalog.ts` | 改 | `DatasetModule extends AiModuleRegistrationBase` |
| `registrations/app-ai-businesses.ts` | 改 | 消除 `ModuleBackedBusinessRuntime` 基类，两个子类直接委托 |

## 技术方案

### 步骤 1：删除 `ModulePromptContext` 重复定义（T1）

- `business-registration.ts` 第 126-133 行的 `ModulePromptContext` interface 删除
- `protocol.ts` 第 65-68 行的版本保持不变（`extends AiRuntimeInstanceScope`）
- `business-registration.ts` 顶部增加 `import type { ModulePromptContext } from './protocol'` 或在 `business-registration.ts` 中定义前向引用（因 protocol 已 import business-registration，需改为从 protocol re-export）

### 步骤 2：重命名 `AiKnowledgeProjection`（T2）

- `core/internal/knowledge/knowledge-projection.ts` 中 `AiKnowledgeProjection` → `AiKnowledgeProjectionBehavior`
- `AiKnowledgeProjector implements AiKnowledgeProjectionBehavior`
- `core/index.ts` export 更新为 `AiKnowledgeProjectionBehavior`
- `protocol.ts` 的 `AiRuntimeKnowledgeProjection`（数据 shape）不受影响

### 步骤 3：`LeaveRequestModule extends LeaveRequestModuleRegistration`（T3）

- 删除 `LeaveRequestModule` 中重复的 `moduleId`/`name`/`description`/`entity`/`functions` 声明
- 让 `LeaveRequestModule extends LeaveRequestModuleRegistration`
- `LeaveRequestModuleRegistration` 的 `prompt` 和 `LeaveRequestModule` 的 `prompt` 不同，子类 override
- `LeaveRequestModule` 保留 static moduleId、static assertContext、static createDraftId、运行态属性（service/core/ai）、运行态方法

### 步骤 4：提取 `AiHostBusinessRegistryApi` 接口（T4）

- `core/host/types.ts` 中把 `AiHostOptions.registry` 的内联类型提取为：
  ```typescript
  export interface AiHostBusinessRegistryApi {
    get(moduleId: string): AiHostBusinessRuntime | undefined
    list(): readonly AiHostBusinessRuntime[]
    routingCandidates(): readonly AiHostRoutingCandidate[]
  }
  ```
- `AiHostOptions.registry` 改为 `readonly registry: AiHostBusinessRegistryApi`
- `AiHostBusinessRegistry implements AiHostBusinessRegistryApi`

### 步骤 5：`AiRuntime` 解耦 `AiRuntimeApi`（T5）

- `AiRuntime` class 移除 `implements AiRuntimeApi`
- 方法签名不变，保持为独立 class
- `AiRuntimeApi` 接口保留作为消费者可见的契约
- 创建 `createAiRuntimeApi(runtime: AiRuntime): AiRuntimeApi` 工厂函数，返回对象字面量适配接口

### 步骤 6：消除 `ModuleBackedBusinessRuntime` 基类（T6）

- 删除 `ModuleBackedBusinessRuntime` abstract class
- `LeaveRequestBusinessRuntime` 直接 implements `AiHostBusinessRuntime`，持有 `LeaveRequestModule` 实例，直接委托
- `PageDesignBusinessRuntime` 直接 implements `AiHostBusinessRuntime`，持有 `PageDesignModule` 实例，直接委托
- 消除 `object` + `as` 类型断言

### 步骤 7：删除业务模块冗余 `*Options` 接口（T7）

- `leave-request-module.ts` 删除 `LeaveRequestRuntimeContext`、`LeaveRequestAppendMessageOptions`、`LeaveRequestExecuteFunctionCallOptions`、`LeaveRequestStopSessionOptions`
- 方法签名改为使用 protocol 通用类型（`AiRuntimeAppendMessageOptions` 等）
- `page-design-module.ts` 删除 `PageDesignRuntimeContext`、`PageDesignModuleOptions`（保留 getEditToolHost 回调但改为通用类型）、`PageDesignExecuteFunctionCallOptions`、`PageDesignAppendMessageOptions`、`PageDesignStopSessionOptions`
- `PageDesignModuleOptions.getEditToolHost` 参数改为 `{ requestId: string; pageId: string }` 或直接使用 `AiRuntimeInstanceScope`

### 步骤 8：统一 `AiModuleRegistration` 实现模式（T8）

- `PageDesignModule extends AiModuleRegistrationBase`：通过构造函数传入 moduleId/name/description/prompt/modules
- `LeaveRequestModuleRegistration` 保持为 `extends AiModuleRegistrationBase` 的基类
- `LeaveRequestModule extends LeaveRequestModuleRegistration`：继承静态数据，只添加运行态
- 子模块（LifecycleModule、TextModelModule、NodeTreeModule、DatasetModule）改为 `extends AiModuleRegistrationBase`

### 步骤 9：验证（T9）

- 运行 `npx tsc --noEmit` 编译检查
- 运行已有测试
- 运行 `npx eslint` lint 检查

## 关键设计决策

1. **先内后外**：从 core/protocol 开始，再到 core/internal，再到 core/host，最后到 registrations
2. **不向后兼容**：直接重命名/删除，不保留旧名称的 type alias
3. **最小改动原则**：每个 T 是一个最小闭环，改完一处立即验证编译

## 兼容性

- 不向后兼容：所有重命名/删除都是 breaking change
- 对外部消费者（ai-host.ts 等）的影响：`AiRuntime` 不再直接实现 `AiRuntimeApi`，需要通过工厂函数转换；`*Options` 类型名称变更

## 验证计划

- 编译检查：`npx tsc --noEmit --project packages/spark-ai/tsconfig.json`
- 测试：运行 spark-ai 包的测试
- Lint：`npx eslint packages/spark-ai/src/`
- 人工验证：检查 git diff 确认改动符合预期

## 风险项

- **类型级联错误**：删除 `*Options` 接口后，外部可能有引用，需要一并更新
- **AiBusinessModuleBase 冲突**：存在 `ai-business-module-base.ts` 使用了 `Omit<XxxOptions, 'moduleId'>` 模式，删除 Options 后需要同步调整
- **Mitigation**：每步完成后立即编译验证，失败则回退修正
