# DI 系统改进实施计划

> 📅 计划制定：2026年2月9日  
> 🎯 目标：按优先级逐步实施 DI 系统改进  
> ⏱️ 预计周期：2-3 个迭代（4-6 周）

---

## 📊 实施概览

### 阶段划分

```
阶段 1: 类型安全增强 (P0)     │ 2 周 │ ████████████░░░░░░░░
阶段 2: Symbol 统一管理 (P0)  │ 1 周 │ █████░░░░░░░░░░░░░
阶段 3: 测试覆盖提升 (P0)     │ 2 周 │ ████████████░░░░░░░░
阶段 4: 性能优化 (P1)         │ 1 周 │ █████░░░░░░░░░░░░░
```

**总工作量**: 约 30 人天  
**建议人员**: 1-2 名熟悉架构的开发者

---

## 🎯 阶段 1: 类型安全增强（P0 - 必须实施）

### 目标
实现类型映射表，消除 90% 的类型断言，提供编译时类型检查。

### 工作项

#### 1.1 定义能力接口类型（3 天）

**负责人**: 【待分配】  
**文件**: `packages/spark-utils/src/capability-types.ts`

**任务清单**:
- [ ] 创建 `capability-types.ts` 文件
- [ ] 定义 12 个核心能力接口（参考 `docs/examples/type-safe-di.ts`）
  - [ ] `AppServicesCapability`
  - [ ] `DataSourceCapability`
  - [ ] `DataSetStateCapability`
  - [ ] `GlobalDataCapability`
  - [ ] `PageServiceCapability`
  - [ ] `ApiClientCapability`
  - [ ] `FieldMetadataCapability`
  - [ ] `RowDataCapability`
  - [ ] `SelectionCapability`
  - [ ] `ValidationCapability`
  - [ ] `GridEventsCapability`
  - [ ] `RowEventsCapability`
- [ ] 添加完整的 JSDoc 注释（提供者、消费者、使用示例）
- [ ] 编写单元测试验证接口定义

**验收标准**:
- ✅ 所有接口都有完整的 JSDoc
- ✅ 接口定义符合现有使用场景
- ✅ 测试覆盖所有接口

---

#### 1.2 创建类型映射表（1 天）

**负责人**: 【待分配】  
**文件**: `packages/spark-utils/src/capability-symbols.ts`

**任务清单**:
- [ ] 在 `capability-symbols.ts` 中导入能力接口类型
- [ ] 定义 `CapabilityTypeMap` 接口
- [ ] 为每个 Symbol 建立类型映射
- [ ] 导出 `CapabilityTypeMap` 供外部使用

**代码示例**:
```typescript
// packages/spark-utils/src/capability-symbols.ts
import type {
  AppServicesCapability,
  SelectionCapability,
  // ... 其他接口
} from './capability-types'

export const APP_SERVICES = Symbol.for('spark:capability:app-services')
export const SELECTION = Symbol.for('spark:capability:selection')
// ... 其他 Symbol

export interface CapabilityTypeMap {
  [APP_SERVICES]: AppServicesCapability
  [SELECTION]: SelectionCapability
  // ... 其他映射
}
```

**验收标准**:
- ✅ 所有 Symbol 都有类型映射
- ✅ 类型系统编译通过

---

#### 1.3 扩展 provide/consume 签名（2 天）

**负责人**: 【待分配】  
**文件**: `packages/spark-component/src/composables/useSparkComponent.ts`

**任务清单**:
- [ ] 导入 `CapabilityTypeMap`
- [ ] 为 `provide()` 添加泛型重载
- [ ] 为 `consume()` 添加泛型重载
- [ ] 为 `use()` 添加泛型重载
- [ ] 为 `whenAvailable()` 添加泛型重载
- [ ] 保持向后兼容（字符串 capability name）
- [ ] 更新 JSDoc 和使用示例

**代码示例**:
```typescript
// 泛型重载（新）
function provide<K extends keyof CapabilityTypeMap>(
  name: K,
  implementation: CapabilityTypeMap[K]
): void

// 字符串回退（向后兼容）
function provide(
  name: string | symbol,
  implementation?: Record<string, unknown>
): void

// 实现（保持不变）
function provide(name: string | symbol, implementation?: any): void {
  // ... 现有实现
}
```

**验收标准**:
- ✅ 使用 Symbol 时自动推导类型
- ✅ 使用字符串时保持原有行为
- ✅ 所有现有测试通过
- ✅ 添加新的类型安全测试

---

#### 1.4 迁移现有代码（3 天）

**负责人**: 【待分配】  
**文件**: 所有使用 `provide/consume` 的组件

**任务清单**:
- [ ] 识别所有使用类型断言的地方（grep `as unknown`）
- [ ] 逐个迁移到类型安全 API
- [ ] 移除不必要的类型断言
- [ ] 验证编译和运行时行为

**迁移示例**:
```typescript
// Before (需要类型断言)
provide(APP_SERVICES, {
  router: { /* ... */ },
  logger: { /* ... */ }
} as Record<string, unknown>) // ❌ 类型断言

const appServices = consume(APP_SERVICES)
const router = (appServices as AppServicesCapability | null)?.router // ❌ 类型断言

// After (类型安全)
provide(APP_SERVICES, {
  router: { /* ... */ },
  logger: { /* ... */ }
}) // ✅ 自动类型检查

const appServices = consume(APP_SERVICES) // ✅ 类型: AppServicesCapability | null
const router = appServices?.router // ✅ 类型推导
```

**验收标准**:
- ✅ 移除至少 90% 的类型断言
- ✅ 所有测试通过
- ✅ TypeScript 编译无错误

---

### 阶段 1 里程碑

**完成标准**:
- ✅ 12 个能力接口定义完成
- ✅ 类型映射表建立
- ✅ provide/consume API 支持类型推导
- ✅ 迁移核心组件（UserGrid, UserRow, UserField）
- ✅ 类型断言减少 90% 以上
- ✅ 所有测试通过
- ✅ 文档更新

**交付物**:
- 源代码提交
- 类型定义文档
- 迁移指南
- 更新后的 API 文档

---

## 🗂️ 阶段 2: Symbol 统一管理（P0 - 必须实施）

### 目标
集中管理所有 Symbol 定义，建立命名规范，避免冲突。

### 工作项

#### 2.1 整理现有 Symbol（1 天）

**负责人**: 【待分配】  
**文件**: 各包的 constants/symbols 文件

**任务清单**:
- [ ] 扫描所有包，收集 Symbol 定义
  - [ ] `spark-utils/capability-symbols.ts` - 12 个
  - [ ] `spark-component/core/types.ts` - 3 个
  - [ ] `spark-app/constants/index.ts` - 5 个
- [ ] 分类整理 Symbol
  - [ ] 能力系统: `spark:capability:*`
  - [ ] DI 基础设施: `spark:di:*`
  - [ ] 生命周期: `spark:lifecycle:*`
- [ ] 检查是否有重复或冲突

**交付物**:
- Symbol 清单 Excel/Markdown
- 分类方案

---

#### 2.2 建立命名规范（0.5 天）

**负责人**: 【待分配】  
**文件**: `docs/Symbol_Naming_Convention.md`

**任务清单**:
- [ ] 制定命名规范文档
  - [ ] 格式: `spark:category:capability-name`
  - [ ] 分类体系
  - [ ] 命名示例
- [ ] 提交团队评审

**规范示例**:
```typescript
// ✅ 推荐命名
export const DATA_SOURCE = Symbol.for('spark:capability:data-source')
export const SPARK_REGISTRY = Symbol.for('spark:di:registry')
export const BEFORE_MOUNT = Symbol.for('spark:lifecycle:before-mount')

// ❌ 不推荐命名
export const dataSource = Symbol.for('data-source') // 缺少命名空间
export const DATA_SOURCE = Symbol('data-source')    // 不使用 for（无法跨模块共享）
```

---

#### 2.3 迁移和统一 Symbol（2 天）

**负责人**: 【待分配】  
**文件**: `packages/spark-utils/src/symbols/index.ts`（新建）

**任务清单**:
- [ ] 创建统一的 Symbol 定义文件
- [ ] 将分散的 Symbol 迁移到 `spark-utils`
- [ ] 按照命名规范重命名
- [ ] 更新所有引用
- [ ] 标记旧 Symbol 为 deprecated

**文件结构**:
```
packages/spark-utils/src/symbols/
├── index.ts                 // 统一导出
├── capability-symbols.ts    // 能力系统 Symbol
├── di-symbols.ts            // DI 基础设施 Symbol
└── lifecycle-symbols.ts     // 生命周期 Symbol
```

---

#### 2.4 创建 Symbol 索引文档（1 天）

**负责人**: 【待分配】  
**文件**: `docs/Symbol_Index.md`

**任务清单**:
- [ ] 生成完整的 Symbol 索引表
- [ ] 包含：名称、用途、提供者、消费者、示例
- [ ] 建立自动化生成脚本（可选）

**文档格式**:
```markdown
## Symbol 索引

| Symbol | 分类 | 用途 | 提供者 | 消费者 | 示例 |
|--------|------|------|--------|--------|------|
| APP_SERVICES | capability | 应用服务 | PageRenderer | 组件 | [链接] |
| SELECTION | capability | 选择管理 | Grid | Row/Field | [链接] |
| ... | ... | ... | ... | ... | ... |
```

---

### 阶段 2 里程碑

**完成标准**:
- ✅ 所有 Symbol 集中到 `spark-utils`
- ✅ 命名规范建立并执行
- ✅ Symbol 索引文档完成
- ✅ 所有代码迁移完成
- ✅ 测试通过

---

## 🧪 阶段 3: 测试覆盖提升（P0 - 必须实施）

### 目标
补充集成测试，提升 DI 系统的稳定性和可维护性。

### 工作项

#### 3.1 编写能力接口测试（2 天）

**负责人**: 【待分配】  
**文件**: `tests/capability-interfaces.test.ts`（新建）

**任务清单**:
- [ ] 测试每个能力接口的契约
- [ ] 验证接口方法签名
- [ ] 测试边界情况

---

#### 3.2 编写组件集成测试（4 天）

**负责人**: 【待分配】  
**文件**: 
- `tests/UserGrid-integration.test.ts`
- `tests/UserRow-integration.test.ts`
- `tests/UserField-integration.test.ts`

**任务清单**:
- [ ] 测试 UserGrid → UserRow → UserField DI 链路
- [ ] 测试能力提供和消费
- [ ] 测试延迟绑定
- [ ] 测试错误场景（能力缺失、类型不匹配）

**测试模板参考**: `docs/examples/di-integration-tests.ts`

---

#### 3.3 编写性能测试（1 天）

**负责人**: 【待分配】  
**文件**: `tests/capability-performance.test.ts`（新建）

**任务清单**:
- [ ] 测试大量 Provider 场景（100+ providers）
- [ ] 测试深层嵌套场景（10+ 层）
- [ ] 测试高频查询场景（1000+ lookups）
- [ ] 建立性能基准

---

#### 3.4 提升测试覆盖率（2 天）

**负责人**: 【待分配】

**任务清单**:
- [ ] 运行覆盖率报告
- [ ] 补充未覆盖的代码路径
- [ ] 目标：能力系统覆盖率 > 90%

---

### 阶段 3 里程碑

**完成标准**:
- ✅ 20+ 个新测试用例
- ✅ 测试覆盖率 > 90%
- ✅ 所有测试通过
- ✅ 性能基准建立

---

## ⚡ 阶段 4: 性能优化（P1 - 建议实施）

### 目标
优化关键路径性能，减少内存泄漏风险。

### 工作项

#### 4.1 实现 Context Chain 缓存（1 天）

**负责人**: 【待分配】  
**文件**: `packages/spark-component/src/composables/useSparkComponent.ts`

**任务清单**:
- [ ] 在 `ComponentContext` 添加 `_cachedContextChain` 字段
- [ ] 实现 `getContextChain()` 缓存逻辑
- [ ] 更新 `getInheritedProvider()` 使用缓存
- [ ] 添加缓存失效机制（parent 变化时）
- [ ] 性能对比测试

**预期提升**: 深层嵌套场景 3-5 倍

---

#### 4.2 实现 providerListeners 自动清理（0.5 天）

**负责人**: 【待分配】  
**文件**: `packages/spark-component/src/capability/CapabilityManager.ts`

**任务清单**:
- [ ] 在 Provider 注册后清理监听器
- [ ] 添加内存泄漏检测测试
- [ ] 验证清理逻辑正确性

---

#### 4.3 性能监控和日志（1 天）

**负责人**: 【待分配】

**任务清单**:
- [ ] 添加能力查询性能日志（可选，开发模式）
- [ ] 统计热路径调用次数
- [ ] 识别性能瓶颈

---

### 阶段 4 里程碑

**完成标准**:
- ✅ Context Chain 缓存实现
- ✅ providerListeners 自动清理
- ✅ 性能提升验证
- ✅ 无内存泄漏

---

## 📋 检查清单（Checklist）

### 代码质量
- [ ] 所有代码通过 ESLint 检查
- [ ] 所有代码通过 TypeScript 编译
- [ ] 所有测试通过
- [ ] 测试覆盖率 > 90%
- [ ] 性能回归测试通过

### 文档
- [ ] API 文档更新
- [ ] 迁移指南完成
- [ ] Symbol 索引完成
- [ ] 使用示例更新
- [ ] CHANGELOG 更新

### 评审
- [ ] 代码评审通过
- [ ] 架构评审通过
- [ ] 性能评审通过

### 部署
- [ ] 分支合并到 main
- [ ] 版本号更新
- [ ] 发布说明编写

---

## 🚧 风险管理

### 风险 1: 类型映射表维护成本
**风险等级**: 🟡 中  
**描述**: 每次新增能力都需要更新类型映射表  
**缓解措施**: 
- 建立 PR 模板，新增能力时检查类型定义
- 编写 lint 规则自动检查

### 风险 2: 向后兼容性破坏
**风险等级**: 🔴 高  
**描述**: 改动可能影响现有代码  
**缓解措施**:
- 保持字符串 capability name 支持
- 渐进式迁移，不强制升级
- 充分测试

### 风险 3: 性能回归
**风险等级**: 🟡 中  
**描述**: 泛型重载可能影响性能  
**缓解措施**:
- 性能基准测试
- 关键路径性能对比

---

## 📊 进度跟踪

### 每周报告模板

```markdown
# DI 系统改进 - 第 X 周进度报告

## 完成情况
- ✅ 任务 1
- ✅ 任务 2
- 🔄 任务 3（进行中）

## 遇到的问题
- 问题 1: 描述
  - 解决方案: ...

## 下周计划
- [ ] 任务 4
- [ ] 任务 5

## 风险预警
- 无 / 【风险描述】
```

---

## 🎯 最终交付物

### 代码
- ✅ 类型安全的 provide/consume API
- ✅ 统一的 Symbol 管理
- ✅ 完整的测试套件
- ✅ 性能优化实现

### 文档
- ✅ DI 架构分析报告
- ✅ Symbol 索引文档
- ✅ 命名规范文档
- ✅ 迁移指南
- ✅ 使用示例

### 指标
- ✅ 类型断言减少 90%
- ✅ 测试覆盖率 > 90%
- ✅ 性能提升 3-5 倍（深层嵌套场景）
- ✅ 零内存泄漏

---

## 📞 联系方式

**项目负责人**: 【待分配】  
**技术顾问**: 【待分配】  
**每周例会**: 【每周一 10:00】

---

**文档版本**: v1.0  
**最后更新**: 2026年2月9日
