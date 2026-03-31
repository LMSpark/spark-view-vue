# SPARK View

> 基于 Vue 3 的企业级低代码组件系统，支持类型安全、能力驱动和动态配置

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)](https://vitejs.dev/)

## ✨ 核心特性

- **🔒 类型安全** - 完整的 TypeScript 支持，严格的类型检查，零类型错误
- **🏗️ 模块化架构** - 基于 pnpm workspace 的独立包设计，按需引入
- **🔗 能力系统** - 基于 Symbol 的组件间松耦合通信，支持延迟绑定和依赖注入
- **🔌 插件机制** - 灵活的扩展点，支持 Element Plus、VxeTable 等第三方库集成
- **⚡ 动态加载** - 支持组件按需加载，基于 `import.meta.glob` 的代码分割优化
- **📄 配置驱动** - JSON 配置即可搭建复杂页面，支持页面级配置系统
- **🛡️ 权限控制** - 内置字段级权限系统，支持数据访问控制
- **📊 数据管理** - 完整的 DataSet 和 TreeManager，支持关系数据和依赖分析
- **🧪 测试友好** - 支持测试隔离，遵循 SOLID 原则的依赖注入架构

## 📦 包结构

```
packages/
├── spark-app/           # 🏗️ 应用层基础设施（路由、认证、配置、插件系统）
├── spark-component/     # ⚙️ 组件核心系统（注册表、能力管理、上下文、页面渲染器）
├── spark-data/          # 📊 数据空间（DataSet、TreeManager、关系引擎）
├── spark-page-config/   # 📄 页面配置系统（配置加载、路由集成）
└── spark-utils/         # 🛠️ 共享工具（Logger、HTTP 客户端、类型定义）
```

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（支持热重载）
pnpm run dev

# 构建生产版本
pnpm run build

# 类型检查（严格模式）
pnpm run typecheck

# 代码质量检查
pnpm run lint

# 运行测试套件
pnpm run test
```

## 📖 核心概念

### 组件系统

SPARK 采用声明式组件注册，支持三种注册方式：

```typescript
import { Spark } from '@spark-view/spark-component'

// 1. 直接注册（同步加载）
import MyComponent from './MyComponent.vue'
Spark.register('my-component', MyComponent)

// 2. 动态导入（代码分割）
Spark.register('my-detail', () => import('./MyDetail.vue'))

// 3. 路径注册（批量管理）
const register = Spark.createRegister(import.meta.glob('./*.vue'))
register.registerAll({
  'r-table':   './data-components/RendererTable.vue',
  'r-form':    './data-components/RendererForm.vue'
})
```

### 运行时自动注册

对于希望在运行时扫描组件的场景，或者不使用 Vite 智能模式的项目，
可以调用 `setupAutoRegister` 来自动注册全局组件。该函数现在位于
`@spark-view/spark-app` 包中，并支持配置扫描模式和排除规则：

```ts
import { setupAutoRegister } from '@spark-view/spark-app'

await setupAutoRegister(app, {
  patterns: ['./src/components/**/*.vue'],
  exclude: ['**/demo/**']
})
```

### 能力系统

基于 Symbol 的松耦合通信机制：

```typescript
import { defineCapability } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'

// 定义能力
const GRID_SELECTION = defineCapability<SelectionApi>('grid-selection')

// 提供能力
const { provide } = useSparkComponent({ type: 'data-grid' })
provide(GRID_SELECTION, {
  getSelectedRows: () => selectedRows,
  onSelectionChange: (callback) => { /* ... */ }
})

// 消费能力
const { consume } = useSparkComponent({ type: 'action-bar' })
const selection = consume(GRID_SELECTION)
if (selection) {
  selection.onSelectionChange(handleSelection)
}
```

### 数据管理

完整的客户端数据空间：

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'UserManagement',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string' }
      ],
      rows: []
    }
  },
  relations: [
    { from: 'Users', to: 'Roles', type: 'many-to-many' }
  ]
})

// 数据操作
await dataSet.loadTable('Users')
const users = dataSet.getTable('Users').getRows()
```

### 应用启动

声明式应用配置：

```typescript
import { SparkApp } from '@spark-view/spark-app'

await SparkApp.start({
  // 路由配置
  router: {
    mode: 'history',
    base: '/',
    routes: [
      { path: '/', component: 'page-home' },
      { path: '/users', component: 'page-users' }
    ]
  },

  // 插件配置
  plugins: {
    'element-plus': true,
    'vxe-table': { enabled: true, options: { size: 'large' } }
  },

  // 页面配置
  pageConfig: {
    source: 'hybrid',
    apiBaseUrl: '/api',
    localPrefix: '/config'
  }
})
```

## 📚 文档导航

- [🏗️ 架构设计](docs/architecture/DATAFLOW_ARCHITECTURE.md) - 完整的数据流和分层架构
- [🤖 AI 文档体系](docs/ai/README.md) - 提示词 + AI 架构设计的统一入口
- [⚙️ 组件开发](docs/guides/COMPONENT_DEVELOPMENT.md) - 组件注册和能力系统
- [📊 数据管理](docs/guides/DATA_MANAGEMENT.md) - DataSet 和 TreeManager 使用
- [🌲 树能力总览](docs/guides/TREE_CAPABILITY.md) - 树容器、DataView、TreeManager、导航树 API 与零代码动作
- [🔌 插件配置](docs/guides/PLUGIN_CONFIGURATION.md) - 第三方库集成
- [📄 配置系统](docs/guides/CONFIG_SYSTEM.md) - 多租户与远程配置
- [🚀 快速开始](docs/guides/QUICKSTART.md) - 5分钟上手指南

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！请确保：

1. 遵循现有的代码规范和 TypeScript 严格模式
2. 添加相应的测试用例
3. 更新相关文档
4. 提交前运行 `pnpm run typecheck && pnpm run lint && pnpm run test`
5. 提交信息遵循 Conventional Commits（由 Husky + commitlint 强制校验），格式示例：`feat(spark-data): add X`。
   - 允许的 scope：`deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-component`, `spark-utils`, `spark-page-config`。
   - 详情与示例见 `CONTRIBUTING.md`（新增）。

## 📄 许可证

[MIT License](LICENSE)

---

**SPARK View** - 构建下一代低代码应用