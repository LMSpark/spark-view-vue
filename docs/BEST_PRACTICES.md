# 代码质量与最佳实践

> 版本：1.0  
> 日期：2026-01-11

## 目录

1. [TypeScript 最佳实践](#typescript-最佳实践)
2. [Vue 3 组合式 API](#vue-3-组合式-api)
3. [性能优化建议](#性能优化建议)
4. [代码风格指南](#代码风格指南)
5. [安全性建议](#安全性建议)
6. [测试策略](#测试策略)

---

## TypeScript 最佳实践

### 1. 严格类型检查
项目已启用 TypeScript 严格模式：

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### 2. 类型定义规范

#### ✅ DO: 使用接口定义数据结构
```typescript
// 数据接口（纯属性）
export interface IDataTable {
  tableName: string
  columns: DataColumn[]
  rows: DataRow[]
}

// 实现类（属性 + 方法）
export class DataTable implements IDataTable {
  tableName: string
  columns: DataColumn[]
  rows: DataRow[] = []
  
  constructor(tableName: string, columns: DataColumn[]) {
    this.tableName = tableName
    this.columns = columns
  }
  
  addRow(row: DataRow): void {
    this.rows.push(row)
  }
}
```

#### ❌ DON'T: 避免使用 any
```typescript
// ❌ 不推荐
function processData(data: any) {
  return data.value
}

// ✅ 推荐
function processData<T extends { value: unknown }>(data: T) {
  return data.value
}
```

### 3. 泛型使用

```typescript
// 类型安全的数组操作
function getFirst<T>(array: T[]): T | undefined {
  return array[0]
}

// 类型约束
interface Identifiable {
  id: string | number
}

function findById<T extends Identifiable>(items: T[], id: string | number): T | undefined {
  return items.find(item => item.id === id)
}
```

### 4. 类型守卫

```typescript
// 自定义类型守卫
function isDataTable(obj: unknown): obj is IDataTable {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'tableName' in obj &&
    'columns' in obj &&
    'rows' in obj
  )
}

// 使用
function processTable(data: unknown) {
  if (isDataTable(data)) {
    // data 现在是 IDataTable 类型
    console.log(data.tableName)
  }
}
```

---

## Vue 3 组合式 API

### 1. Composables 最佳实践

```typescript
// composables/useDataSet.ts
import { ref, computed, onMounted } from 'vue'
import type { DataSet } from '@/models/dataSet'

export function useDataSet(dataSet: DataSet, tableName: string) {
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const table = computed(() => dataSet.getTable(tableName))
  
  async function loadData() {
    loading.value = true
    error.value = null
    
    try {
      await dataSet.requestTableData(tableName)
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }
  
  onMounted(() => {
    loadData()
  })
  
  return {
    loading,
    error,
    table,
    loadData
  }
}
```

### 2. 响应式数据处理

#### ✅ DO: 使用 reactive 和 ref
```typescript
import { ref, reactive, computed } from 'vue'

const count = ref(0)
const user = reactive({
  name: 'John',
  age: 30
})

const greeting = computed(() => `Hello, ${user.name}!`)
```

#### ❌ DON'T: 直接修改 props
```vue
<script setup>
// ❌ 不推荐
const props = defineProps<{ modelValue: string }>()
props.modelValue = 'new value' // 错误！

// ✅ 推荐
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
emit('update:modelValue', 'new value')
</script>
```

---

## 性能优化建议

### 1. 数据加载优化

#### 懒加载策略
```typescript
// ✅ 推荐：按需加载
export function useTreeLazyLoad(treeManager: TreeManager) {
  const loadNode = async (node: TreeNode) => {
    if (node.loaded) return
    
    const children = await treeManager.loadChildren(node.id)
    node.children = children
    node.loaded = true
  }
  
  return { loadNode }
}
```

#### 分页加载
```typescript
// ✅ 推荐：分页处理大数据集
interface PaginationConfig {
  pageIndex: number
  pageSize: number
  total: number
}

function paginateData<T>(data: T[], config: PaginationConfig): T[] {
  const start = config.pageIndex * config.pageSize
  const end = start + config.pageSize
  return data.slice(start, end)
}
```

### 2. Vue 组件优化

#### 使用 v-memo
```vue
<template>
  <div v-for="item in items" :key="item.id" v-memo="[item.id, item.updated]">
    <!-- 仅当 id 或 updated 改变时重新渲染 -->
    {{ item.name }}
  </div>
</template>
```

#### 异步组件
```typescript
import { defineAsyncComponent } from 'vue'

const HeavyComponent = defineAsyncComponent(() =>
  import('./HeavyComponent.vue')
)
```

### 3. DataSet 性能优化

#### 批量更新
```typescript
// ❌ 避免：多次单独更新
rows.forEach(row => {
  row.status = 'updated'
  dataSet.notifySubscribers(tableName) // 触发多次更新
})

// ✅ 推荐：批量更新后统一通知
rows.forEach(row => {
  row.status = 'updated'
})
dataSet.notifySubscribers(tableName) // 仅触发一次
```

#### 缓存计算结果
```typescript
import { computed } from 'vue'

// ✅ 使用 computed 缓存昂贵的计算
const filteredData = computed(() => {
  return dataSet.getTable('Users').rows.filter(row => row.active)
})
```

---

## 代码风格指南

### 1. 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `DataSet`, `BindingContext` |
| 文件名 | camelCase | `dataSet.ts`, `bindingContext.ts` |
| 函数/方法 | camelCase | `getData()`, `setCurrentRow()` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 接口 | I前缀 + PascalCase | `IDataTable`, `IDataSet` |
| 类型别名 | PascalCase | `DataRow`, `FilterExpression` |

### 2. 函数设计原则

#### 单一职责
```typescript
// ❌ 函数做了太多事情
function processUserData(user: User) {
  validateUser(user)
  saveToDatabase(user)
  sendEmail(user)
  logActivity(user)
}

// ✅ 拆分为多个单一职责函数
function validateUser(user: User): boolean { /* ... */ }
function saveUser(user: User): Promise<void> { /* ... */ }
function notifyUser(user: User): Promise<void> { /* ... */ }
function logUserActivity(user: User): void { /* ... */ }
```

#### 函数参数限制
```typescript
// ❌ 参数过多
function createTable(
  name: string,
  columns: Column[],
  rows: DataRow[],
  pagination: Pagination,
  sorting: Sorting,
  filtering: Filtering
) { /* ... */ }

// ✅ 使用配置对象
interface TableConfig {
  name: string
  columns: Column[]
  rows?: DataRow[]
  pagination?: Pagination
  sorting?: Sorting
  filtering?: Filtering
}

function createTable(config: TableConfig) { /* ... */ }
```

### 3. 注释规范

```typescript
/**
 * 设置当前选中行
 * 
 * @param row - 要设置的行数据，null 表示取消选中
 * @param skipNotify - 是否跳过通知订阅者，默认 false
 * 
 * @example
 * ```typescript
 * context.setCurrentRow(userData, false)
 * ```
 * 
 * @remarks
 * - 自动触发关联表的更新
 * - 触发 currentRowChanged 事件
 * - 使用引用相等性检查避免重复更新
 */
setCurrentRow(row: DataRow | null, skipNotify: boolean = false): void {
  // 实现...
}
```

---

## 安全性建议

### 1. 输入验证

```typescript
// ✅ 验证用户输入
function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // 移除潜在的 XSS 字符
    .slice(0, 1000) // 限制长度
}
```

### 2. 避免 XSS

```vue
<template>
  <!-- ❌ 危险：直接渲染 HTML -->
  <div v-html="userInput"></div>
  
  <!-- ✅ 安全：文本插值自动转义 -->
  <div>{{ userInput }}</div>
  
  <!-- ✅ 必须渲染 HTML 时，先消毒 -->
  <div v-html="sanitizeHtml(userInput)"></div>
</template>
```

### 3. API 调用安全

```typescript
// ✅ 使用 HTTPS
const API_BASE_URL = import.meta.env.PROD 
  ? 'https://api.example.com'
  : 'http://localhost:3000'

// ✅ 添加请求超时
async function fetchData(url: string, timeout = 5000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, { signal: controller.signal })
    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}
```

---

## 测试策略

### 1. 单元测试（Vitest）

```typescript
// tests/models/dataSet.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { DataSet } from '@/models/dataSet'

describe('DataSet', () => {
  let dataSet: DataSet
  
  beforeEach(() => {
    dataSet = new DataSet({
      dataSetName: 'test',
      tables: [
        {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          rows: []
        }
      ],
      relations: []
    })
  })
  
  it('should create table instance', () => {
    const table = dataSet.getTable('Users')
    expect(table).toBeDefined()
    expect(table.tableName).toBe('Users')
  })
  
  it('should add row to table', () => {
    const table = dataSet.getTable('Users')
    table.rows.push({ id: 1, name: 'John' })
    expect(table.rows.length).toBe(1)
  })
})
```

### 2. 组件测试

```typescript
// tests/views/DynamicPage.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DynamicPage from '@/views/DynamicPage.vue'

describe('DynamicPage', () => {
  it('should render dynamic form', () => {
    const wrapper = mount(DynamicPage)
    expect(wrapper.find('.dynamic-page').exists()).toBe(true)
  })
})
```

### 3. E2E 测试（Playwright）

```typescript
// tests/e2e/home.spec.ts
import { test, expect } from '@playwright/test'

test('home page loads correctly', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page.locator('h1')).toContainText('Welcome')
})
```

---

## 代码审查清单

### 提交前检查

- [ ] 所有 TypeScript 类型检查通过 (`npm run typecheck`)
- [ ] ESLint 检查通过 (`npm run lint`)
- [ ] 单元测试通过 (`npm run test`)
- [ ] 代码已格式化 (Prettier)
- [ ] 无 console.log 调试代码
- [ ] 添加了必要的注释和文档
- [ ] 更新了相关的 README 或文档

### 代码审查关注点

1. **正确性**: 逻辑是否正确？边界情况是否处理？
2. **性能**: 是否有性能瓶颈？O(n²) 算法是否可优化？
3. **可读性**: 代码是否易于理解？命名是否清晰？
4. **可维护性**: 是否遵循 SOLID 原则？耦合度是否低？
5. **安全性**: 是否存在安全隐患？输入是否验证？
6. **测试覆盖**: 是否有足够的测试？关键路径是否覆盖？

---

## 持续改进建议

### 短期目标（1-2 周）
- ✅ 统一代码风格和命名规范
- ✅ 完善项目文档
- ⏳ 添加单元测试（目标覆盖率 60%+）
- ⏳ 性能基准测试和优化

### 中期目标（1-3 个月）
- 集成 E2E 测试框架（Playwright）
- 添加 CI/CD 流程
- 性能监控和告警
- 错误追踪集成（Sentry）

### 长期目标（3-6 个月）
- 微前端架构探索
- 国际化 (i18n) 支持
- 无障碍访问 (A11y) 优化
- 渐进式 Web 应用 (PWA)

---

## 参考资源

- [Vue 3 风格指南](https://vuejs.org/style-guide/)
- [TypeScript 最佳实践](https://github.com/typescript-eslint/typescript-eslint)
- [Airbnb JavaScript 风格指南](https://github.com/airbnb/javascript)
- [Google TypeScript 风格指南](https://google.github.io/styleguide/tsguide.html)
- [SOLID 原则](https://en.wikipedia.org/wiki/SOLID)
