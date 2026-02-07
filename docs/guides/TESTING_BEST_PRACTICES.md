# SPARK 测试最佳实践

> 利用依赖注入架构实现高质量的测试隔离
> 
> 最后更新：2026年2月6日

## 目录

1. [为什么需要测试隔离](#为什么需要测试隔离)
2. [核心原则](#核心原则)
3. [测试工具链](#测试工具链)
4. [基础测试模式](#基础测试模式)
5. [高级测试场景](#高级测试场景)
6. [常见陷阱](#常见陷阱)
7. [持续集成](#持续集成)

---

## 为什么需要测试隔离

### 全局单例的问题

在依赖注入改造之前，SPARK 使用全局单例模式：

```typescript
// ❌ 旧模式：全局单例导致测试污染
import { componentManager } from '@spark-view/spark-component'

describe('Test Suite', () => {
  it('test 1', () => {
    // 修改全局 componentManager 状态
    componentManager.registerComponent({ type: 'test-1' })
  })
  
  it('test 2', () => {
    // ⚠️ 继承了 test 1 的状态！
    const types = componentManager.getRegisteredComponentTypes()
    // types 包含 'test-1'，导致测试不可靠
  })
})
```

**问题**：
- 测试用例之间状态共享
- 测试顺序敏感（调换顺序可能失败）
- 难以并行执行测试
- 覆盖率提升困难

### 依赖注入的解决方案

现在每个测试可以创建独立的组件系统：

```typescript
// ✅ 新模式：完全隔离的测试环境
import { Spark } from '@spark-view/spark-component'

describe('Test Suite', () => {
  it('test 1', () => {
    const system1 = Spark.createComponentSystem()
    system1.registry.register('test-component', { /* ... */ })
    // system1 独立存在
  })
  
  it('test 2', () => {
    const system2 = Spark.createComponentSystem()
    // system2 完全独立，不受 test 1 影响
  })
})
```

**优势**：
- ✅ 测试用例完全独立
- ✅ 可以并行执行
- ✅ 测试更可靠和可维护
- ✅ 易于编写复杂场景

---

## 核心原则

### 1. 每个测试文件创建独立系统

```typescript
describe('MyComponent', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
  })
  
  afterEach(() => {
    // 清理（可选，系统会自动 GC）
    system = null as any
  })
  
  it('should initialize correctly', () => {
    // 使用 system.manager, system.registry, system.capabilities
  })
})
```

### 2. 通过 DI 注入

```typescript
import { mount } from '@vue/test-utils'
import { Spark, SPARK_REGISTRY_KEY } from '@spark-view/spark-component'

const wrapper = mount(MyComponent, {
  global: {
    plugins: [Spark.createPlugin()]
  }
})
```

### 3. 避免导入全局单例

```typescript
// ❌ 避免
import { componentManager, capabilityManager } from './singletons'

// ✅ 推荐
const { manager, capabilities } = Spark.createComponentSystem()
```

---

## 测试工具链

### 推荐工具

- **测试框架**: Vitest（项目使用）
- **Vue 测试**: @vue/test-utils
- **断言库**: Vitest 内置（兼容 Jest API）
- **覆盖率**: Vitest Coverage (c8/istanbul)

### 基础配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/types/**']
    }
  }
})
```

```typescript
// tests/setup.ts
import { expect, beforeEach } from 'vitest'

// 全局 beforeEach（如果需要）
beforeEach(() => {
  // 重置全局状态
})

// 自定义匹配器（可选）
expect.extend({
  toHaveCapability(received, capabilityName) {
    const providers = Array.from(received.providers)
    const hasCapability = providers.some(p => p.name === capabilityName)
    return {
      pass: hasCapability,
      message: () => `Expected context to have capability "${capabilityName}"`
    }
  }
})
```

---

## 基础测试模式

### 模式 1: 组件注册测试

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { Spark } from '@spark-view/spark-component'

describe('Component Registration', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
  })
  
  it('should register component successfully', () => {
    system.registry.register('my-component', {
      type: 'my-component',
      name: 'My Component',
      component: MyComponent
    })
    
    expect(system.registry.has('my-component')).toBe(true)
    expect(system.registry.get('my-component')?.name).toBe('My Component')
  })
  
  it('should unregister component', () => {
    system.registry.register('temp-component', { type: 'temp-component' })
    expect(system.registry.has('temp-component')).toBe(true)
    
    system.registry.unregister('temp-component')
    expect(system.registry.has('temp-component')).toBe(false)
  })
})
```

### 模式 2: 能力系统测试

```typescript
describe('Capability System', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
  })
  
  it('should connect provider and consumer', () => {
    const context = system.manager.createContext({
      type: 'test-component'
    })
    
    const provider = {
      name: 'testCapability',
      version: '1.0.0',
      implementation: { value: 42 }
    }
    
    system.manager.registerProvider(context, provider)
    
    const foundProvider = system.manager.getProvider(context, 'testCapability')
    expect(foundProvider).toBeDefined()
    expect(foundProvider?.implementation.value).toBe(42)
  })
  
  it('should support late binding', async () => {
    const context = system.manager.createContext({
      type: 'test-component'
    })
    
    // 消费者先注册
    const consumer = {
      capabilityName: 'lateCapability',
      implementation: undefined
    }
    context.consumers.set('lateCapability', consumer)
    
    // 提供者后注册
    setTimeout(() => {
      const provider = {
        name: 'lateCapability',
        version: '1.0.0',
        implementation: { ready: true }
      }
      system.manager.registerProvider(context, provider)
    }, 10)
    
    // 等待提供者
    const provider = await new Promise(resolve => {
      const listeners = context.providerListeners || new Map()
      context.providerListeners = listeners
      
      if (!listeners.has('lateCapability')) {
        listeners.set('lateCapability', new Set())
      }
      
      listeners.get('lateCapability')!.add(resolve)
    })
    
    expect(provider).toBeDefined()
  })
})
```

### 模式 3: Vue 组件挂载测试

```typescript
import { mount } from '@vue/test-utils'
import { Spark } from '@spark-view/spark-component'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
    
    // 注册依赖组件
    system.registry.register('spark-button', {
      type: 'spark-button',
      component: ButtonComponent
    })
  })
  
  it('should render correctly', () => {
    const wrapper = mount(MyComponent, {
      props: {
        config: {
          type: 'my-component',
          label: 'Test'
        }
      },
      global: {
        provide: {
          sparkManager: system.manager
        }
      }
    })
    
    expect(wrapper.text()).toContain('Test')
  })
  
  it('should consume capabilities', async () => {
    const wrapper = mount(MyComponent, {
      global: {
        provide: {
          sparkManager: system.manager
        }
      }
    })
    
    // 提供能力
    const context = (wrapper.vm as any).context
    const provider = {
      name: 'dataSource',
      version: '1.0.0',
      implementation: { data: [1, 2, 3] }
    }
    system.manager.registerProvider(context, provider)
    
    await wrapper.vm.$nextTick()
    
    expect(wrapper.find('.data-list').exists()).toBe(true)
  })
})
```

---

## 高级测试场景

### 场景 1: 测试组件树

```typescript
describe('Component Tree', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
  })
  
  it('should create nested contexts', () => {
    const parentContext = system.manager.createContext({
      type: 'parent-component'
    })
    
    const child1Context = system.manager.createContext(
      { type: 'child-component-1' },
      parentContext
    )
    
    const child2Context = system.manager.createContext(
      { type: 'child-component-2' },
      parentContext
    )
    
    expect(parentContext.children).toHaveLength(2)
    expect(child1Context.parent).toBe(parentContext)
    expect(child2Context.parent).toBe(parentContext)
  })
  
  it('should propagate capabilities to children', () => {
    const parentContext = system.manager.createContext({
      type: 'parent'
    })
    
    const childContext = system.manager.createContext(
      { type: 'child' },
      parentContext
    )
    
    // 父组件提供能力
    const provider = {
      name: 'theme',
      version: '1.0.0',
      implementation: { color: 'blue' }
    }
    system.manager.registerProvider(parentContext, provider)
    
    // 子组件继承能力
    let current = childContext
    while (current) {
      const found = Array.from(current.providers).find(
        p => p.name === 'theme'
      )
      if (found) {
        expect(found.implementation.color).toBe('blue')
        break
      }
      current = current.parent as any
    }
  })
})
```

### 场景 2: 测试异步加载

```typescript
describe('Async Component Loading', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
  })
  
  it('should load component dynamically', async () => {
    system.registry.register('async-component', {
      type: 'async-component',
      loader: () => import('./AsyncComponent.vue')
    })
    
    expect(system.registry.has('async-component')).toBe(true)
    
    const def = system.registry.get('async-component')
    expect(def?.loader).toBeDefined()
    
    // 解析 loader
    const component = await def!.loader!()
    expect(component).toBeDefined()
  })
})
```

### 场景 3: Mock 能力管理器

```typescript
import { vi } from 'vitest'

describe('Capability Manager Mocking', () => {
  it('should mock capability connections', () => {
    const mockCapabilities = {
      connectCapability: vi.fn(),
      disconnectCapability: vi.fn(),
      autoConnectCapabilities: vi.fn()
    }
    
    const manager = Spark.createComponentManager(
      undefined,
      undefined,
      mockCapabilities as any
    )
    
    const context = manager.createContext({ type: 'test' })
    const provider = { name: 'test', version: '1.0.0' }
    
    manager.registerProvider(context, provider)
    
    expect(mockCapabilities.autoConnectCapabilities).toHaveBeenCalledWith(context)
  })
})
```

---

## 常见陷阱

### 陷阱 1: 忘记清理全局状态

```typescript
// ❌ 错误：全局单例污染
import { componentManager } from './global'

describe('Tests', () => {
  it('test 1', () => {
    componentManager.registerComponent({ type: 'a' })
  })
  
  it('test 2', () => {
    // 'a' 仍然存在！
  })
})

// ✅ 正确：使用独立系统
describe('Tests', () => {
  let system: ReturnType<typeof Spark.createComponentSystem>
  
  beforeEach(() => {
    system = Spark.createComponentSystem()
  })
  
  it('test 1', () => {
    system.registry.register('a', { type: 'a' })
  })
  
  it('test 2', () => {
    // 全新系统，'a' 不存在
  })
})
```

### 陷阱 2: 异步测试未等待

```typescript
// ❌ 错误：未等待异步操作
it('should load async', () => {
  loadComponent() // 返回 Promise，但未 await
  expect(isLoaded).toBe(true) // 失败！
})

// ✅ 正确：等待 Promise
it('should load async', async () => {
  await loadComponent()
  expect(isLoaded).toBe(true)
})
```

### 陷阱 3: 过度 Mock

```typescript
// ❌ 过度 Mock 降低测试价值
it('should work', () => {
  const mockEverything = vi.fn(() => 'success')
  expect(mockEverything()).toBe('success')
  // 这测试了什么？
})

// ✅ 只 Mock 外部依赖
it('should work', () => {
  const mockApi = vi.fn().mockResolvedValue({ data: [] })
  // 测试真实逻辑
})
```

---

## 持续集成

### GitHub Actions 示例

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install pnpm
        run: npm install -g pnpm
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm run test -- --run
      
      - name: Generate coverage
        run: pnpm run test -- --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### 本地测试命令

```bash
# 运行所有测试
pnpm run test

# 运行单个测试文件
pnpm run test -- path/to/test.test.ts

# 运行特定测试用例
pnpm run test -- -t "test name pattern"

# 生成覆盖率报告
pnpm run test -- --coverage

# 监听模式（开发时）
pnpm run test -- --watch

# 并行测试（加速）
pnpm run test -- --threads
```

---

## 总结

### 关键要点

1. ✅ 使用 `Spark.createComponentSystem()` 创建隔离测试环境
2. ✅ 每个测试用例独立系统（beforeEach 创建）
3. ✅ 通过 DI 注入 manager 到 Vue 组件
4. ✅ 避免导入全局单例
5. ✅ 等待异步操作（async/await）
6. ✅ 适度 Mock（只 Mock 外部依赖）
7. ✅ 持续监控覆盖率（目标 50%+）

### 下一步

- 为核心模块编写单元测试
- 为业务组件编写集成测试
- 设置 CI/CD 自动化测试
- 提升测试覆盖率（当前 3.2% → 目标 50%+）

---

## 参考资源

- [Vitest 官方文档](https://vitest.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [SPARK API 文档](../../packages/spark-component/API.md)
- [SPARK 架构设计](../../docs/SPARK_ARCHITECTURE.md)
