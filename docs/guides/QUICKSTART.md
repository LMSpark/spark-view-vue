# SPARK 快速开始

> 先跑起来，再理解架构。这个指南优先帮你看到页面效果、配置入口和稳定运行时。

## 📋 前置要求

- **Node.js** >= 20.0.0
- **pnpm** >= 10.0.0
- **JDK** >= 17.0.0（仅完整开发模式需要）

## 🚀 安装和运行

```bash
# 1. 克隆项目
git clone https://github.com/LMSpark/spark-view-vue.git SPARK_VIEW
cd SPARK_VIEW

# 2. 安装依赖
pnpm install

# 3. 只启动前端示例
pnpm run dev:fe
```

访问 [http://localhost:5173](http://localhost:5173) 查看页面效果。

如果你要体验页面配置、AI 相关能力或 Java 后端接口，再启动完整开发模式：

```bash
pnpm run dev
```

- `pnpm run dev:fe`：只启动 Vite，适合先熟悉前端组件和页面渲染
- `pnpm run dev`：启动 Java 后端 + Vite，适合体验配置系统、SSE 调试链路和 AI 配置生成能力

## AI 能力的边界

- SPARK 的 AI 能力主要生成页面配置和最小化脚本，不以“生成任意代码工程”为目标
- 页面最终由稳定运行时解释执行，重点是可验证、可回滚、可维护，而不是自由度最大化

## 📌 推荐体验路径

1. 先运行 `pnpm run dev:fe`，确认前端页面能正常打开。
2. 在示例导航中优先体验这 3 个页面：`tree-demo`、`master-detail`、`permission-render`。
3. 再查看根目录 [README.md](../../README.md) 里的定位说明和文档导航。
4. 需要完整配置链路时，再切换到 `pnpm run dev`。

### 为什么先看这 3 个 demo

- `tree-demo`：最适合感受“页面引擎”而不是“组件拼装”
- `master-detail`：最适合理解零代码主从联动
- `permission-render`：最适合理解权限策略是如何进入渲染链的

## 🏗️ 项目结构

```
spark-view/
├── packages/                       # monorepo 工作区包
│   ├── spark-ai/                   # AI 运行时
│   ├── spark-app/                  # 应用层基础设施
│   ├── spark-component/            # 组件系统核心
│   ├── spark-data/                 # 数据管理
│   ├── spark-page-config/          # 页面配置加载
│   ├── spark-utils/                # 基础工具与能力键
│   ├── vite-plugin-spark-catalog/  # 构建期目录生成插件
│   └── vxe-table/                  # 表格插件工作区
├── src/                            # 根应用前端源码
├── spark-ai-server/                # Java 后端与页面配置存储
├── docs/                           # 文档
└── tests/                          # 根层测试
```

## 📖 核心概念

### 1. 组件注册

SPARK 支持三种组件注册方式：

```typescript
import { Spark } from '@spark-view/spark-component'
import MyGrid from './MyGrid.vue'

// 方式 1：直接注册（同步加载）
Spark.register('my-grid', MyGrid)

// 方式 2：动态导入（代码分割）
Spark.register('user-chart', () => import('./UserChart.vue'))

// 方式 3：批量注册（推荐）
const register = Spark.createRegister(import.meta.glob('./components/*.vue'))
register.registerAll({
  'data-table': './DataTable.vue',
  'user-form': './UserForm.vue',
  'dashboard': './Dashboard.vue'
})
```

### 2. 使用组件

```vue
<template>
  <div class="app">
    <!-- 使用 kebab-case 组件类型名 -->
    <spark-component type="my-grid" :config="gridConfig" />
    <spark-component type="user-chart" :config="chartConfig" />
  </div>
</template>

<script setup lang="ts">
const gridConfig = {
  type: 'my-grid',
  title: '用户数据',
  columns: ['name', 'email', 'role']
}

const chartConfig = {
  type: 'user-chart',
  dataSource: 'users',
  chartType: 'bar'
}
</script>
```

### 3. 能力系统

组件间的松耦合通信：

```typescript
// 定义能力
import { defineCapability } from '@spark-view/spark-utils'

export const GRID_SELECTION = defineCapability<SelectionApi>('grid-selection')

// 提供能力
const { sparkProvide } = useSparkComponent(props.config)
sparkProvide(GRID_SELECTION, {
  getSelectedRows: () => selectedRows.value,
  selectAll: () => { /* ... */ },
  clearSelection: () => selectedRows.value = []
})

// 消费能力
const { sparkConsume } = useSparkComponent(props.config)
const selection = sparkConsume(GRID_SELECTION)
```

### 4. 数据管理

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建数据集
const dataSet = SparkData.createDataSet({
  dataSetName: 'UserManagement',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string', nullable: false }
      ],
      rows: []
    }
  }
})

// 获取数据（通过 DataView）
const usersView = dataSet.getView('Users', 'default')
const users = usersView?.rows ?? []
```

## 🎯 创建你的第一个组件

### 步骤 1：创建组件文件

```vue
<!-- src/components/HelloWorld.vue -->
<template>
  <div class="hello-world">
    <h2>{{ config.title || 'Hello World' }}</h2>
    <p>计数: {{ count }}</p>
    <button @click="increment">+</button>
    <button @click="decrement">-</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'

interface HelloWorldConfig extends SparkNode {
  title?: string
  initialCount?: number
}

const props = defineProps<{
  config: HelloWorldConfig
}>()

const { logger } = useSparkComponent(props.config)

const count = ref(props.config.initialCount || 0)

const increment = () => {
  count.value++
  logger.info('Count incremented', { newValue: count.value })
}

const decrement = () => {
  count.value--
  logger.info('Count decremented', { newValue: count.value })
}
</script>

<style scoped>
.hello-world {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  text-align: center;
}

button {
  margin: 0 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #007acc;
  color: white;
  cursor: pointer;
}

button:hover {
  background: #005aa3;
}
</style>
```

### 步骤 2：注册组件

```typescript
// src/main.ts
import { Spark } from '@spark-view/spark-component'
import HelloWorld from './components/HelloWorld.vue'

// 注册组件
Spark.register('hello-world', HelloWorld)
```

### 步骤 3：在页面中使用

```vue
<!-- src/App.vue -->
<template>
  <div class="app">
    <h1>SPARK 快速开始</h1>

    <spark-component
      type="hello-world"
      :config="{
        title: '我的第一个 SPARK 组件',
        initialCount: 5
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { Spark } from '@spark-view/spark-component'
import HelloWorld from './components/HelloWorld.vue'

// 确保组件已注册
Spark.register('hello-world', HelloWorld)
</script>
```

## 🔧 应用配置

### 基础应用启动

```typescript
// src/main.ts
import { createApp } from 'vue'
import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'

const app = createApp(App)

// 启动 SPARK 应用
await SparkApp.start({
  // 路由配置
  router: {
    mode: 'history',
    routes: [
      { path: '/', component: 'page-home' },
      { path: '/users', component: 'page-users' }
    ]
  },

  // 页面配置
  pageConfig: {
    source: 'local',
    apiBaseUrl: '/api'
  }
})

app.mount('#app')
```

### 完整配置示例

```typescript
await SparkApp.start({
  // 路由配置
  router: {
    mode: 'history',
    base: '/',
    routes: [
      { path: '/', component: 'page-home' },
      { path: '/users', component: 'page-users' },
      { path: '/dashboard', component: 'page-dashboard' }
    ]
  },

  // 插件配置
  plugins: {
    'element-plus': true,
    'vxe-table': {
      enabled: true,
      options: { size: 'large' }
    }
  },

  // 页面配置系统
  pageConfig: {
    source: 'hybrid', // local | remote | hybrid
    apiBaseUrl: '/api',
    localPrefix: '/config',
    cacheEnabled: true
  },

  // 应用级配置
  app: {
    title: 'My SPARK App',
    theme: 'light',
    locale: 'zh-CN'
  }
})
```

## 📊 数据集成

### 创建数据模型

```typescript
// src/data/models.ts
import { SparkData } from '@spark-view/spark-data'

export const userDataSet = SparkData.createDataSet({
  dataSetName: 'UserManagement',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string', nullable: false },
        { name: 'role', type: 'string', defaultValue: 'user' }
      ],
      rows: [
        { id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin' },
        { id: 2, name: 'User', email: 'user@example.com', role: 'user' }
      ]
    }
  }
})
```

### 在组件中使用数据

```vue
<template>
  <div class="user-list">
    <h3>用户列表</h3>
    <div v-for="user in users" :key="user.id" class="user-item">
      <span>{{ user.name }}</span>
      <span>{{ user.email }}</span>
      <span class="role">{{ user.role }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { userDataSet } from '../data/models'

const props = defineProps<{
  config: SparkNode
}>()

const { logger } = useSparkComponent(props.config)

const users = ref<any[]>([])

onMounted(() => {
  try {
    const view = userDataSet.getView('Users', 'default')
    users.value = view?.rows ?? []
    logger.info('Users loaded', { count: users.value.length })
  } catch (error) {
    logger.error('Failed to load users', { error })
  }
})
</script>
```

## 🎨 添加样式和主题

### 全局样式

```css
/* src/style.css */
:root {
  --primary-color: #007acc;
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --warning-color: #ffc107;
  --info-color: #17a2b8;

  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --border-radius: 4px;
  --box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-family);
  background-color: #f8f9fa;
  color: #212529;
}

.spark-component {
  background: white;
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
}
```

### 主题支持

```typescript
// src/themes.ts
export const themes = {
  light: {
    background: '#ffffff',
    surface: '#f8f9fa',
    text: '#212529',
    textSecondary: '#6c757d',
    border: '#dee2e6'
  },
  dark: {
    background: '#1a1a1a',
    surface: '#2d3748',
    text: '#ffffff',
    textSecondary: '#a0aec0',
    border: '#4a5568'
  }
}

export type Theme = keyof typeof themes
```

## 🧪 运行测试

```bash
# 运行所有测试
pnpm run test

# 运行特定测试
pnpm run test -- -t "component"

# 类型检查
pnpm run typecheck

# 代码质量检查
pnpm run lint
```

## 📚 进阶学习

完成基础设置后，建议按以下顺序学习：

1. **[组件开发指南](COMPONENT_DEVELOPMENT.md)** - 深入了解组件系统和能力机制
2. **[数据管理指南](DATA_MANAGEMENT.md)** - 掌握 DataSet 和 TreeManager
3. **[树能力总览](TREE_CAPABILITY.md)** - 理解 r-tree、TreeManager、treeMode 与导航树 API
4. **[AI 文档体系](../ai/README.md)** - 提示词 + AI 架构设计的统一入口
6. **[插件配置](PLUGIN_CONFIGURATION.md)** - 集成第三方 UI 库
7. **[配置系统](CONFIG_SYSTEM.md)** - 多租户与远程配置
8. **[架构设计](https://github.com/your-org/spark-view/tree/main/docs/architecture)** - 理解系统设计理念

## 🆘 常见问题

### Q: 组件没有渲染？
A: 检查组件是否已正确注册，类型名是否使用 kebab-case。

### Q: 数据不更新？
A: 确保使用响应式数据，DataSet 的变更会自动触发更新。

### Q: 类型错误？
A: 运行 `pnpm run typecheck` 检查类型，确保使用正确的接口定义。

### Q: 性能问题？
A: 使用动态导入进行代码分割，避免一次性加载所有组件。

## 🎉 下一步

恭喜！你已经成功创建了第一个 SPARK 应用。现在你可以：

- 添加更多自定义组件
- 集成真实 API 数据
- 配置用户权限系统
- 部署到生产环境

加入我们的社区，分享你的经验和建议！

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const { provide, consume, logger } = useSparkComponent({
  type: 'my-grid'
})

// 应用层统一提供 APP_SERVICES.logger，组件侧只消费 logger
provide(APP_SERVICES, { router, logger: pageLogger })
</script>
```

### 3. 数据管理

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      rows: []
    }
  }
})

// 添加数据到默认视图
const table = dataSet.getTable('Users')
const view = table?.getOrCreateView('default')
if (view) {
  view.create({ id: 1, name: 'Alice' })
}

// 订阅视图变化（统一使用 events.on）
const usersView = dataSet.getView('Users', 'default')
usersView?.events.on('stateChanged', () => {
  console.log('用户数据已变化')
})
```

### 4. 页面渲染

```vue
<template>
  <PageRenderer :config="pageConfig" />
</template>

<script setup lang="ts">
import { SparkPageRenderer } from '@spark-view/spark-component'

const pageConfig = {
  pageId: 'home',
  layout: {
    type: 'container',
    children: [
      { type: 'r-table', id: 'userGrid', dataKey: 'Users@rows' }
    ]
  },
  dataSet: {
    tables: {
      Users: { columns: [...], rows: [...] }
    }
  }
}
</script>
```

## 项目结构

```
spark-view/
├── packages/
│   ├── spark-ai/                   # AI 运行时
│   ├── spark-app/                  # 应用基础设施
│   ├── spark-component/            # 组件系统
│   ├── spark-data/                 # 数据管理
│   ├── spark-page-config/          # 页面配置
│   ├── spark-utils/                # 工具函数
│   ├── vite-plugin-spark-catalog/  # 构建期目录生成
│   └── vxe-table/                  # 插件工作区
├── src/                            # 根应用源码
├── spark-ai-server/                # Java 后端
├── docs/                           # 文档
└── tests/                          # 测试
```

## 常用命令

```bash
# 开发
pnpm run dev              # 启动开发服务器
pnpm run build            # 构建生产版本

# 质量
pnpm run lint             # 代码检查
pnpm run typecheck        # 类型检查
pnpm run test             # 运行测试

# 包管理
pnpm -F <包名> run build  # 构建单个包
pnpm -F <包名> run test   # 测试单个包
```

## 下一步

- [组件开发指南](COMPONENT_DEVELOPMENT.md) - 创建自定义组件（含能力系统）
- [数据管理指南](DATA_MANAGEMENT.md) - DataSet、视图状态、CRUD

---

## 服务访问

### Router

```typescript
// 直接使用 vue-router
import { useRouter } from 'vue-router'
const router = useRouter()
router.push('/home')
```

### Logger

```typescript
// 使用 Logger 工厂函数
import { Logger } from '@spark-view/spark-utils'
const logger = Logger('MyComponent')
logger.info('初始化')
logger.error('出错了', error)
```

### APP_SERVICES（组件内）

```typescript
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const { sparkConsume } = useSparkComponent({ type: 'my-comp' })
const services = sparkConsume(APP_SERVICES)

services?.router?.push('/home')
services?.logger?.info('Action')
services?.auth?.isAuthenticated()
```

### Logger 提供方式（App.vue 中）

```vue
<script setup lang="ts">
import { createLogger } from '@spark-view/spark-app'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
import { useRouter } from 'vue-router'

const { sparkProvide } = useSparkComponent({ type: 'root' })
const appLogger = createLogger('App')
const router = useRouter()

sparkProvide(APP_SERVICES, {
  router: { push: (to) => router.push(to), replace: (to) => router.replace(to), back: () => router.back() },
  logger: appLogger
})
</script>
```

| 场景 | 推荐方式 |
|------|----------|
| 路由访问 | `useRouter()` from `vue-router` |
| 日志记录 | `Logger('module')` from `@spark-view/spark-utils` |
| 组件内服务 | `sparkConsume(APP_SERVICES)` |
| 组件注册表 | `useSparkRegistry()` |

---

## 常见问题

### 1. 端口冲突

如果 5173 端口被占用，修改 `vite.config.ts`：

```typescript
export default defineConfig({
  server: {
    port: 3000  // 使用其他端口
  }
})
```

### 2. 找不到模块

检查 `tsconfig.json` 中的路径别名配置：

```json
{
  "compilerOptions": {
    "paths": {
      "@spark-view/*": ["./packages/*/src"]
    }
  }
}
```

### 3. 组件未注册

确保在 `main.ts` 中调用了组件注册：

```typescript
import { registerCustomComponents } from './components'

registerCustomComponents()
```

## 获取帮助

- 📖 查看 [文档中心](../README.md)
- 🐛 报告 [GitHub Issues](https://github.com/your-org/spark-view/issues)
- 💬 参与 [讨论](https://github.com/your-org/spark-view/discussions)
