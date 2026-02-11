# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### 💥 Breaking Changes - 统一网络请求层

**目标：** 完全迁移到 Request 类，删除 HttpClient

#### 删除

- ❌ **HttpClient 类和工厂函数**
  - `HttpClient` 类
  - `createHttpClient()` 工厂函数
  - `packages/spark-utils/src/http/HttpClient.ts` 文件
  - `packages/spark-utils/src/http/` 目录

#### 移动

- 📦 **IApiContext 类型定义**
  - 从：`@spark-view/spark-utils`
  - 到：`@spark-view/spark-data`
  - 原因：现在由 ApiAdapter 使用

#### 变更

- 🔄 **ApiAdapter 重构**
  - 构造函数：从双参数 `(client, context)` 改为单参数 `(context)`
  - 内部实现：使用 Request 类代替 HttpClient
  - 自动配置：认证和租户拦截器自动添加

#### 新增

- ✅ **Request 类（统一请求层）**
  - 拦截器系统：请求/响应双向拦截
  - 自动重试：支持配置重试次数和延迟
  - 内置缓存：GET 请求自动缓存
  - 超时控制：基于 AbortController
  - 9 个预设拦截器：认证、租户、日志、错误处理等

- ✅ **RequestInterceptors 预设库**
  - 请求拦截器：`createAuthInterceptor`, `createTenantInterceptor`, `createRequestLogInterceptor`, `createTimestampInterceptor`, `createHeadersInterceptor`
  - 响应拦截器：`createStandardApiInterceptor`, `createResponseLogInterceptor`, `createErrorTransformInterceptor`, `createRedirectInterceptor`

- ✅ **完整文档**
  - `REQUEST_GUIDE.md` - 使用指南
  - `MIGRATION.md` - 迁移指南
  - `Request.example.ts` - 12 个使用示例

#### 迁移指南

详见 [MIGRATION.md](./packages/spark-utils/MIGRATION.md)

**快速迁移示例：**

```typescript
// ❌ 旧代码
import { createHttpClient } from '@spark-view/spark-utils'
const client = createHttpClient({ baseURL: '/api', token: 'xxx' })
const users = await client.get<User[]>('/users')

// ✅ 新代码
import { createRequest, createAuthInterceptor } from '@spark-view/spark-utils'
const request = createRequest({ baseURL: '/api' })
request.interceptors.request.use(createAuthInterceptor(() => 'xxx'))
const users = await request.get<User[]>('/users')
```

**影响范围：**
- `@spark-view/spark-utils` - 导出变更
- `@spark-view/spark-data` - ApiAdapter 重构，IApiContext 移入

## [0.3.0] - 2026-02-09

### Breaking Changes - DI 架构统一

**目标：** 统一到单一 DI 管道（SPARK 能力系统），删除冗余的 Vue 原生 DI

**删除的 Symbol 常量（5 个）：**
- `APP_CONTEXT_KEY`
- `ROUTER_KEY`
- `LOGGER_KEY`
- `CONFIG_LOADER_KEY`
- `AUTH_SERVICE_KEY`

**删除的 Composable 函数（10 个）：**
- `useAppRouter()` → 使用 `useRouter()` from vue-router
- `useLogger()` → 使用 `Logger('module')` from @spark-view/spark-utils
- `useAppContext()` → 使用 `consume(APP_SERVICES)`
- `useAuth()` → 使用 `consume(APP_SERVICES).auth`
- `usePermissions()` → 使用 `consume(APP_SERVICES)` + 自定义逻辑
- `useCurrentUser()` → 使用 `consume(APP_SERVICES)?.auth?.getCurrentUser()`
- `useCurrentTenant()` → 使用 `consume(APP_SERVICES)?.auth?.getCurrentTenant()`
- `tryUseAuth()` → 使用 `consume(APP_SERVICES)` (已支持 undefined 返回)
- `tryUseAppContext()` → 使用 `consume(APP_SERVICES)` (已支持 undefined 返回)
- `useConfigLoader()` → 使用 `consume(APP_SERVICES).configLoader`

**保留的核心基础设施（3 个）：**
- `SPARK_REGISTRY_KEY` - 组件注册表（Vue DI）
- `SPARK_PARENT_CONTEXT_KEY` - 父上下文引用
- `CAPABILITY_MANAGER_KEY` - 能力管理器

**新增能力系统组件：**
- `capability-types.ts` - 集中定义所有能力接口
- `DataSetCapabilityManager` 重构 - 支持 Logger、parentContext、injectIntoContext()
- 新增 79 tests 验证（16 test files）

**文档更新：**
- 统一 DI 架构说明到 `.github/copilot-instructions.md`
- 更新 `packages/spark-app/README.md` - 移除废弃 API 说明
- 更新 `docs/guides/USE_COMPOSABLES.md` - 简化为推荐用法指南
- 修正 API 命名：`createVuePlugin` → `createPlugin` (11 处)
- 更新测试统计：45 → 79 tests (16 files)

**迁移指南：**
```typescript
// ❌ 旧方式（已删除）
import { useAppRouter, useLogger, useAuth } from '@spark-view/spark-app'
const router = useAppRouter()
const logger = useLogger()
const auth = useAuth()

// ✅ 新方式（推荐）
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const router = useRouter()
const logger = Logger('MyComponent')
const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)
```

**验证结果：**
- ✅ 79 tests passed (16 test files)
- ✅ Type check passed
- ✅ Lint check passed

## [0.2.0] - 2026-02-06

### Refactor - 代码清理与优化（7轮）

**目标：** 移除冗余代码，优化 API 设计，完善文档质量

**第一轮清理（~1000行）：**
- 删除 `packages/spark-app/src/events/AppEventBus.ts` - 完全未使用的事件总线系统
- 删除 `packages/spark-app/src/logger/README.md` - 子目录重复文档
- 删除 `packages/spark-app/src/constants/README.md` - 子目录重复文档  
- 删除 `packages/spark-app/src/environment/` - SSR 兼容层（SPA 不需要）
- 从 bootstrap 中移除对 DI 容器的依赖
- 新增 `simpleEnv.ts` 替代复杂的环境检测模块

**第二轮清理（~238行）：**
- 删除 `docs/guides/AUTO_IMPORT.md` - 描述未实现的 unplugin 配置
- 标记 DI 容器为 `@deprecated`，推荐使用 Composables API

**第三轮清理（~346行）：**
- 删除 `packages/spark-app/src/di/container.ts` - 完全移除依赖注入容器（314行）
- 删除 `provideAppContext()` - 未使用的包装函数
- 从 `index.ts` 移除 15+ 个废弃的导出
- 项目全面采用 Vue 3 Composables 模式

**第四轮优化（API 清理）：**
- 从公共 API 移除 6 个内部使用的函数导出
  * `useAppContextOptional`, `hasPermission`, `hasAnyPermission`
  * `hasAllPermissions`, `hasRole`, `hasAnyRole`
- 为所有内部函数添加 `@internal` 和 `@deprecated` JSDoc 标记
- 推荐使用 `usePermissions()` composable 替代旧的工具函数
- 更清晰的 API 边界，引导最佳实践

**第五轮优化（类型和文档）：**
- 优化 `simpleEnv.ts` 类型定义
  * 新增 `EnvironmentInfo` 接口替代内联类型
  * 添加详细 JSDoc 注释，提升 IDE 体验
- 为 7 个内部使用常量添加 `@internal` 标记
  * `BootstrapPhases`, `LogLevels`, `PermissionActions`
  * `ResourceTypes`, `StorageKeys`, `AppEvents`, `ConfigSources`
- 明确区分公共 API 和内部实现
- 减少开发者接触到的 API 表面积

**第六轮优化（文档完善）：**
- 重写 `packages/spark-app/README.md`
  * 移除已废弃的 API 示例（ConfigManager, createAuthGuard 等）
  * 更新为实际可用的 API（SparkApp.start, authService, Composables）
  * 添加完整的 Composables 使用示例
  * 新增 API 概览表格和类型定义参考
  * 新增最佳实践和迁移指南
- 确保文档与代码完全同步
- 所有示例代码可直接复制使用

**第七轮优化（API 示例修复）：**
- 修复 `packages/spark-utils/README.md`
  * Logger.create() → Logger(context)
  * Logger.consoleTransport() → createConsoleTransport()
  * Capability.create() → 使用正确的类型导入
  * PermissionChecker/Filter/FieldRenderHelper.create() → create* 函数
- 修复 `packages/spark-page-config/README.md`
  * new ConfigLoader() → createConfigLoader()
  * registerDynamicRoutes → setupDynamicRoutes
  * validatePageConfig → validateRouteConfig/validateRuleConfig
- 确保所有示例代码与实际导出 API 完全匹配

**清理成果：**
- 删除代码：~1584 行
- 删除模块：6 个
- 简化 API：移除 21+ 个导出（第三轮 15 个 + 第四轮 6 个）
- 标记内部 API：14 个（7 个函数 + 7 个常量组）
- 类型优化：1 个接口提取
- 文档重写/修复：3 个 README（spark-app、spark-utils、spark-page-config）
- 减少认知负担，统一使用 Composables 模式

### Documentation
- 更新 `ASYNC_DATA_LOADING.md` 文档，添加 dataKey 绑定详细说明
- 更新 `ASYNC_DATA_QUICK_REF.md` 快速参考，补充文本绑定示例

## [0.1.0] - 2026-02-04

### Added
- 初始版本发布
- SPARK 组件系统核心功能
- 混合渲染系统（Vue 组件 + 配置页面）
- DataSet 数据管理
- 页面配置加载器
- 异步数据加载支持
