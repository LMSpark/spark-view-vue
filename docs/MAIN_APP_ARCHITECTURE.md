# 主应用架构说明

## 📁 项目结构

```
src/
├── App.vue                    # 主应用组件
├── main.ts                    # 应用入口（使用 SPARK 6层架构）
├── env.d.ts                   # 环境类型声明
├── style.css                  # 全局样式
├── types/                     # 类型定义
│   ├── ej2-components.ts     # Syncfusion EJ2 组件类型
│   └── shims-external.d.ts   # 外部库类型声明
└── views/                     # 视图组件
    └── DynamicPage.vue       # 动态页面渲染组件
```

## 🏗️ 架构说明

主应用完全基于 SPARK 6层架构包系统：

### L1 - 基础设施层 (@spark-view/spark-app)
- ✅ 应用启动 (SparkApp.bootstrap)
- ✅ 日志系统 (pageLogger)
- ✅ 错误处理
- ✅ 路由守卫
- ✅ 应用上下文管理

### L2 - 业务编排层 (@spark-view/spark-page-config)
- ✅ 配置加载 (ConfigLoader)
- ✅ 动态路由 (DynamicRouter)
- ✅ 路由配置验证

### L3 - 模型层 (@spark-view/spark-renderer)
- ✅ 页面渲染 (PageRenderer)
- ✅ 数据绑定
- ✅ 脚本沙箱
- ✅ 样式作用域

### L4-L6 - 组件核心 (@spark-view/spark-core)
- ✅ 组件管理
- ✅ 能力系统
- ✅ 插件机制

## 🚀 启动流程

```typescript
// main.ts
async function initApp() {
  // 1. 创建 Vue 应用和路由
  const app = createApp(App)
  const router = createRouter({ ... })
  
  // 2. 注册第三方库
  app.use(ElementPlus)
  app.use(VXETable)
  app.use(formCreate)
  
  // 3. 初始化 SPARK 核心 (L4-L6)
  const sparkManager = Spark.createComponentManager()
  const sparkRegistry = Spark.createComponentRegistry()
  app.use(Spark.createVuePlugin({ manager, registry }))
  
  // 4. 创建配置加载器 (L2)
  const configLoader = SparkPageConfig.createConfigLoader({
    basePath: '/pages-config',
    enableCache: true
  })
  
  // 5. 创建动态路由管理器 (L2)
  const dynamicRouter = SparkPageConfig.createDynamicRouter({
    router,
    configLoader,
    pageComponent: DynamicPage
  })
  
  // 6. 注册动态路由
  await dynamicRouter.registerRoutes()
  
  // 7. Bootstrap 启动 (L1)
  await SparkApp.bootstrap({
    app,
    router,
    config: appConfig
  })
}
```

## ✅ 已清理的冗余内容

以下内容已被包项目替代并删除：

### 删除的文件/文件夹
- ❌ `src/router/` - 被 L2 的 DynamicRouter 替代
- ❌ `src/services/` - 被 L2 的 ConfigLoader 替代
- ❌ `src/utils/logger.ts` - 被 L1 的 Logger 替代
- ❌ `src/utils/logger-examples.ts` - 示例文件
- ❌ `src/utils/README_LOGGER.md` - 文档
- ❌ `src/types/page.ts` - 被 L2 的类型定义替代
- ❌ `src/types/index.ts` - 统一导出（不再需要）

### 替换的导入
```typescript
// ❌ 旧的导入
import { getPageConfig } from '../services/page-config'
import { logger, pageLogger } from '@/utils/logger'
import type { PageRule } from '../types'

// ✅ 新的导入
import { SparkPageConfig, pageLogger } from '@spark-view/spark-page-config'
import type { RuleConfig } from '@spark-view/spark-page-config'
```

## 📦 依赖包说明

### 核心依赖
- `@spark-view/spark-app` - L1 基础设施
- `@spark-view/spark-page-config` - L2 配置管理
- `@spark-view/spark-renderer` - L3 渲染引擎
- `@spark-view/spark-core` - L4-L6 组件核心
- `@spark-view/spark-data` - 数据管理（DataSet、TreeManager）

### UI 框架
- `vue` - Vue 3
- `vue-router` - 路由
- `element-plus` - UI 组件库
- `@form-create/element-ui` - 动态表单
- `vxe-table` - 高性能表格

## 🎯 设计原则

1. **依赖倒置**: 上游不依赖下游实现
   - ✅ L1 不导入 L2/L3
   - ✅ L2 不导入 L3
   - ✅ L4-L6 完全独立

2. **单一职责**: 每个包职责明确
   - L1: 基础设施（日志、错误、启动）
   - L2: 业务编排（配置、路由）
   - L3: 模型渲染（页面、数据）
   - L4-L6: 组件核心（能力、注册、渲染）

3. **开闭原则**: 通过接口和事件扩展
   - 使用回调函数（beforeMount、afterMount）
   - 使用依赖注入（pageComponent、configLoader）
   - 使用事件机制（onRouteRegistered）

## 📝 注意事项

1. **不考虑向后兼容**: 项目已完全重构为新架构
2. **统一使用包 API**: 所有功能都通过包提供
3. **类型安全**: 使用包提供的类型定义
4. **SSR 兼容**: 所有浏览器 API 都有 SSR 保护

## 🔄 迁移指南

如果需要添加新功能：

1. **添加工具函数** → 添加到对应的包
   - 基础工具 → @spark-view/spark-app
   - 配置相关 → @spark-view/spark-page-config
   - 渲染相关 → @spark-view/spark-renderer

2. **添加类型定义** → 添加到对应包的 types/
   - 不要在主应用 src/types 添加新类型

3. **添加组件** → 使用 SPARK 组件系统
   - 注册到 SparkComponentRegistry
   - 实现 Capability 接口

---

**最后更新**: 2026-02-02  
**架构版本**: 2.0.0  
**重构状态**: ✅ 完成
