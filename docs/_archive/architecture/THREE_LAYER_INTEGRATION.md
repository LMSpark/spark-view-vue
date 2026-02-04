# SPARK 三层架构集成完成总览

## 概述

SPARK 6层架构中的前三层（L1、L2、L3）已完成包化和集成对接，形成清晰的依赖关系和统一的基础设施。

## 架构层级

```
┌────────────────────────────────────────────────────────────┐
│ L1: Application Layer (@spark-view/spark-app)              │
│ 应用基础设施层                                               │
│ - AppContext (用户、租户、环境)                              │
│ - Logger 系统 (appLogger, pageLogger, routerLogger)         │
│ - Constants (ErrorCodes, LogLevels, DefaultConfig, etc.)   │
│ - Bootstrap (初始化流水线)                                   │
│ - Router Guards (路由守卫)                                   │
│ - Error Handler (错误处理)                                   │
└────────────────────────────────────────────────────────────┘
                            ↓ 提供基础设施
┌────────────────────────────────────────────────────────────┐
│ L2: Business Orchestration (@spark-view/spark-page-config) │
│ 业务编排层                                                   │
│ - ConfigLoader (本地/远程/混合配置加载)                      │
│ - DynamicRouter (动态路由注册)                               │
│ - Validator (配置验证)                                       │
│ ✅ 使用 L1: pageLogger, routerLogger, ErrorCodes           │
└────────────────────────────────────────────────────────────┘
                            ↓ 提供配置加载
┌────────────────────────────────────────────────────────────┐
│ L3: Model Layer (@spark-view/spark-renderer)               │
│ 页面渲染层                                                   │
│ - PageRenderer (页面渲染引擎)                                │
│ - usePageDataSet (DataSet 管理)                             │
│ - useScriptSandbox (脚本沙箱)                                │
│ - useRuleBinding (数据和事件绑定)                            │
│ - useCssScope (CSS 隔离)                                     │
│ ✅ 使用 L1: pageLogger, ErrorCodes                         │
│ ✅ 使用 L2: ConfigLoader                                   │
└────────────────────────────────────────────────────────────┘
                            ↓ 使用组件
┌────────────────────────────────────────────────────────────┐
│ L4-L6: Components (@spark-view/spark-core)                 │
│ 组件层（已存在，暂未对接）                                     │
└────────────────────────────────────────────────────────────┘
```

## 各层职责

### L1: Application Layer (spark-app)

**核心职责**: 应用基础设施

**提供能力**:
- ✅ **AppContext**: 用户、租户、环境信息管理
- ✅ **Logger 系统**: 
  - `appLogger` - 应用级日志
  - `pageLogger` - 页面级日志
  - `routerLogger` - 路由级日志
  - 支持多 Transport、日志级别、格式化
- ✅ **Constants**: 
  - Symbol Keys (APP_CONTEXT_KEY, ROUTER_KEY, etc.)
  - ErrorCodes (1xxx-9xxx)
  - Environments (DEVELOPMENT, PRODUCTION, etc.)
  - LogLevels (DEBUG, INFO, WARN, ERROR, SUCCESS)
  - PermissionActions (VIEW, CREATE, UPDATE, DELETE)
  - DefaultConfig (REQUEST_TIMEOUT, PAGE_SIZE, etc.)
- ✅ **Bootstrap**: 初始化流水线
- ✅ **Router Guards**: 认证、权限、加载守卫
- ✅ **Error Handler**: 全局错误处理

**文件统计**: 48+ 文件

### L2: Business Orchestration (spark-page-config)

**核心职责**: 页面配置管理

**提供能力**:
- ✅ **ConfigLoader**: 
  - 支持本地/远程/混合模式
  - 配置缓存（内存）
  - 超时控制
  - 降级策略（远程→本地）
- ✅ **DynamicRouter**: 
  - 动态路由注册
  - 权限过滤（beforeRegister 钩子）
  - 路由刷新
- ✅ **Validator**: 配置验证

**对接 L1**:
- ✅ 使用 `pageLogger` 和 `routerLogger` 记录日志
- ✅ 使用 `ErrorCodes` 处理错误
- ✅ 使用 `DefaultConfig` 配置超时和缓存时间

**文件统计**: 12 文件

**集成文档**: `packages/spark-page-config/INTEGRATION.md`

### L3: Model Layer (spark-renderer)

**核心职责**: 页面渲染引擎

**提供能力**:
- ✅ **PageRenderer**: 
  - 配置化页面渲染
  - 生命周期钩子（beforeLoad, afterLoad）
  - 自定义插槽（loading, error, content）
- ✅ **DataSet 管理**: 
  - 页面级数据隔离
  - 主从表联动
  - 自动订阅
- ✅ **脚本沙箱**: 
  - 安全执行页面脚本
  - 全局上下文隔离
- ✅ **Rule 绑定**: 
  - 数据占位符替换
  - 事件处理器绑定
- ✅ **CSS 隔离**: 
  - 自动作用域前缀

**对接 L1**:
- ✅ 使用 `pageLogger` 记录所有渲染日志
- ✅ 使用 `ErrorCodes` 处理错误（CONFIG_INVALID, CONFIG_LOAD_FAILED）

**对接 L2**:
- ✅ 使用 `ConfigLoader.loadPageConfig()` 加载配置

**文件统计**: 14 文件

**集成文档**: `packages/spark-renderer/INTEGRATION.md`

## 日志系统集成

### Logger 架构

```
L1 Logger System
├── appLogger    [APP]    - 应用级日志（L1 使用）
├── pageLogger   [PAGE]   - 页面级日志（L2, L3 使用）
└── routerLogger [ROUTER] - 路由级日志（L2 使用）
```

### 日志格式

```
[PREFIX] LEVEL message { context }

示例:
[APP]    INFO  应用启动完成 { environment: "production", version: "1.0.0" }
[PAGE]   DEBUG 加载页面配置 { pageId: "home" }
[ROUTER] INFO  开始注册动态路由
```

### 日志级别

- `DEBUG` - 详细的调试信息
- `INFO` - 一般信息
- `WARN` - 警告信息
- `ERROR` - 错误信息
- `SUCCESS` - 成功信息

### 日志覆盖

#### L1 (spark-app)
- Bootstrap 初始化
- Router Guards 执行
- Error Handler 触发

#### L2 (spark-page-config)
- ConfigLoader: 配置加载、缓存、降级
- DynamicRouter: 路由注册、钩子执行

#### L3 (spark-renderer)
- PageRenderer: 页面加载全流程（15+ 步骤）
- DataSet: 初始化、订阅、数据变化
- Script: 加载、执行、函数调用
- Rules: 绑定、重新绑定

## 错误码系统

### ErrorCodes 定义 (L1)

```typescript
export const ErrorCodes = {
  // 认证 (1xxx)
  AUTH_REQUIRED: 1001,
  AUTH_TOKEN_EXPIRED: 1002,
  
  // 权限 (2xxx)
  PERMISSION_DENIED: 2001,
  
  // 网络 (3xxx)
  NETWORK_ERROR: 3001,
  NETWORK_TIMEOUT: 3002,
  NETWORK_REQUEST_FAILED: 3004,
  
  // 配置 (4xxx)
  CONFIG_LOAD_FAILED: 4001,
  CONFIG_INVALID: 4002,
  
  // 路由 (5xxx)
  ROUTE_NOT_FOUND: 5001,
  ROUTE_INVALID: 5002,
  
  // 数据 (6xxx)
  DATA_LOAD_FAILED: 6001,
  
  // ...
}
```

### ErrorCodes 使用

#### L2 使用场景
- `CONFIG_LOAD_FAILED`: 配置加载失败
- `NETWORK_TIMEOUT`: 网络请求超时
- `NETWORK_REQUEST_FAILED`: 网络请求失败
- `ROUTE_INVALID`: 路由无效

#### L3 使用场景
- `CONFIG_INVALID`: 无法确定页面ID、未提供 configLoader
- `CONFIG_LOAD_FAILED`: 配置加载失败

## 配置常量系统

### DefaultConfig (L1)

```typescript
export const DefaultConfig = {
  REQUEST_TIMEOUT: 10000,        // 请求超时（毫秒）
  PAGE_SIZE: 20,                 // 默认分页大小
  CONFIG_CACHE_EXPIRY: 300000    // 配置缓存过期时间（5分钟）
}
```

### 使用场景

#### L2 使用
```typescript
const DEFAULT_OPTIONS = {
  timeout: DefaultConfig.REQUEST_TIMEOUT,
  cacheExpiry: DefaultConfig.CONFIG_CACHE_EXPIRY
}
```

## 数据流

### 页面加载流程

```
1. 用户访问 URL
   ↓
2. [L2] DynamicRouter 匹配路由
   [ROUTER] INFO  开始注册动态路由
   ↓
3. [L3] PageRenderer 挂载
   [PAGE] INFO  开始加载页面 { pageId, route }
   ↓
4. [L2] ConfigLoader 加载配置
   [PAGE] DEBUG 从 configLoader 加载配置 { pageId }
   [PAGE] DEBUG 发送远程请求 { url }
   [PAGE] SUCCESS 页面配置加载成功 { pageId }
   ↓
5. [L3] 初始化 DataSet
   [PAGE] DEBUG 初始化 DataSet { pageId }
   [PAGE] DEBUG DataSet 初始化成功 { tables }
   ↓
6. [L3] 加载页面脚本
   [PAGE] DEBUG 加载页面脚本 { pageId }
   [PAGE] DEBUG 页面脚本加载成功 { pageId, functions }
   ↓
7. [L3] 绑定 Rules
   [PAGE] DEBUG 绑定 rules { pageId, rulesCount }
   ↓
8. [L3] 渲染完成
   [PAGE] SUCCESS 页面渲染完成 { pageId }
```

## 文件统计

### 总计
- **L1 (spark-app)**: 48+ 文件
- **L2 (spark-page-config)**: 12 文件
- **L3 (spark-renderer)**: 14 文件
- **总计**: 74+ 文件

### 日志记录
- **L1**: 20+ 条日志
- **L2**: 30+ 条日志
- **L3**: 26+ 条日志
- **总计**: 76+ 条日志记录

### 文档
- **L1**: 
  - `README.md` - 主文档
  - `constants/README.md` - 符号常量文档
- **L2**: 
  - `README.md` - 主文档
  - `INTEGRATION.md` - 对接 L1 集成文档
  - `IMPLEMENTATION_SUMMARY.md` - 实现总结
- **L3**: 
  - `README.md` - 主文档
  - `INTEGRATION.md` - 对接 L1/L2 集成文档
  - `IMPLEMENTATION_SUMMARY.md` - 实现总结

## 集成优势

### 1. 统一的日志系统
- 所有层级使用相同的 Logger API
- 日志格式统一：`[PREFIX] LEVEL message { context }`
- 可集中配置日志级别和输出
- 完整的操作追踪

### 2. 统一的错误码
- 标准化错误消息
- 便于错误追踪和处理
- 多语言支持（通过 getErrorMessage）

### 3. 清晰的职责边界
- L1: 基础设施
- L2: 配置管理
- L3: 页面渲染
- 各层职责明确，避免越权

### 4. 单向依赖关系
```
L3 → L2 → L1
```
- 避免循环依赖
- 便于独立测试
- 便于版本升级

### 5. 可追溯性强
- 每个操作都有日志
- 日志包含完整上下文
- 便于问题排查

### 6. 可维护性高
- 包化管理，边界清晰
- 文档完善
- 集成文档详细

## 下一步工作

### 短期（已完成 ✅）
- ✅ L1 包创建和基础设施完善
- ✅ L2 对接 L1
- ✅ L3 对接 L1 和 L2
- ✅ 文档完善

### 中期（进行中 🔄）
- [ ] 主应用集成新包架构
- [ ] 替换现有 DynamicPage.vue
- [ ] 完善单元测试
- [ ] 错误边界优化

### 长期（待规划 📋）
- [ ] L4-L6 组件层对接
- [ ] 性能监控集成
- [ ] 日志持久化和分析
- [ ] 错误上报和追踪
- [ ] 自动化测试覆盖

## 总结

SPARK 三层架构集成已完成，形成了清晰的依赖关系：

1. **L1 (spark-app)** 提供基础设施（Logger、Constants、Context）
2. **L2 (spark-page-config)** 使用 L1 能力，提供配置加载和动态路由
3. **L3 (spark-renderer)** 使用 L1 和 L2 能力，提供页面渲染引擎

三层之间通过统一的 Logger 和 ErrorCodes 形成完整的可追溯体系，为后续主应用集成和 L4-L6 对接打下坚实基础。
