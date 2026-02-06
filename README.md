# SPARK View

>  现代化的 Vue 3 低代码组件系统，支持动态配置、能力扩展和类型安全

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3.5-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)](https://vitejs.dev/)

##  特性

-  **类型安全** - 完整的 TypeScript 支持，0 类型错误
-  **模块化架构** - 独立包设计，按需引入
-  **能力系统** - 组件间松耦合通信，支持延迟绑定
-  **插件机制** - 灵活的扩展点和生命周期钩子
-  **动态加载** - 支持组件按需加载，优化首屏性能
-  **配置驱动** - JSON 配置即可搭建页面
-  **权限控制** - 内置权限系统，支持字段级权限
-  **数据管理** - 完整的 DataSet 和 TreeManager
-  **依赖注入** - 支持测试隔离，遵循 SOLID 原则

##  包结构

```
packages/
 spark-app/          # 应用基础设施
 spark-component/    # 组件核心系统
 spark-data/         # 数据管理
 spark-page-config/  # 页面配置
 spark-renderer/     # 页面渲染器
 spark-utils/        # 工具函数
```

##  快速开始

```ash
# 安装依赖
pnpm install

# 开发模式
pnpm run dev

# 构建生产版本
pnpm run build

# 类型检查
pnpm run typecheck

# 代码检查
pnpm run lint

# 运行测试
pnpm run test
```

##  核心概念

### 能力系统

```	ypescript
// 提供能力
provide('selection', {
  select: (id) => { /* ... */ },
  isSelected: (id) => { /* ... */ }
})

// 消费能力
const selection = consume('selection')
selection?.select(123)
```

### 数据管理

```	ypescript
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'users',
  tables: { /* ... */ }
})
```

### 组件注册

```	ypescript
Spark.register({
  type: 'my-component',
  name: 'MyComponent',
  loader: () => import('./MyComponent.vue')
})
```

##  文档

- [能力系统指南](docs/guides/CAPABILITY_PROVISION.md)
- [组件开发指南](docs/guides/COMPONENT_DEVELOPMENT.md)
- [数据管理指南](docs/guides/DATA_MANAGEMENT.md)- [测试最佳实践](docs/guides/TESTING_BEST_PRACTICES.md) 🆕- [API 参考](docs/guides/API_REFERENCE.md)
- [完整文档索引](docs/README.md)

##  质量保证

-  **Lint**: 0 errors, 0 warnings
-  **TypeCheck**: 0 errors
-  **Tests**: 45/45 passed
-  **Type Safety**: 完整的类型定义
-  **Recent Update**: 依赖注入架构，支持测试隔离（详见[测试指南](docs/guides/TESTING_BEST_PRACTICES.md)）

##  技术栈

- Vue 3.5 + TypeScript 5.8
- Vite 6.0 + pnpm
- Vitest + @vue/test-utils
- ESLint + vue-tsc
- Syncfusion EJ2

##  许可证

[MIT](LICENSE)

---

**SPARK View** - 构建下一代低代码应用 