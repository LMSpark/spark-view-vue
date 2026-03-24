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

### 1. 注册组件

```typescript
import { Spark } from '@spark-view/spark-component'
import MyGridComponent from './MyGridComponent.vue'

// 静态注册
Spark.register('my-grid', MyGridComponent)

// 懒加载注册
Spark.register('my-chart', () => import('./MyChartComponent.vue'))

// 批量注册（推荐）
const reg = Spark.createRegister(import.meta.glob('./*.vue'))
reg.registerAll({
  'my-grid': './MyGridComponent.vue',
  'my-chart': './MyChartComponent.vue'
})
```

### 2. 安装插件

```typescript
import { createApp } from 'vue'

const app = createApp(App)
// 使用全局单例（推荐）
app.use(Spark.createPlugin())
```

### 3. 使用组件

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const { sparkProvide, sparkConsume } = useSparkComponent({
  type: 'my-grid'
})

// 提供能力（必须在 setup 同步阶段调用）
sparkProvide('dataSource', {
  getData: () => fetchData()
})

// 消费能力（必须在 setup 同步阶段调用）
const logger = sparkConsume('logger')
</script>
```

只读祖先能力时，不再使用单独的 helper，统一使用同一个入口的轻量模式：

```ts
const { sparkConsume, parentType } = useSparkComponent(undefined, {
  mode: 'consume-only'
})

const dataSource = sparkConsume('dataSource')
```

## 核心概念

### 能力系统

组件间通过能力系统通信，避免紧耦合：

```typescript
// Provider 提供能力（setup 同步阶段）
sparkProvide('columnManager', {
  addColumn: (col) => columns.value.push(col),
  removeColumn: (id) => columns.value = columns.value.filter(c => c.id !== id)
})

// Consumer 消费能力（setup 同步阶段）
const columnManager = sparkConsume('columnManager')
// ⚠️ sparkProvide/sparkConsume 必须在 setup() 同步阶段调用，不要在 onMounted/watch/async 中使用
```

### 命名空间 API

所有 API 通过 `Spark` 命名空间统一访问：

```typescript
import { Spark } from '@spark-view/spark-component'

// 注册组件
Spark.register('my-component', MyComponent)

// 安装 Vue 插件（使用全局单例）
app.use(Spark.createPlugin())

// 类型定义
import type { ComponentContext } from '@spark-view/spark-component'
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
