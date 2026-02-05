# 组件能力提供指南 🔌

> 组件开发者如何主动提供能力并注册到 SPARK 系统
> 
> **核心工具：** 使用 `@spark-view/spark-utils` 提供的能力系统

## 核心概念：能力与上下文绑定

**上下文（ComponentContext）是独立的抽象概念，不一定是 Vue 组件：**

```typescript
// 上下文可以是：
interface ComponentContext {
  id: string                           // 唯一 ID
  type: string                         // 上下文类型（可以是逻辑概念）
  parent?: ComponentContext            // 父上下文
  children: ComponentContext[]         // 子上下文
  providers: Set<CapabilityProvider>   // 提供的能力
  consumers: Map<string, CapabilityConsumer>  // 消费的能力
  config?: ComponentConfig             // 可选：关联的配置
}

// 组件配置中的 component 字段可选
interface ComponentConfig {
  type: string
  component?: unknown  // Vue 组件 或 null（逻辑组件）
}
```

**上下文的类型：**

1. **Vue 组件上下文** - 绑定到真实 Vue 组件
   ```typescript
   {
     type: 'user-grid',
     component: UserGridComponent,  // Vue 组件
     providers: [...]
   }
   ```

2. **逻辑上下文** - 纯能力提供者，无 UI
   ```typescript
   {
     type: 'data-manager',
     component: null,  // 无组件，只提供能力
     providers: ['dataSource', 'validation']
   }
   ```

3. **服务上下文** - 全局服务
   ```typescript
   {
     type: 'auth-service',
     component: null,
     providers: ['authentication', 'authorization']
   }
   ```

4. **数据容器上下文** - 状态管理
   ```typescript
   {
     type: 'store',
     component: null,
     providers: ['state', 'actions']
   }
   ```

**关键点：**
1. ✅ 上下文是能力的容器（不一定有 UI）
2. ✅ 上下文树管理能力的继承和查找
3. ✅ 逻辑上下文可以提供能力给其他组件
4. ✅ 组件上下文和逻辑上下文平等对待

---

## 能力系统架构

SPARK 使用 `@spark-view/spark-utils` 包提供的通用能力系统：

- **CapabilityManager**: 管理能力的注册、查找、连接
- **EventCapabilityProvider**: 事件能力提供者（内置）
- **EventCapabilityConsumer**: 事件能力消费者（内置）
- **CapabilityConnector**: 能力连接器（支持扩展）

```typescript
import {
  createEventCapabilityProvider,
  createEventCapabilityConsumer
} from '@spark-view/spark-utils'
```

---

## 快速开始

### 1️⃣ 基础能力提供

**能力绑定到组件上下文：**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useSpark } from '@spark-view/spark-component'

const props = defineProps<{ config: ComponentConfig }>()
const { provide, context } = useSpark(props.config)

// 组件状态
const selectedRows = ref<string[]>([])

// 提供 selection 能力
// ⚠️ 能力绑定到 context.providers
provide('selection', {
  getSelectedRows() {
    return selectedRows.value
  },
  selectRow(id: string) {
    if (!selectedRows.value.includes(id)) {
      selectedRows.value.push(id)
    }
  },
  clearSelection() {
    selectedRows.value = []
  }
})

// 查看当前上下文
console.log('Context ID:', context.id)           // 唯一 ID
console.log('Providers:', context.providers)     // 提供的能力集合
console.log('Parent:', context.parent)           // 父组件上下文
</script>
```

**背后的机制：**
```typescript
// provide() 内部实现
function provide(name: string, implementation?: Implementation) {
  const provider: CapabilityProvider = {
    name,
    version: '1.0.0',
    implementation
  }
  
  // 1. 能力添加到当前上下文
  context.providers.add(provider)
  
  // 2. 注册到管理器（支持跨组件查找）
  manager.registerProvider(context, provider)
  
  // 3. 自动尝试连接等待该能力的消费者
  capabilityManager.autoConnectCapabilities(context)
}
```

### 2️⃣ 事件能力（推荐）

**使用 spark-utils 的事件能力工具：**

```vue
<script setup lang="ts">
import { useSpark } from '@spark-view/spark-component'

const props = defineProps<{ config: ComponentConfig }>()
const { provideEvents } = useSpark(props.config)

// provideEvents 内部使用 createEventCapabilityProvider
// 来自 @spark-view/spark-utils
const emitter = provideEvents('events')

function handleRowClick(row: any) {
  emitter.emit('rowClick', row)
}

function handleSelectionChange(selection: any[]) {
  emitter.emit('selectionChange', selection)
}
</script>

<template>
  <div @click="handleRowClick(row)">
    <!-- 组件内容 -->
  </div>
</template>
```

**背后的机制：**
```typescript
// provideEvents 内部实现
import { createEventCapabilityProvider } from '@spark-view/spark-utils'

function provideEvents(name = 'events') {
  const { provider, emitter } = createEventCapabilityProvider(name)
  manager.registerProvider(context, provider)
  return emitter
}
```

---

## 上下文生命周期与能力清理

### 自动清理机制

```typescript
// 组件销毁时自动清理
onUnmounted(() => {
  // 1. 清理上下文中的能力
  context.providers.clear()
  context.consumers.clear()
  
  // 2. 从管理器移除上下文
  manager.destroyContext(context.id)
  
  // 3. 子组件上下文自动清理
  context.children.forEach(child => {
    manager.destroyContext(child.id)
  })
})
```

### 实例隔离

```vue
<!-- 同一组件的不同实例有独立上下文 -->
<UserGrid :config="{ type: 'user-grid', id: 'grid-1' }" />
<UserGrid :config="{ type: 'user-grid', id: 'grid-2' }" />

<!-- 
grid-1 context:
  - id: 'grid-1'
  - providers: ['selection', 'dataSource']
  
grid-2 context:
  - id: 'grid-2'
  - providers: ['selection', 'dataSource']
  
✅ 两个实例的能力完全独立
✅ 互不影响
-->
---

## 常见场景

### 场景 1: 父子组件通信

```vue
<!-- 父组件提供能力 -->
<script setup lang="ts">
// Parent.vue
const { provide, context } = useSpark(props.config)

const data = ref([])

provide('dataSource', {
  getData: () => data.value,
  refresh: () => loadData()
})

console.log('Parent context:', context.id)
console.log('Parent providers:', context.providers)
</script>

<template>
  <div>
    <!-- 子组件消费能力 -->
    <ChildComponent :config="childConfig" :parent-context="context" />
  </div>
</template>
```

```vue
<!-- 子组件消费能力 -->
<script setup lang="ts">
// Child.vue
const props = defineProps<{ config: Config, parentContext: ComponentContext }>()
const { consume, context } = useSpark(props.config, { parentContext: props.parentContext })

// 从父组件查找能力
const dataSource = consume('dataSource')
const data = dataSource?.getData()

console.log('Child context:', context.id)
console.log('Child parent:', context.parent?.id)  // 指向父组件上下文
</script>
```

### 场景 2: 跨层级通信

```vue
<!-- 在祖先组件提供能力 -->
<template>
  <LayoutContainer>              <!-- 提供 'theme' 能力 -->
    <PageHeader />
    <ContentArea>                <!-- 不提供能力 -->
      <UserGrid />               <!-- 消费 'theme' 能力 -->
    </ContentArea>
  </LayoutContainer>
</template>
```

**查找路径：**
```
UserGrid.consume('theme')
  → UserGrid.context.parent (ContentArea) → 没有 'theme'
  → ContentArea.context.parent (LayoutContainer) → 找到 'theme' ✅
```

### 场景 3: 延迟绑定（Late Binding）

```vue
<script setup lang="ts">
const { consume, whenAvailable } = useSpark(props.config)

// 立即消费（可能返回 null）
const selection = consume('selection')

if (!selection) {
  // 等待能力就绪
  whenAvailable('selection').then(provider => {
    console.log('Selection capability is ready:', provider)
    const impl = provider.implementation
    impl.selectAll()
  })
}
</script>
```

### 场景 4: 逻辑上下文（无组件）

```typescript
// 创建逻辑上下文（不渲染 UI）
const dataManagerContext = manager.createContext({
  type: 'data-manager',
  component: null  // 无 Vue 组件
})

// 在逻辑上下文中提供能力
const dataProvider: CapabilityProvider = {
  name: 'dataSource',
  version: '1.0.0',
  implementation: {
    getData: () => globalData,
    refresh: () => loadData()
  }
}
manager.registerProvider(dataManagerContext, dataProvider)

// 组件消费逻辑上下文的能力
const { consume } = useSpark(props.config, { 
  parentContext: dataManagerContext  // 指定逻辑上下文为父
})

const dataSource = consume('dataSource')  // 从逻辑上下文获取能力
```

**使用场景：**
- 全局服务（认证、配置、主题）
- 数据管理器（状态、缓存）
- 业务逻辑层（验证、计算）
- 事件总线（全局通信）

### 场景 5: 混合上下文树

```
Root Context (逻辑)
  └─ AuthService (逻辑上下文，无 UI)
     └─ providers: ['authentication', 'authorization']
        ├─ AppLayout (Vue 组件)
        │  └─ providers: ['theme', 'navigation']
        │     └─ UserGrid (Vue 组件)
        │        └─ consumers: ['authentication', 'theme']
        │           └─ 查找路径：
        │              1. UserGrid (自己) → 无
        │              2. AppLayout (父) → 找到 'theme' ✅
        │              3. AuthService (祖父) → 找到 'authentication' ✅
```

**代码示例：**
```typescript
// 1. 创建逻辑上下文
const authContext = manager.createContext({
  type: 'auth-service',
  component: null
})

manager.registerProvider(authContext, {
  name: 'authentication',
  implementation: { login, logout, checkAuth }
})

// 2. 创建 UI 组件上下文（指定逻辑上下文为父）
const appLayoutContext = manager.createContext({
  type: 'app-layout',
  component: AppLayoutComponent
}, authContext)  // 父上下文是逻辑上下文

// 3. UserGrid 自动继承能力
const userGrid = useSpark(gridConfig, { parentContext: appLayoutContext })
const auth = userGrid.consume('authentication')  // ✅ 从逻辑上下文获取
```
    const impl = provider.implementation
    impl.selectAll()
  })
}
</script>
```

---

## 完整示例：用户列表组件

### UserList.vue
```vue
<template>
  <div class="user-list">
    <div class="toolbar">
      <button @click="refresh">刷新</button>
      <button @click="clearSelection">清空选择</button>
      <span>已选: {{ selectedRows.length }}</span>
    </div>
    
    <table>
      <thead>
        <tr>
          <th><input type="checkbox" @change="selectAll" /></th>
          <th>ID</th>
          <th>姓名</th>
          <th>邮箱</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>
            <input 
              type="checkbox" 
              :checked="isSelected(user.id)"
              @change="toggleSelect(user.id)"
            />
          </td>
          <td>{{ user.id }}</td>
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSpark } from '@spark-view/spark-component'

interface User {
  id: string
  name: string
  email: string
}

interface Props {
  config: {
    type: string
    props?: {
      dataSource?: string
      pageSize?: number
    }
  }
}

const props = defineProps<Props>()
const { provide, provideEvents, logger } = useSpark(props.config)

// 组件状态
const users = ref<User[]>([])
const selectedRows = ref<string[]>([])
const loading = ref(false)

// 事件发射器
const emitter = provideEvents('events')

// 数据加载
async function loadData() {
  loading.value = true
  try {
    const url = props.config.props?.dataSource || '/api/users'
    const response = await fetch(url)
    users.value = await response.json()
    emitter.emit('dataLoaded', users.value)
  } catch (error) {
    logger.error('Failed to load data:', error)
    emitter.emit('error', error)
  } finally {
    loading.value = false
  }
}

function refresh() {
  loadData()
  emitter.emit('refresh')
}

// 选择相关
function isSelected(id: string) {
  return selectedRows.value.includes(id)
}

function toggleSelect(id: string) {
  if (isSelected(id)) {
    selectedRows.value = selectedRows.value.filter(r => r !== id)
  } else {
    selectedRows.value.push(id)
  }
  emitter.emit('selectionChange', selectedRows.value)
}

function clearSelection() {
  selectedRows.value = []
  emitter.emit('selectionChange', [])
}

function selectAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  if (checked) {
    selectedRows.value = users.value.map(u => u.id)
  } else {
    selectedRows.value = []
  }
  emitter.emit('selectionChange', selectedRows.value)
}

// 🔌 提供能力 1: selection
provide('selection', {
  getSelectedRows() {
    return selectedRows.value
  },
  selectRow(id: string) {
    if (!isSelected(id)) {
      toggleSelect(id)
    }
  },
  clearSelection,
  selectAll() {
    selectedRows.value = users.value.map(u => u.id)
    emitter.emit('selectionChange', selectedRows.value)
  }
})

// 🔌 提供能力 2: dataSource
provide('dataSource', {
  getData() {
    return users.value
  },
  refresh,
  setData(data: User[]) {
    users.value = data
    emitter.emit('dataChanged', data)
  }
})

// 🔌 提供能力 3: pagination（示例）
provide('pagination', {
  pageSize: props.config.props?.pageSize || 10,
  currentPage: 1,
  totalPages: computed(() => Math.ceil(users.value.length / (props.config.props?.pageSize || 10)))
})

// 初始化
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.user-list {
  padding: 20px;
}
.toolbar {
  margin-bottom: 10px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 8px;
  border: 1px solid #ddd;
  text-align: left;
}
</style>
```

### 注册组件
```typescript
// main.ts
import { Spark } from '@spark-view/spark-component'

Spark.register({
  name: 'UserList',
  path: './components/UserList.vue'
})
```

**能力在组件内部提供，无需在注册时声明。**

---

## 能力类型

### 1. 数据能力
```typescript
provide('dataSource', {
  getData: () => data.value,
  setData: (newData) => { data.value = newData },
  refresh: () => loadData()
})
```

### 2. 选择能力
```typescript
provide('selection', {
  getSelectedRows: () => selected.value,
  selectRow: (id) => { /* ... */ },
  clearSelection: () => { selected.value = [] }
})
```

### 3. 事件能力（内置）
```typescript
const emitter = provideEvents('events')
emitter.emit('rowClick', row)
emitter.emit('selectionChange', selection)
```

### 4. 操作能力
```typescript
provide('actions', {
  create: (item) => { /* ... */ },
  update: (id, item) => { /* ... */ },
  delete: (id) => { /* ... */ }
})
```

### 5. 状态能力
```typescript
provide('state', {
  loading: computed(() => loading.value),
  error: computed(() => error.value),
  isEmpty: computed(() => data.value.length === 0)
})
```

---

## 能力命名规范

| 能力名称 | 用途 | 常见方法 |
|---------|------|---------|
| `selection` | 选择管理 | getSelectedRows, selectRow, clearSelection |
| `dataSource` | 数据管理 | getData, setData, refresh |
| `pagination` | 分页 | goToPage, setPageSize, getTotalPages |
| `events` | 事件 | emit, on, off |
| `validation` | 验证 | validate, getErrors, clearErrors |
| `actions` | 操作 | create, update, delete, submit |
| `state` | 状态 | loading, error, isDirty |

---

## 能力消费（组件间调用）

### 能力查找机制

**能力查找沿着上下文树向上查找：**

```
Root Context
  └─ providers: []
     └─ LayoutContainer (context.id = 'layout-1')
        └─ providers: []
           ├─ UserGrid (context.id = 'grid-1')
           │  └─ providers: ['selection', 'dataSource'] ✅
           │
           └─ Toolbar (context.id = 'toolbar-1')
              └─ consumers: ['selection']
                 └─ 向上查找 parent → LayoutContainer → 找不到
                    → 继续向上 → Root → 找不到
                    → 向兄弟节点查找? ❌ 不支持
```

**查找规则：**
1. ✅ 当前上下文的 `providers`
2. ✅ 父上下文的 `providers`（递归向上）
3. ❌ 不查找兄弟节点
4. ❌ 不查找子节点

**解决方案：**
- **方案 1**：能力提供在父组件（共同祖先）
- **方案 2**：使用全局能力（根上下文）
- **方案 3**：使用事件总线（通过父组件中转）

---

### 消费能力
```vue
<script setup lang="ts">
import { useSpark } from '@spark-view/spark-component'

const { consume, context } = useSpark(props.config)

// 消费 selection 能力
// 📍 从 context.parent 开始向上查找
const selection = consume('selection')

if (selection) {
  const rows = selection.getSelectedRows()
  console.log('Selected:', rows)
} else {
  console.warn('Selection capability not found in parent chain')
}

// 查看查找路径
console.log('Current context:', context.id)
console.log('Parent context:', context.parent?.id)
console.log('Parent providers:', context.parent?.providers)
</script>
```

**背后的机制：**
```typescript
// consume() 内部实现
function consume(name: string): Implementation | null {
  const consumer: CapabilityConsumer = {
    capabilityName: name,
    implementation: undefined
  }
  
  // 1. 消费者记录到当前上下文
  context.consumers.set(name, consumer)
  
  // 2. 从当前上下文向上查找能力
  const provider = manager.getProvider(context, name)
  
  if (provider) {
    // 3. 找到能力，连接实现
    consumer.implementation = provider.implementation
    capabilityManager.connectCapability(provider, consumer, context)
    return consumer.implementation
  }
  
  // 4. 找不到，返回 null（支持延迟绑定）
  return null
}

// getProvider 查找逻辑
function getProvider(context: ComponentContext, name: string) {
  // 当前上下文查找
  const provider = context.providers.find(p => p.name === name)
  if (provider) return provider
  
  // 递归向父上下文查找
  if (context.parent) {
    return getProvider(context.parent, name)
  }
  
  return undefined
}
```

### 监听事件
```vue
<script setup lang="ts">
import { useSpark } from '@spark-view/spark-component'

const { consumeEvents } = useSpark(props.config)

// consumeEvents 内部使用 createEventCapabilityConsumer
// 来自 @spark-view/spark-utils
consumeEvents('events', {
  rowClick: (row) => {
    console.log('Row clicked:', row)
  },
  selectionChange: (selection) => {
    console.log('Selection changed:', selection)
  }
})
</script>
```

**背后的机制：**
```typescript
// consumeEvents 内部实现
import { createEventCapabilityConsumer } from '@spark-view/spark-utils'

function consumeEvents(name: string, handlers: Record<string, Function>) {
  const consumer = createEventCapabilityConsumer(name, handlers)
  const provider = manager.getProvider(context, name)
  
  if (provider) {
    // EventCapabilityConnector 自动连接 provider.on 和 consumer.handlers
    capabilityManager.connectCapability(provider, consumer, context)
  }
  
  return provider?.implementation
}
```

---

## 最佳实践

### ✅ 推荐做法

1. **早期提供**：在 `setup()` 或 `onMounted()` 中提供能力
2. **语义化命名**：使用清晰的能力名称（selection、dataSource）
3. **返回值**：方法返回有意义的值
4. **事件优先**：用事件通知状态变化
5. **类型安全**：定义 TypeScript 接口

```typescript
// 定义能力接口
interface SelectionCapability {
  getSelectedRows(): string[]
  selectRow(id: string): void
  clearSelection(): void
}

provide('selection', {
  getSelectedRows: () => selectedRows.value,
  selectRow: (id) => { /* ... */ },
  clearSelection: () => { selectedRows.value = [] }
} as SelectionCapability)
```

### ❌ 避免做法

1. ❌ 提供过于复杂的能力对象
2. ❌ 能力方法有副作用但不通知
3. ❌ 能力名称不明确（如 `data`、`manager`）
4. ❌ 在组件销毁后还保留引用

---

## 调试技巧

### 查看提供的能力
```typescript
const { context } = useSpark(props.config)
console.log('Provided capabilities:', context.providers)
```

### 监听能力注册
```typescript
const { whenAvailable } = useSpark(props.config)

whenAvailable('selection').then(provider => {
  console.log('Selection capability is ready:', provider)
})
```

### 日志输出
```typescript
const { logger } = useSpark(props.config)
logger.info('Capability provided:', 'selection')
```

---

## 总结

**SPARK 能力系统核心机制：**

1. **上下文抽象**：
   - **ComponentContext** 是独立的抽象概念
   - 不一定绑定到 Vue 组件（可以是逻辑上下文）
   - 支持：Vue 组件、逻辑服务、数据管理器、事件总线
   - 上下文类型：`component: Vue组件 | null（逻辑上下文）`

2. **上下文绑定**：
   - 每个上下文有独立的 `ComponentContext`
   - 能力存储在 `context.providers` 中
   - 消费者记录在 `context.consumers` 中
   - 上下文树管理能力的继承和查找

3. **查找机制**：
   - 从当前上下文开始向上查找
   - 支持跨层级访问（沿父链）
   - 支持逻辑上下文（无 UI）
   - 不支持兄弟节点访问

4. **生命周期**：
   - 上下文销毁时自动清理能力
   - 子上下文自动清理
   - 实例完全隔离
   - 逻辑上下文需要手动管理生命周期

5. **底层基础设施（@spark-view/spark-utils）**：
   - `CapabilityManager`: 通用能力管理器
   - `EventCapabilityProvider`: 标准事件能力提供者
   - `EventCapabilityConsumer`: 标准事件能力消费者
   - `CapabilityConnector`: 可扩展的连接器系统

6. **组件开发者使用**：
   - `provide(name, implementation)` - 提供能力（绑定到当前上下文）
   - `provideEvents()` - 提供事件能力
   - `consume(name)` - 消费能力（从父链查找）
   - `consumeEvents(name, handlers)` - 监听事件（自动连接）
   - `whenAvailable(name)` - 等待能力就绪（延迟绑定）

7. **自动化机制**：
   - 能力在运行时自动注册到上下文
   - 事件处理器自动连接/断开
   - 支持延迟绑定（late-binding）
   - 消费者可以先注册，提供者后提供

**其他组件消费：**
- 使用 `consume(name)` 获取能力（沿父链查找）
- 使用 `consumeEvents(name, handlers)` 监听事件（自动连接）
- 使用 `whenAvailable(name)` 等待能力就绪
