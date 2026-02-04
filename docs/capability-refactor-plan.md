# 能力管理系统 - 现状分析与重构方案

## 一、现状分析

### 1.1 当前实现概览

**存在的能力系统实现：**

1. **spark-utils 包** (`packages/spark-utils/src/capability/`)
   - `types.ts` - 通用能力类型定义
   - `CapabilitySystem.ts` - 核心能力管理器和连接器
   - `EventCapability.ts` - 事件能力专项实现
   - `index.ts` - 统一导出

2. **spark-component 包** (`packages/spark-component/src/`)
   - `utils/SparkCapabilitySystem.ts` - Spark 专用能力管理（旧实现）
   - `capabilities/EventCapability.ts` - 事件能力实现（与 utils 重复）
   - `composables/useSparkComponent.ts` - 组件能力访问接口

### 1.2 核心类型对比

#### spark-utils 类型（通用）
```typescript
interface CapabilityProvider<TInterface, TImpl> {
  name: string
  version: string
  interface: TInterface
  implementation?: TImpl
  description?: string
}

interface CapabilityConsumer<TInterface, TImpl> {
  capabilityName: string
  minVersion?: string
  interface: TInterface
  implementation?: TImpl
}

interface CapabilityContext {
  id: string
  type: string
  parent?: CapabilityContext
  children: CapabilityContext[]
  providers: Set<CapabilityProvider>
  consumers: Map<string, CapabilityConsumer>
  providerListeners?: Map<string, Set<(provider: CapabilityProvider) => void>>
}
```

#### spark-component 类型（旧）
```typescript
// 来自 types/common.ts
export interface CapabilityProvider {
  name: string
  version?: string
  interface?: CapabilityInterface
  implementation?: Implementation
}

export interface CapabilityConsumer {
  capabilityName: string
  interface?: CapabilityInterface
  implementation?: Implementation
  minVersion?: string
  onProvide?: (provider: CapabilityProvider) => void
}
```

### 1.3 连接器实现对比

#### spark-utils 连接器（新）
- `DataFlowConnector` - 数据流连接（addListener/onData）
- `EventConnector` - 事件连接（addEventListener/onEvent）
- `MethodConnector` - 方法连接（直接绑定）
- `EventCapabilityConnector` - 事件能力专用连接器

#### spark-component 连接器（旧）
- `DataFlowConnector` - 基本实现
- `EventConnector` - 基本实现
- `MethodConnector` - 基本实现
- `EventCapabilityConnector` - 与 utils 完全重复

### 1.4 发现的问题

**🔴 重大问题：**

1. **代码重复**
   - `EventCapabilityConnector` 在两个包中完全重复实现
   - 连接器逻辑在 `spark-utils` 和 `spark-component` 中各有一套
   - 类型定义不统一，字段差异（如 `interface` 字段必需性）

2. **架构不清晰**
   - `spark-utils` 是通用基础设施，但未被充分使用
   - `spark-component` 有自己的旧实现，与 utils 并存
   - 职责边界模糊，维护困难

3. **类型不一致**
   - `version` 字段：utils 中必需，component 中可选
   - `interface` 字段：utils 中必需，component 中可选
   - `onProvide` 回调：仅 component 中存在

4. **缺少按级别的能力定义**
   - 虽然定义了按级别分类的能力类型（`capability-levels.ts`）
   - 但实际实现中未使用这些分类
   - 没有与组件层级（模型级/实例级/字段级）关联

5. **沙箱能力未实现**
   - 定义了沙箱相关能力接口
   - 但没有实际的管理器和连接器实现

## 二、重构目标

### 2.1 架构目标

```
┌─────────────────────────────────────────────────────┐
│  应用层 (App)                                        │
│  - 应用级能力管理器                                   │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  DataSet + Sandbox (页面上下文层)                     │
│  - 页面级能力管理器                                   │
│  - 提供：dataSetState, globalData, apiClient         │
│  - 沙箱：componentControl, sandboxContext            │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  组件层 (Component Layer)                            │
│  - 组件级能力管理器                                   │
│  - 模型级：dataSource, selectionManager...           │
│  - 实例级：dataBinding, instancePermission...        │
│  - 字段级：fieldRenderer, fieldEvents                │
└─────────────────────────────────────────────────────┘
```

### 2.2 统一能力系统

**核心原则：**
1. **单一来源** - 所有能力基础设施从 `spark-utils` 提供
2. **分层管理** - 不同层级有独立的管理器实例
3. **类型统一** - 统一使用 `spark-utils` 的类型定义
4. **按级别分类** - 能力定义按组件级别组织

### 2.3 重构范围

**Phase 1: 统一基础设施**
- ✅ 删除 `spark-component` 中重复的连接器实现
- ✅ 统一使用 `spark-utils` 的能力类型
- ✅ 更新所有导入路径

**Phase 2: 实现分层能力管理**
- ✅ 实现 DataSet 层能力管理器
- ✅ 实现 Sandbox 能力管理器
- ✅ 实现组件层能力管理器（按级别）
- ✅ 建立层级间能力访问机制

**Phase 3: 集成按级别能力**
- ✅ 将 `capability-levels.ts` 中定义的能力集成到实现中
- ✅ 为每个级别的能力提供专用连接器
- ✅ 实现能力的层级流动和访问控制

**Phase 4: 沙箱能力实现**
- ✅ 实现 `componentControl` 能力
- ✅ 实现 `sandboxContext` 能力
- ✅ 集成到沙箱执行环境

## 三、重构方案

### 3.1 统一类型定义

**目标：** 所有包使用 `spark-utils` 的类型定义

```typescript
// packages/spark-utils/src/capability/types.ts

/**
 * 能力提供者（统一版本）
 */
export interface CapabilityProvider<TInterface = unknown, TImpl = unknown> {
  name: string
  version: string                 // 必需，遵循语义化版本
  interface: TInterface           // 必需，明确接口定义
  implementation?: TImpl          // 可选，具体实现
  description?: string
  metadata?: Record<string, unknown>
}

/**
 * 能力消费者（统一版本）
 */
export interface CapabilityConsumer<TInterface = unknown, TImpl = unknown> {
  capabilityName: string
  minVersion?: string             // 最小版本要求
  interface: TInterface           // 必需，明确期望接口
  implementation?: TImpl          // 可选，消费者自己的实现
  required?: boolean              // 是否必需（默认 true）
  onProvide?: (provider: CapabilityProvider) => void  // 延迟绑定回调
}

/**
 * 能力上下文（通用）
 */
export interface CapabilityContext {
  id: string
  type: string                    // 'app' | 'dataset' | 'sandbox' | 'component'
  level?: string                  // 'model' | 'instance' | 'field' (组件层专用)
  parent?: CapabilityContext
  children: CapabilityContext[]
  providers: Set<CapabilityProvider>
  consumers: Map<string, CapabilityConsumer>
  providerListeners?: Map<string, Set<(provider: CapabilityProvider) => void>>
}
```

### 3.2 移除重复实现

**删除文件：**
- ❌ `packages/spark-component/src/utils/SparkCapabilitySystem.ts`
- ❌ `packages/spark-component/src/capabilities/EventCapability.ts`

**保留文件：**
- ✅ `packages/spark-utils/src/capability/*` - 所有通用实现

**更新导入：**
```typescript
// 所有 spark-component 中的导入统一改为
import {
  CapabilityProvider,
  CapabilityConsumer,
  CapabilityContext,
  CapabilityConnector,
  CapabilityManager,
  EventCapabilityConnector,
  createEventCapabilityProvider,
  createEventCapabilityConsumer
} from '@spark-view/spark-utils'
```

### 3.3 分层能力管理器

#### 3.3.1 DataSet 能力管理器

```typescript
// packages/spark-data/src/capability/DataSetCapabilityManager.ts

import { CapabilityManager } from '@spark-view/spark-utils'
import type { CapabilityContext } from '@spark-view/spark-utils'

/**
 * DataSet 能力管理器
 * 管理页面级数据和服务能力
 */
export class DataSetCapabilityManager extends CapabilityManager {
  private dataSetContext: CapabilityContext

  constructor(pageId: string) {
    super()
    this.dataSetContext = {
      id: `dataset:${pageId}`,
      type: 'dataset',
      parent: undefined,
      children: [],
      providers: new Set(),
      consumers: new Map(),
      providerListeners: new Map()
    }
    
    // 注册 DataSet 层能力
    this.registerDataSetCapabilities()
  }

  private registerDataSetCapabilities() {
    // 注册 dataSetState, globalData, pageService, apiClient
  }

  getContext(): CapabilityContext {
    return this.dataSetContext
  }
}
```

#### 3.3.2 Sandbox 能力管理器

```typescript
// packages/spark-component/src/sandbox/SandboxCapabilityManager.ts

import { CapabilityManager } from '@spark-view/spark-utils'
import type { CapabilityContext } from '@spark-view/spark-utils'
import type { ISandboxInitConfig } from '../types/capability-levels'

/**
 * Sandbox 能力管理器
 * 管理业务脚本的能力访问
 */
export class SandboxCapabilityManager extends CapabilityManager {
  private sandboxContext: CapabilityContext
  private dataSetManager: DataSetCapabilityManager

  constructor(config: ISandboxInitConfig, dataSetManager: DataSetCapabilityManager) {
    super()
    this.dataSetManager = dataSetManager
    this.sandboxContext = {
      id: `sandbox:${config.pageId}`,
      type: 'sandbox',
      parent: dataSetManager.getContext(),
      children: [],
      providers: new Set(),
      consumers: new Map()
    }

    // 注册沙箱专用能力
    this.registerSandboxCapabilities(config)
  }

  private registerSandboxCapabilities(config: ISandboxInitConfig) {
    // 注册 componentControl, sandboxContext
    // 注入 logger
  }

  // 访问 DataSet 能力
  useDataSetCapability<T>(name: string): T | null {
    return this.dataSetManager.getProvider(
      this.dataSetManager.getContext(),
      name
    )?.implementation as T
  }
}
```

#### 3.3.3 组件能力管理器（增强）

```typescript
// packages/spark-component/src/capability/ComponentCapabilityManager.ts

import { CapabilityManager } from '@spark-view/spark-utils'
import type { ComponentContext } from '../types/spark-component'
import type { 
  ModelLevelCapabilities,
  InstanceLevelCapabilities,
  FieldLevelCapabilities 
} from '../types/capability-levels'

/**
 * 组件能力管理器
 * 根据组件级别管理不同的能力
 */
export class ComponentCapabilityManager extends CapabilityManager {
  
  /**
   * 为组件上下文注册级别相关的能力
   */
  registerLevelCapabilities(
    context: ComponentContext,
    level: 'model' | 'instance' | 'field'
  ) {
    switch (level) {
      case 'model':
        this.registerModelCapabilities(context)
        break
      case 'instance':
        this.registerInstanceCapabilities(context)
        break
      case 'field':
        this.registerFieldCapabilities(context)
        break
    }
  }

  private registerModelCapabilities(context: ComponentContext) {
    // 注册 dataSource, selectionManager, queryManager, batchOperator
  }

  private registerInstanceCapabilities(context: ComponentContext) {
    // 注册 dataBinding, instancePermission, formValidator, editState
  }

  private registerFieldCapabilities(context: ComponentContext) {
    // 注册 fieldRenderer, fieldEvents
  }

  /**
   * 访问上游能力（跨级）
   * 字段级可以直接访问 DataSet 能力
   */
  useUpstreamCapability<T>(
    context: ComponentContext,
    capabilityName: string
  ): T | null {
    // 沿着 parent 链查找能力
    let current: CapabilityContext | undefined = context
    while (current) {
      const provider = this.getProvider(current, capabilityName)
      if (provider) {
        return provider.implementation as T
      }
      current = current.parent
    }
    return null
  }
}
```

### 3.4 层级能力连接

```typescript
// packages/spark-component/src/capability/LevelCapabilityConnector.ts

import type { CapabilityConnector, CapabilityProvider, CapabilityConsumer } from '@spark-view/spark-utils'
import type { 
  DataSetCapabilities,
  ModelLevelCapabilities,
  InstanceLevelCapabilities,
  FieldLevelCapabilities 
} from '../types/capability-levels'

/**
 * 按级别的能力连接器
 * 根据能力类型选择合适的连接方式
 */
export class LevelCapabilityConnector implements CapabilityConnector {
  
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean {
    const capabilityType = this.getCapabilityType(provider.name)
    
    switch (capabilityType) {
      case 'dataset':
        return this.connectDataSetCapability(provider, consumer)
      case 'model':
        return this.connectModelCapability(provider, consumer)
      case 'instance':
        return this.connectInstanceCapability(provider, consumer)
      case 'field':
        return this.connectFieldCapability(provider, consumer)
      default:
        return false
    }
  }

  private getCapabilityType(name: string): 'dataset' | 'model' | 'instance' | 'field' | 'unknown' {
    // 根据能力名称判断类型
    const dataSetCaps = ['dataSetState', 'globalData', 'pageService', 'apiClient']
    const modelCaps = ['dataSource', 'selectionManager', 'queryManager', 'batchOperator']
    const instanceCaps = ['dataBinding', 'instancePermission', 'formValidator', 'editState']
    const fieldCaps = ['fieldRenderer', 'fieldEvents']
    
    if (dataSetCaps.includes(name)) return 'dataset'
    if (modelCaps.includes(name)) return 'model'
    if (instanceCaps.includes(name)) return 'instance'
    if (fieldCaps.includes(name)) return 'field'
    return 'unknown'
  }

  // ... 各级别专用连接方法
}
```

### 3.5 实施步骤

#### Step 1: 准备阶段（不破坏现有功能）
1. ✅ 创建 `capability-refactor-plan.md`（本文档）
2. ✅ 审查所有能力相关代码
3. ✅ 标记待删除和待更新的文件

#### Step 2: 类型统一
1. 更新 `spark-component/src/types/common.ts`
2. 删除本地能力类型定义
3. 导入并重导出 `spark-utils` 类型
4. 确保向后兼容

#### Step 3: 移除重复实现
1. 删除 `SparkCapabilitySystem.ts`
2. 删除 `spark-component/capabilities/EventCapability.ts`
3. 更新所有导入路径
4. 运行测试确保功能正常

#### Step 4: 实现分层管理
1. 创建 `DataSetCapabilityManager`
2. 创建 `SandboxCapabilityManager`
3. 增强 `ComponentCapabilityManager`
4. 实现层级能力访问

#### Step 5: 集成按级别能力
1. 实现 `LevelCapabilityConnector`
2. 为每个级别注册对应能力
3. 实现跨级能力访问

#### Step 6: 测试与验证
1. 单元测试覆盖所有连接器
2. 集成测试验证层级交互
3. 性能测试确保无退化

## 四、风险与缓解

### 4.1 风险识别

**🔴 高风险**
- 类型不兼容导致大量编译错误
- 现有组件能力访问失效
- 性能下降

**🟡 中风险**
- 测试用例需要大量更新
- 文档需要同步更新
- 学习曲线

### 4.2 缓解措施

1. **渐进式重构** - 分阶段实施，每步保证功能正常
2. **类型适配层** - 提供临时的类型转换函数
3. **完整测试** - 每个阶段都有对应测试
4. **文档先行** - 先更新文档再改代码

## 五、成功标准

### 5.1 功能标准
- ✅ 所有现有能力功能正常工作
- ✅ 新增分层能力管理功能
- ✅ 沙箱能力完整实现
- ✅ 跨级能力访问正常

### 5.2 代码标准
- ✅ 无重复代码
- ✅ 类型统一且安全
- ✅ 架构清晰易维护
- ✅ 测试覆盖率 > 80%

### 5.3 文档标准
- ✅ API 文档更新完整
- ✅ 架构文档准确反映实现
- ✅ 示例代码可运行
- ✅ 迁移指南完整

## 六、时间规划

- **Phase 1**: 2-3 天（类型统一 + 移除重复）
- **Phase 2**: 3-4 天（分层管理器实现）
- **Phase 3**: 2-3 天（按级别能力集成）
- **Phase 4**: 2-3 天（沙箱能力实现）
- **测试与文档**: 2-3 天

**总计：11-16 天**

---

## 附录：关键文件清单

### 需要修改的文件
- `packages/spark-component/src/types/common.ts` - 类型导入更新
- `packages/spark-component/src/composables/useSparkComponent.ts` - 导入路径更新
- `packages/spark-component/src/vue/createSparkComponent.ts` - 能力管理器替换

### 需要删除的文件
- `packages/spark-component/src/utils/SparkCapabilitySystem.ts`
- `packages/spark-component/src/capabilities/EventCapability.ts`

### 需要新建的文件
- `packages/spark-data/src/capability/DataSetCapabilityManager.ts`
- `packages/spark-component/src/sandbox/SandboxCapabilityManager.ts`
- `packages/spark-component/src/capability/ComponentCapabilityManager.ts`
- `packages/spark-component/src/capability/LevelCapabilityConnector.ts`
- `packages/spark-component/src/capability/index.ts` - 统一导出

### 保持不变的文件
- `packages/spark-utils/src/capability/*` - 通用基础设施
- `packages/spark-component/src/types/capability-levels.ts` - 能力分类定义
