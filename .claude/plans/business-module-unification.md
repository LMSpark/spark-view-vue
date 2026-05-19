# Business/Module 类型统一方案

## 任务目标
消除 `IBusinessRegistration` 与 `AiModuleRegistration` 的重复，统一使用 `IModuleRegistration` + `AiModuleRegistration` 语义，不保留向后兼容层。

## 影响范围

### 类型定义层
- `protocol/business-registration.ts` — 删除 `IBusinessRegistration`、`IBusinessRegistrationData`、`IBusinessRegistrationStoreSnapshot`
- `protocol/protocol.ts` — 删除 Business 类型 re-export，删除 `AiRegisteredBusinessApi`，简化 `AiRuntimeApi`
- `core/index.ts` — 删除 Business 类型 export
- `src/index.ts` — 删除 Business 类型 export

### 内部运行时层
- `internal/runtime/ai-runtime-support.ts` — 删除 6 个 Business↔Module 转换函数
- `internal/runtime/ai-registration-repository.ts` — 删除 `registerBusiness` 和所有 `getBusiness*` 方法
- `internal/runtime/ai-registered-api-factory.ts` — 删除 `createRegisteredBusinessApi`
- `internal/runtime/ai-runtime.ts` — 删除 `registerBusiness` 方法

### Host 层
- `host/types.ts` — 删除 `IBusinessRegistrationData` import/export，删除 `AiHostBusinessRuntime.getBusinessRegistrationData?()`
- `host/business-registry.ts` — 删除 `createAiHostRoutingCandidateFromBusiness`，简化 `routingCandidates()`

### 业务实现层
- `registrations/leave-request/leave-request-module.ts` — `LeaveRequestModule` 改 `implements IModuleRegistration`，删除 `businessId`，删除 `getBusinessRegistrationData/Snapshot`
- `registrations/page-design/page-design-module.ts` — `PageDesignModule` 改 `implements IModuleRegistration`，删除 `businessId`，删除 `getBusinessRegistrationData/Snapshot`
- `registrations/app-ai-businesses.ts` — 删除 `getBusinessRegistrationData` 委托

## 技术方案

### 步骤 1：修改 `business-registration.ts`
- 删除 `IBusinessRegistration`、`IBusinessRegistrationData`、`IBusinessRegistrationStoreSnapshot` 三个接口
- 保留 `IModuleRegistration`（用户要求不删）、`AiModuleRegistration`、`AiModuleRegistrationData`、`AiModuleRegistrationStoreSnapshot` 等

### 步骤 2：修改 `protocol.ts`
- 删除 `IBusinessRegistration` 等 3 个 import
- 删除 `AiRegisteredBusinessApi` 接口定义
- 删除 `registerBusiness` 方法从 `AiRuntimeApi`
- 删除 backward compat re-export 中的 Business 类型

### 步骤 3：修改 `core/index.ts` 和 `src/index.ts`
- 删除 Business 类型 export

### 步骤 4：修改 `ai-runtime-support.ts`
- 删除 `isBusinessRegistrationInstance`、`isBusinessRegistrationDataFormat`、`isBusinessStoreSnapshotFormat`
- 删除 `moduleSourceFromBusiness`、`businessToModuleRegistration`、`moduleToBusinessRegistration`
- 删除 `businessDataToModuleData`、`moduleDataToBusinessData`、`moduleStoreToBusinessStoreSnapshot`

### 步骤 5：修改 `ai-registration-repository.ts`
- 删除 `businessIds` Set、`registerBusiness` 方法、所有 `getBusiness*`/`listBusiness*` 方法
- 删除 Business 类型 import 和转换函数 import

### 步骤 6：修改 `ai-registered-api-factory.ts`
- 删除 `createRegisteredBusinessApi` 方法
- 删除 Business 类型 import 和转换函数 import

### 步骤 7：修改 `ai-runtime.ts`
- 删除 `registerBusiness` 方法
- 删除 Business 类型 import

### 步骤 8：修改 `host/types.ts`
- 删除 `IBusinessRegistrationData` import 和 re-export
- 从 `AiHostBusinessRuntime` 删除 `getBusinessRegistrationData?()` 方法

### 步骤 9：修改 `host/business-registry.ts`
- 删除 `createAiHostRoutingCandidateFromBusiness` 函数
- 简化 `routingCandidates()` 为只调用 `createAiHostRoutingCandidateFromRegistration`

### 步骤 10：修改业务模块实现
- `LeaveRequestModule`：改 `implements IModuleRegistration`，删除 `businessId` 字段，删除 `getBusinessRegistrationData/Snapshot` 方法
- `PageDesignModule`：同上

### 步骤 11：修改 `app-ai-businesses.ts`
- 删除 `IBusinessRegistrationData` import
- 删除 `ModuleBackedBusinessRuntime.getBusinessRegistrationData()` 方法

### 步骤 12：运行 `npx vue-tsc --noEmit` 验证

## 兼容性
- **破坏性变更**：所有使用 `IBusinessRegistration`、`IBusinessRegistrationData`、`IBusinessRegistrationStoreSnapshot`、`AiRegisteredBusinessApi` 的外部代码需要更新
- `AiRuntimeApi.registerBusiness()` 方法被移除，统一使用 `registerModule()`
- `AiHostBusinessRuntime.getBusinessRegistrationData?()` 可选方法被移除

## 验证计划
- 运行 `npx vue-tsc --noEmit -p packages/spark-ai/tsconfig.json` 确认 0 错误
- 检查 `IBusinessRegistration` 在 spark-ai 包内无残留引用

## 风险项
- 如果仓库外有其他包依赖 `IBusinessRegistration` 等类型，会导致外部编译失败 — 需用户确认
- `app-ai-businesses.ts` 中的 `ModuleBackedBusinessRuntime` 基类使用了 `object` 类型委托，删除 `getBusinessRegistrationData` 后不影响编译（方法为可选调用）
