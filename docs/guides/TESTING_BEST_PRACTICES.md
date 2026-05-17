# SPARK 测试最佳实践

> 基于实际测试代码的指导原则
>
> 核心参考：`tests/capability-system.test.ts`、`tests/spark-component.test.ts`

## 工具链

- **测试框架**：Vitest + jsdom
- **Vue 测试**：@vue/test-utils
- **命令**：`pnpm run test`；单个用例：`pnpm run test -- -t "用例名称"`

---

## 1. 测试隔离原则

每个测试文件或每个 describe 块创建独立系统，避免全局状态污染。

```typescript
// ❌ 旧模式（不要用）：全局单例
// componentManager.registerComponent({ type: 'test-1' })

// ✅ 正确模式：每个测试独立系统
import { Spark } from '@spark-view/spark-component'

const { registry, rootContext, createContext } = Spark.createSystem()
// 或使用 Spark.createPlugin({ registry }) 创建 Vue 插件
```

`Spark.createSystem()` 返回 `{ registry, rootContext, createContext }`。

---

## 2. 组件注册测试

```typescript
import { describe, it, expect } from 'vitest'
import { defineAsyncComponent } from 'vue'
import { Spark } from '@spark-view/spark-component'

describe('Component Registration', () => {
  const { registry } = Spark.createSystem()

  it('registers and retrieves component', () => {
    registry.register('my-component', { template: '<div/>' })
    expect(registry.has('my-component')).toBe(true)
  })

  it('registers async component', () => {
    registry.register('lazy-grid', defineAsyncComponent(() => import('./MyGrid.vue')))
    expect(registry.has('lazy-grid')).toBe(true)
  })

  it('unregisters component', () => {
    registry.register('temp', {})
    registry.unregister('temp')
    expect(registry.has('temp')).toBe(false)
  })
})
```

---

## 3. 能力系统测试

使用 `sparkProvide()` / `sparkConsume()` 纯函数（来自 `@spark-view/spark-component`）测试能力链。

```typescript
import { describe, it, expect } from 'vitest'
import { Spark, sparkProvide, sparkConsume, defineCapability, APP_SERVICES } from '@spark-view/spark-component'

describe('Capability System', () => {
  it('provides and consumes up the parent chain', () => {
    const { createContext, rootContext } = Spark.createSystem()

    const parentCtx = createContext({ type: 'provider', id: 'p-1' }, rootContext)
    const childCtx = createContext({ type: 'consumer', id: 'c-1' }, parentCtx)

    // 父组件提供能力
    sparkProvide(parentCtx, APP_SERVICES, {
      router: { push: async () => {}, replace: async () => {}, back: () => {}, currentRoute: {} },
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    })

    // 子组件通过 parent 链查找
    const found = sparkConsume(childCtx, APP_SERVICES)
    expect(found).toBeTruthy()
    expect(found!.router).toBeDefined()
    expect(found!.logger).toBeDefined()
  })

  it('supports custom capability keys', () => {
    const { createContext, rootContext } = Spark.createSystem()
    interface ThemeApi { color: string }
    const THEME = defineCapability<ThemeApi>('test:theme')

    const parentCtx = createContext({ type: 'provider' }, rootContext)
    const childCtx = createContext({ type: 'consumer' }, parentCtx)

    sparkProvide(parentCtx, THEME, { color: 'blue' })

    const found = sparkConsume<ThemeApi>(childCtx, THEME)
    expect(found?.color).toBe('blue')
  })

  it('returns null when capability not provided', () => {
    const { createContext, rootContext } = Spark.createSystem()
    const UNKNOWN = defineCapability<{ x: number }>('test:unknown')
    const ctx = createContext({ type: 'orphan' }, rootContext)

    const result = sparkConsume(ctx, UNKNOWN)
    expect(result).toBeNull()
  })
})
```

---

## 4. Vue 组件挂载测试

### 方式 1：使用 `Spark.createPlugin()`（推荐）

```typescript
import { mount } from '@vue/test-utils'
import { Spark } from '@spark-view/spark-component'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  function createTestPlugin() {
    const registry = Spark.createRegistry()
    return { plugin: Spark.createPlugin({ registry }), registry }
  }

  it('renders correctly', () => {
    const { plugin } = createTestPlugin()

    const wrapper = mount(MyComponent, {
      props: { config: { type: 'my-component', title: 'Test' } },
      global: { plugins: [plugin] }
    })

    expect(wrapper.text()).toContain('Test')
  })
})
```

### 方式 2：手动提供 registry + 显式 parentContext

```typescript
import { SPARK_REGISTRY_KEY, Spark } from '@spark-view/spark-component'

const { registry, rootContext } = Spark.createSystem()

const wrapper = mount(MyComponent, {
  props: {
    config: { type: 'my-component' },
    parentContext: rootContext,
  },
  global: {
    provide: {
      [SPARK_REGISTRY_KEY as symbol]: registry,
    }
  }
})
```

---

## 5. 组件树与能力传递测试

```typescript
import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import { sparkProvide, sparkConsume, defineCapability } from '@spark-view/spark-component'

describe('Component Tree', () => {
  it('creates nested contexts with parent references', () => {
    const { createContext, rootContext } = Spark.createSystem()

    const parentCtx = createContext({ type: 'parent' }, rootContext)
    const childCtx = createContext({ type: 'child' }, parentCtx)

    expect(childCtx.parent).toBe(parentCtx)
  })

  it('propagates capabilities from parent to deep descendants', () => {
    const { createContext, rootContext } = Spark.createSystem()
    const SERVICE = defineCapability<{ ping(): string }>('test:service')

    const root = createContext({ type: 'root' }, rootContext)
    const mid = createContext({ type: 'mid' }, root)
    const leaf = createContext({ type: 'leaf' }, mid)

    sparkProvide(root, SERVICE, { ping: () => 'pong' })

    const found = sparkConsume(leaf, SERVICE)
    expect(found?.ping()).toBe('pong')
  })
})
```

---

## 6. DataSet / DataView 测试

```typescript
import { SparkData } from '@spark-view/spark-data'

describe('DataSet', () => {
  it('creates dataset with tables', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'TestDS',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }, { name: 'name', type: 'string' }],
          rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
        }
      }
    })

    const view = ds.getView('Users', 'default')!
    expect(view.rows).toHaveLength(2)
    expect(view.rows[0].name).toBe('Alice')
  })

  it('resolves DataViewKey', () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'TestDS',
      tables: {
        Users: { tableName: 'Users', columns: [], rows: [{ id: 1 }] }
      }
    })
    const binding = SparkData.resolveDataViewMemberBinding('Users@default@rows', ds)
    expect(binding?.kind).toBe('value')
  })
})
```

---

## 7. 外部组件 Mock

测试依赖第三方库（如 Syncfusion EJ2）的组件时，需要 mock 外部模块：

```typescript
import { vi } from 'vitest'

vi.mock('@syncfusion/ej2-vue-grids', () => ({
  GridComponent: {
    name: 'GridComponent',
    template: '<div class="ej2-grid"><slot /></div>',
    props: ['dataSource', 'allowPaging', 'pageSettings']
  },
  ColumnsDirective: { name: 'ColumnsDirective', template: '<slot />' },
  ColumnDirective: { name: 'ColumnDirective', template: '<div />', props: ['field', 'headerText'] }
}))
```

---

## 8. useSparkComponent 返回值验证

```typescript
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { Spark, useSparkComponent } from '@spark-view/spark-component'

it('useSparkComponent returns correct interface', () => {
  const { plugin } = (() => {
    const registry = Spark.createRegistry()
    return { plugin: Spark.createPlugin({ registry }) }
  })()

  mount(defineComponent({
    setup() {
      const result = useSparkComponent({ type: 'test' })
      // 验证返回值
      expect(typeof result.sparkConsume).toBe('function')
      expect(typeof result.sparkProvide).toBe('function')
      expect(typeof result.sparkRemove).toBe('function')
      expect(typeof result.provider.nearestCapabilityProvider).toBe('function')
      expect(typeof result.resolvedProps).toBe('object')
      expect(typeof result.logger).toBe('object')
      // 'use' 别名不存在
      expect('use' in result).toBe(false)
      return () => h('div')
    }
  }), { global: { plugins: [plugin] } })
})
```

---

## 9. 常见陷阱

| 陷阱 | 原因 | 修复 |
|------|------|------|
| 测试间状态泄漏 | 多个测试共用同一 `registry` | 每个 `describe` 块内 `const { registry } = Spark.createSystem()` |
| 异步测试未 await | 忘记 `async/await` | `it('...', async () => { await ... })` |
| EJ2 组件报错 | 真实 EJ2 在 jsdom 不可用 | `vi.mock('@syncfusion/ej2-vue-grids', ...)` |
| `sparkConsume()` 返回 null | 正常延迟绑定，非错误 | 用可选链 `?.` 处理 |
| `Spark.createComponentSystem` | **不存在** | 使用 `Spark.createSystem()` |

---

## 常用命令

```bash
# 所有测试
pnpm run test

# 指定测试文件
pnpm run test tests/capability-system.test.ts

# 指定测试名称
pnpm run test -- -t "capability-late-binding"

# 类型检查
pnpm run typecheck
```
