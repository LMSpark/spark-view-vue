# @spark-view/spark-component

> SPARK 组件系统核心 - 提供组件管理、能力系统和生命周期控制

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-green.svg)](https://vuejs.org/)

## 特性

- **组件注册** - 统一的组件注册和管理机制
- **能力系统** - Provider/Consumer 模式的依赖注入
- **懒加载** - 支持动态导入和按需加载
- **生命周期** - 完整的组件生命周期管理
- **命名空间 API** - 统一的 `Spark` 命名空间

## 安装

```bash
pnpm add @spark-view/spark-component
```

## 快速开始

### 1. 创建管理器

```typescript
import { Spark } from '@spark-view/spark-component'

// 创建管理器实例
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()
```

### 2. 注册组件

```typescript
// 静态注册
Spark.register({
  type: 'my-grid',
  name: 'My Grid',
  component: MyGridComponent
})

// 懒加载注册
Spark.register({
  type: 'my-chart',
  name: 'My Chart',
  loader: () => import('./MyChartComponent.vue')
})
```

### 3. 安装插件

```typescript
import { createApp } from 'vue'

const app = createApp(App)
// 使用全局单例（推荐）
app.use(Spark.createVuePlugin())
```

### 4. 使用组件

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const { provide, consume, whenAvailable } = useSparkComponent({
  type: 'my-grid'
})

// 提供能力
provide('dataSource', {
  getData: () => fetchData()
})

// 消费能力
const logger = consume('logger')
</script>
```

## 核心概念

### 能力系统

组件间通过能力系统通信，避免紧耦合：

```typescript
// Provider 提供能力
provide('columnManager', {
  addColumn: (col) => columns.value.push(col),
  removeColumn: (id) => columns.value = columns.value.filter(c => c.id !== id)
})

// Consumer 消费能力
const columnManager = consume('columnManager')
whenAvailable('columnManager', (mgr) => {
  mgr.addColumn({ id: '1', name: 'Name' })
})
```

### 命名空间 API

所有 API 通过 `Spark` 命名空间统一访问：

```typescript
import { Spark } from '@spark-view/spark-component'

// 组件管理
Spark.createComponentManager()
Spark.createComponentRegistry()
Spark.register({ ... })

// Vue 插件
Spark.createVuePlugin({ ... })
Spark.install(app, { ... })

// 类型
import type { ComponentConfig, CapabilityProvider } from '@spark-view/spark-component'
```

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

```json
{
  "@spark-view/spark-utils": "workspace:*",
  "vue": "^3.4.0"
}
```

## 开发命令

```bash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
```

## License

MIT
