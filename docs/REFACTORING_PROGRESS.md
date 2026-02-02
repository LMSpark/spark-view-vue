# SPARK 项目重构进度

> 日期：2026-02-02
> 目标：严格 TypeScript + SOLID 原则 + 上下游依赖管理

## ✅ 已完成

### 1. TypeScript 严格模式加强

#### 1.1 tsconfig 配置优化
- ✅ **根目录 tsconfig.json**: 已启用严格模式
  - `strict: true`
  - `strictNullChecks: true`
  - `noImplicitAny: true`
  - `noUncheckedIndexedAccess: true`
  - `noImplicitReturns: true`

- ✅ **packages/spark-page-config/tsconfig.json**: 新增严格检查
  ```json
  {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
  ```

- ✅ **packages/spark-renderer/tsconfig.json**: 新增严格检查（同上）

- ✅ **packages/spark-app/tsconfig.json**: 已配置严格模式

- ✅ **packages/spark-core/tsconfig.json**: 已配置严格模式

#### 1.2 类型安全修复

**L1 (spark-app) - 基础设施层**
- ✅ `BootstrapOptions`: 
  - `app: any` → `app: import('vue').App`
  - `router: any` → `router: import('vue-router').Router`
- ✅ `BootstrapEvent.data`: `any` → `Record<string, unknown>`
- ✅ `loadConfig()`: 返回类型 `any` → `AppConfig`
- ✅ `defaultAuthenticate()`: 参数类型 `any` → `AppConfig`

**L2 (spark-page-config) - 业务编排层**
- ✅ `RouteConfig.meta[key]`: `any` → `unknown`
- ✅ `RuleConfig`:
  - `props?: Record<string, any>` → `Record<string, unknown>`
  - `style?: Record<string, any>` → `Record<string, string | number>`
  - `[key: string]: any` → `[key: string]: unknown`
- ✅ `PageDataConfig`: `interface` → `type Record<string, unknown>`
- ✅ `DynamicRouterOptions`:
  - `router: any` → `import('vue-router').Router`
  - `pageComponent?: any` → `import('vue').Component`
- ✅ `DynamicRouter.pageComponent`: `any` → `Component`
- ✅ `setupDynamicRoutes()`: 参数类型修复

**L3 (spark-renderer) - 模型层**
- ✅ `Rule`:
  - `props?: Record<string, any>` → `Record<string, unknown>`
  - `style?: Record<string, any>` → `Record<string, string | number>`
  - `[key: string]: any` → `[key: string]: unknown>`
- ✅ `FormCreateAPI`:
  - `formData()`: 返回 `Record<string, unknown>`
  - `setValue()`: 参数 `value: any` → `value: unknown`
  - `el()`: 返回 `any` → `HTMLElement | null`
  - `[key: string]: any` → `[key: string]: unknown`

### 2. SSR 兼容性加强

已在上一轮完成，所有浏览器 API 调用都已添加 SSR 保护：
- ✅ `window.*` - 19 处保护
- ✅ `document.*` - 10 处保护  
- ✅ `localStorage.*` - 3 处保护
- ✅ `navigator.*` - 1 处保护

### 3. 日志系统统一

已在上一轮完成：
- ✅ spark-core: 所有 console 替换为 Logger()
- ✅ spark-app: 使用 L1 Logger
- ✅ spark-page-config: 使用 L1 Logger
- ✅ spark-renderer: 使用 L1 Logger

## ⏳ 进行中

### 4. 类型安全修复（续）

仍需处理的 `any` 类型：
- `packages/spark-renderer/src/utils/createSandbox.ts:121` - `__formApi__?: any`
- `packages/spark-renderer/src/utils/bindRules.ts:84-85` - dataSet, formApi
- `packages/spark-renderer/src/composables/useScriptSandbox.ts:25` - 函数签名
- `packages/spark-app/src/constants/index.ts:400` - storage value
- 测试文件中的 any 类型（优先级较低）

### 5. TypeScript 错误修复

需要修复的 tsc 错误：
- ❌ `bootstrap/index.ts:68` - Router 作为 Plugin 类型不匹配
- ❌ `context/AppContext.ts:33` - readonly array 兼容性
- ❌ `error/handler.ts:144-156` - 组件类型定义不完整
- ❌ 包之间的导入路径问题（rootDir 配置）

## 📋 待完成

### 6. SOLID 原则审计

#### L1 (spark-app) - 基础设施层
- [ ] 单一职责检查
  - Logger 职责是否单一？
  - ErrorHandler 是否职责过重？
  - Bootstrap 流程是否可拆分？
- [ ] 开闭原则检查
  - 配置加载是否可扩展？
  - 错误处理策略是否可扩展？
- [ ] 接口隔离检查
  - AppContext 接口是否过大？
  - RouterGuardOptions 是否合理？

#### L2 (spark-page-config) - 业务编排层
- [ ] 单一职责检查
  - ConfigLoader 职责是否单一？
  - DynamicRouter 是否职责过重？
- [ ] 依赖倒置检查
  - 是否依赖具体实现？
  - 是否通过接口交互？

#### L3 (spark-renderer) - 模型层
- [ ] 单一职责检查
  - PageRenderer 职责是否过重？
  - bindRules 是否应拆分？
- [ ] 开闭原则检查
  - 数据绑定逻辑是否可扩展？

#### L4-L6 (spark-core) - 组件核心
- [ ] 能力系统设计审计
- [ ] Provider/Consumer 模式检查
- [ ] 组件注册机制审计

### 7. 上下游依赖检查

**重点：上游只提供能力和事件，不能直接操作下游**

#### 依赖关系审计
- [ ] L1 → L2/L3 依赖检查
  - ❌ L1 不应直接导入 L2/L3 的类
  - ✅ L1 应通过事件/回调与 L2/L3 通信
- [ ] L2 → L3 依赖检查  
  - ❌ L2 不应直接操作 L3 的实例
  - ✅ L2 应通过配置/事件与 L3 通信
- [ ] L4-L6 独立性检查
  - ✅ spark-core 应完全独立
  - ✅ 不应依赖 L1-L3

#### 事件机制设计
- [ ] 定义 L1 事件接口
  - AppBootstrapEvent
  - AppLifecycleEvent
  - AppErrorEvent
- [ ] 定义 L2 事件接口
  - ConfigLoadEvent
  - RouteRegisterEvent
- [ ] 定义 L3 事件接口
  - PageRenderEvent
  - DataBindEvent

### 8. 文档完善
- [ ] 创建 ARCHITECTURE_PRINCIPLES.md
- [ ] 创建 TYPE_SAFETY_GUIDE.md
- [ ] 更新 SPARK_ARCHITECTURE.md
- [ ] 创建 DEPENDENCY_RULES.md

### 9. 测试验证
- [ ] 运行 `pnpm run typecheck` - 修复所有错误
- [ ] 运行 `pnpm run test` - 确保测试通过
- [ ] 运行 `pnpm run lint` - 修复代码风格问题

## 🎯 优先级

1. **HIGH**: 修复 TypeScript 编译错误
2. **HIGH**: 完成剩余的 any 类型替换
3. **MEDIUM**: SOLID 原则审计（L1-L3）
4. **MEDIUM**: 上下游依赖检查
5. **LOW**: 文档完善

## 📊 进度统计

- TypeScript 严格模式: 80% ✅
- SSR 兼容性: 100% ✅
- 日志系统: 100% ✅
- 类型安全: 60% ⏳
- SOLID 审计: 0% 📋
- 依赖管理: 0% 📋

## 🔍 发现的问题

### 架构问题
1. **L1 依赖问题**: bootstrap 中 `app.use(router)` 直接使用 Router 实例，应该使用 Plugin 模式
2. **类型不一致**: AppContext 中 roles 使用 readonly array，导致类型不兼容
3. **包结构问题**: tsconfig rootDir 配置导致跨包引用失败

### 设计问题
1. **职责不清**: ErrorHandler 中混合了错误捕获、展示、上报等多个职责
2. **耦合过重**: PageRenderer 直接操作 DataSet、FormAPI、Router 等多个依赖
3. **缺少抽象**: 很多地方使用 any 类型，缺少明确的接口定义

## 💡 改进建议

### 短期（本次重构）
1. 修复所有 TypeScript 编译错误
2. 替换关键路径上的 any 类型
3. 添加关键接口的类型定义
4. 检查 L1-L3 之间的直接依赖

### 中期（下次迭代）
1. 重构 ErrorHandler，拆分职责
2. 重构 PageRenderer，使用依赖注入
3. 设计完整的事件系统
4. 添加架构守卫（linter rules）

### 长期（持续优化）
1. 完整的 E2E 类型安全
2. 零 any 类型（除了必要的类型擦除）
3. 完整的架构文档
4. 自动化架构合规检查

---

**最后更新**: 2026-02-02  
**当前阶段**: 类型安全修复  
**下一步骤**: 修复 TypeScript 编译错误
