# 组件开发指南

> 使用 `@spark-view/spark-component` 扩展组件系统

## 组件系统架构

SPARK 组件系统基于能力（Capability）模式：
- **能力提供者（Provider）**：组件注册自己能提供的能力
- **能力消费者（Consumer）**：组件订阅并使用其他组件的能力
- **动态注入**：能力提供者可以延迟注册（Late Binding）

## 快速开始

### 1. 注册组件类型

```typescript
import { SparkComponent } from '@spark-view/spark-component'

// 注册 Grid 组件
SparkComponent.registerSparkComponent({
  type: 'spark-ej2-grid',           // kebab-case 类型名
  component: SparkEJ2Grid,          // Vue 组件
  capabilities: ['dataSource']      // 提供的能力
})

// 注册 Column 组件
SparkComponent.registerSparkComponent({
  type: 'spark-ej2-column',
  component: SparkEJ2Column,
  capabilities: [],
  dependencies: ['columnManager']   // 依赖的能力
})
```

### 2. 使用 useSparkComponent

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const props = defineProps<{
  id: string
  field?: string
}>()

const {
  context,      // 组件上下文
  provide,      // 提供能力
  consume,      // 消费能力
  use,          // 使用能力
  whenAvailable, // 等待能力就绪
  logger        // 日志记录器
} = useSparkComponent({
  id: props.id,
  type: 'spark-ej2-column',
  config: {
    field: props.field
  }
})
</script>
```

## 能力系统

### 提供能力

```typescript
// 在组件内部
provide('columnManager', {
  implementation: {
    addColumn(column: ColumnConfig) {
      columns.value.push(column)
      logger.debug('Column added', column)
    },
    
    removeColumn(field: string) {
      const index = columns.value.findIndex(c => c.field === field)
      if (index >=0) {
        columns.value.splice(index, 1)
        logger.debug('Column removed', field)
      }
    }
  }
})
```

### 消费能力

```typescript
// 方式 1：直接使用（Provider 必须存在）
const columnManager = use('columnManager')
columnManager.addColumn({ field: 'name', headerText: '姓名' })

// 方式 2：等待 Provider 就绪（推荐）
whenAvailable('columnManager', (columnManager) => {
  columnManager.addColumn({ 
    field: props.field, 
    headerText: props.headerText 
  })
})

// 方式 3：订阅能力（监听动态注册）
consume('columnManager', (columnManager) => {
  logger.info('Column manager is available')
  columnManager.addColumn({ field: props.field })
})
```

### 延迟绑定（Late Binding）

能力提供者可以在任何时候注册，消费者会自动感知：

```vue
<!-- 父组件 Grid -->
<script setup>
import { onMounted } from 'vue'

const { provide } = useSparkComponent({ ... })

// ⏰ 延迟 2 秒注册 columnManager
onMounted(() => {
  setTimeout(() => {
    provide('columnManager', {
      implementation: { addColumn() { ... } }
    })
  }, 2000)
})
</script>

<!-- 子组件 Column -->
<script setup>
const { whenAvailable } = useSparkComponent({ ... })

// ✅ Column 会等待 Grid 提供 columnManager
whenAvailable('columnManager', (manager) => {
  manager.addColumn({ field: 'name' })
})
</script>
```

## 组件生命周期

### 初始化流程

```typescript
// 1. useSparkComponent 调用
const { context, provide, consume } = useSparkComponent({
  id: 'my-grid',
  type: 'spark-ej2-grid'
})

// 2. 注册到 ComponentManager
manager.registerComponent(context)

// 3. 提供能力
provide('dataSource', { ... })

// 4. 消费能力
whenAvailable('gridApi', (api) => {
  // 使用 Grid API
})

// 5. 组件卸载时自动清理
onBeforeUnmount(() => {
  manager.unregisterComponent(context)
})
```

### 自动清理

```typescript
// 组件销毁时自动执行：
// - 取消所有能力订阅
// - 从 ComponentManager 注销
// - 清理事件监听器

// 无需手动清理！
```

## 实战示例

### 示例 1：Grid + Column

```vue
<!-- SparkEJ2Grid.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'

const props = defineProps<{ id: string }>()
const columns = ref<ColumnConfig[]>([])

const { provide, logger } = useSparkComponent({
  id: props.id,
  type: 'spark-ej2-grid'
})

// 提供 columnManager 能力
provide('columnManager', {
  implementation: {
    addColumn(config: ColumnConfig) {
      columns.value.push(config)
      logger.debug('Column added', config)
    }
  }
})

// 提供 dataSource 能力
provide('dataSource', {
  implementation: {
    setData(data: any[]) {
      // 更新 Grid 数据
    }
  }
})
</script>

<template>
  <ejs-grid :columns="columns">
    <slot />
  </ejs-grid>
</template>
```

```vue
<!-- SparkEJ2Column.vue -->
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const props = defineProps<{
  id: string
  field: string
  headerText: string
}>()

const { whenAvailable } = useSparkComponent({
  id: props.id,
  type: 'spark-ej2-column',
  config: {
    field: props.field,
    headerText: props.headerText
  }
})

// 等待父组件提供 columnManager
whenAvailable('columnManager', (manager) => {
  manager.addColumn({
    field: props.field,
    headerText: props.headerText
  })
})
</script>

<template>
  <!-- 无需渲染任何内容 -->
</template>
```

### 示例 2：数据绑定

```vue
<!-- 页面配置 rule.json -->
{
  "component": "spark-ej2-grid",
  "id": "myGrid",
  "props": {
    "dataSource": "@dataSet.Users.rows"
  }
}
```

```typescript
// Grid 组件监听数据变化
const { context } = useSparkComponent({ ... })

watch(() => context.props.dataSource, (newData) => {
  logger.info('Data source changed', newData.length)
  // 更新 Grid 数据
})
```

### 示例 3：跨组件通信

```typescript
// Button 组件触发 Grid 刷新
const { context } = useSparkComponent({
  id: 'refreshButton',
  type: 'spark-button'
})

// 查找目标组件
const manager = useSparkManager()
const grid = manager.getComponent('myGrid')

// 调用 Grid 能力
const gridApi = grid?.getCapability('gridApi')
gridApi?.refresh()
```

## 依赖注入（DI）

组件可以声明依赖的能力，系统会自动注入：

```typescript
SparkComponent.registerSparkComponent({
  type: 'spark-chart',
  component: SparkChart,
  capabilities: [],
  dependencies: ['dataSource', 'filterManager']  // 声明依赖
})
```

```vue
<script setup>
const { use } = useSparkComponent({ ... })

// 自动注入（如果不存在会抛出错误）
const dataSource = use('dataSource')
const filterManager = use('filterManager')

// 安全的延迟注入
whenAvailable('dataSource', (ds) => {
  // 使用 dataSource
})
</script>
```

## 日志系统

### 使用 Logger

```typescript
const { logger } = useSparkComponent({ ... })

logger.debug('Debug message', { extra: 'data' })
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message', new Error('Something went wrong'))
```

### 设置日志级别

```typescript
// 全局设置
import { SparkComponent } from '@spark-view/spark-component'

SparkComponent.setLogLevel('debug')  // debug | info | warn | error
```

### 自定义日志传输

```typescript
// 发送日志到服务器
SparkComponent.addLogTransport({
  name: 'remote-logger',
  handler: (level, message, ...args) => {
    fetch('/api/logs', {
      method: 'POST',
      body: JSON.stringify({ level, message, args })
    })
  }
})
```

## 测试组件

### 单元测试

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { SparkComponent } from '@spark-view/spark-component'

describe('SparkEJ2Grid', () => {
  it('should register columnManager capability', async () => {
    const manager = SparkComponent.createComponentManager()
    const wrapper = mount(SparkEJ2Grid, {
      props: { id: 'grid-1' },
      global: {
        provide: {
          sparkManager: manager
        }
      }
    })
    
    const context = manager.getComponent('grid-1')
    const columnManager = context?.getCapability('columnManager')
    
    expect(columnManager).toBeDefined()
    expect(columnManager.addColumn).toBeTypeOf('function')
  })
})
```

### Mock Provider

```typescript
// 测试 Column 组件（需要 columnManager）
it('should add column when provider is available', async () => {
  const manager = SparkComponent.createComponentManager()
  const mockColumnManager = {
    addColumn: vi.fn()
  }
  
  // 创建 Grid（提供 columnManager）
  const gridContext = manager.registerComponent({
    id: 'grid-1',
    type: 'spark-ej2-grid'
  })
  
  gridContext.provideCapability('columnManager', {
    implementation: mockColumnManager
  })
  
  // 挂载 Column
  const wrapper = mount(SparkEJ2Column, {
    props: { id: 'col-1', field: 'name' },
    global: { provide: { sparkManager: manager } }
  })
  
  await nextTick()
  
  expect(mockColumnManager.addColumn).toHaveBeenCalledWith({
    field: 'name'
  })
})
```

## 性能优化

### 1. 避免过度订阅

```typescript
// ❌ 在 watch 中订阅（会重复订阅）
watch(() => props.field, () => {
  consume('columnManager', (manager) => {
    // 每次 field 变化都会订阅一次！
  })
})

// ✅ 只订阅一次
const unsubscribe = consume('columnManager', (manager) => {
  // 只执行一次
})

// 如需响应 props 变化，在回调内使用 watch
consume('columnManager', (manager) => {
  watch(() => props.field, (newField) => {
    manager.updateColumn(context.id, { field: newField })
  })
})
```

### 2. 懒注册

```typescript
// ❌ 组件加载时立即提供能力
provide('heavyService', {
  implementation: createHeavyService()  // 耗时操作
})

// ✅ 首次使用时才创建
let heavyService: HeavyService | null = null

provide('heavyService', {
  get implementation() {
    if (!heavyService) {
      heavyService = createHeavyService()
    }
    return heavyService
  }
})
```

### 3. 批量操作

```typescript
// ❌ 逐个添加列
for (const config of columnConfigs) {
  columnManager.addColumn(config)  // 每次都触发更新
}

// ✅ 批量添加
columnManager.addColumns(columnConfigs)  // 只触发一次更新
```

## 调试技巧

### 查看组件树

```typescript
function debugComponents() {
  const manager = useSparkManager()
  const components = manager.getAllComponents()
  
  console.log('Registered components:')
  components.forEach(ctx => {
    console.log(`- ${ctx.id} (${ctx.type})`)
    console.log(`  Capabilities:`, Object.keys(ctx.capabilities))
  })
}
```

### 跟踪能力调用

```typescript
const { logger, use } = useSparkComponent({ ... })

const columnManager = use('columnManager')

// Wrap API with logging
const wrappedManager = new Proxy(columnManager, {
  get(target, prop) {
    return (...args: any[]) => {
      logger.debug(`Calling ${String(prop)}`, args)
      return target[prop](...args)
    }
  }
})
```

## 常见错误

### 1. Provider Not Found

```typescript
// ❌ 直接使用（Provider 不存在时抛出错误）
const api = use('gridApi')

// ✅ 使用 whenAvailable
whenAvailable('gridApi', (api) => {
  // 安全的延迟调用
})
```

### 2. 循环依赖

```typescript
// ❌ A 依赖 B，B 依赖 A
// ComponentA
whenAvailable('capabilityB', (b) => {
  provide('capabilityA', { ... })
})

// ComponentB
whenAvailable('capabilityA', (a) => {
  provide('capabilityB', { ... })
})

// ✅ 重新设计能力边界，避免循环
```

### 3. 内存泄漏

```typescript
// ❌ 忘记取消订阅
const unsubscribe = consume('dataSource', (ds) => { ... })

// ✅ 组件卸载时取消
onBeforeUnmount(() => {
  unsubscribe()
})

// ✅✅ 使用 whenAvailable（自动清理）
whenAvailable('dataSource', (ds) => {
  // 组件销毁时自动取消订阅
})
```

## 参考资源

- API 文档：`packages/spark-component/API.md`
- 架构设计：`docs/architecture/SPARK_ARCHITECTURE.md`
- 示例组件：
  - `features/spark/components/ej2/SparkEJ2Grid.vue`
  - `features/spark/components/ej2/SparkEJ2Column.vue`
- 单元测试：`tests/capability-late-binding.test.ts`
