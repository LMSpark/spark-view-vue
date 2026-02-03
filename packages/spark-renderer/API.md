# @spark-view/spark-renderer API 文档

## 目录

- [组件](#组件)
- [Composables](#composables)
- [类型定义](#类型定义)
- [工具函数](#工具函数)
- [命名空间 API](#命名空间-api)

---

## 组件

### PageRenderer

页面渲染引擎核心组件，负责将配置化页面渲染为 Vue 组件。

#### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| configLoader | ConfigLoader | 否 | - | 配置加载器（与 pageConfig 二选一） |
| pageId | string | 否 | - | 页面 ID（优先级最高） |
| pageConfig | PageConfig | 否 | - | 页面配置（直接传入，跳过加载） |
| formCreateOptions | Record<string, unknown> | 否 | {} | FormCreate 选项 |
| enableCssScope | boolean | 否 | true | 是否启用 CSS 隔离 |
| enableDataSet | boolean | 否 | true | 是否启用 DataSet 自动初始化 |
| beforeLoad | (pageId: string) => void \| Promise<void> | 否 | - | 页面加载前钩子 |
| afterLoad | (config: PageConfig) => void \| Promise<void> | 否 | - | 页面加载后钩子 |
| onError | (error: Error) => void | 否 | - | 错误处理 |

#### 插槽

| 插槽名 | 参数 | 说明 |
|-------|------|------|
| loading | - | 自定义加载状态显示 |
| error | { error: string } | 自定义错误显示 |
| content | { rules: Rule[], pageData: Record } | 自定义内容渲染 |

#### Expose 方法

| 方法 | 类型 | 说明 |
|------|------|------|
| reload | () => Promise<void> | 重新加载页面 |
| rebindRules | () => void | 重新绑定规则 |
| pageContext | PageContext | 访问页面上下文 |
| formApi | Ref<FormCreateAPI \| null> | 访问表单 API |
| dataSet | Ref<IDataSet \| null> | 访问数据集 |

#### 使用示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { PageRenderer } from '@spark-view/spark-renderer'
import { configLoader } from '@/router'

const pageRef = ref()

const handleReload = () => {
  pageRef.value?.reload()
}
</script>

<template>
  <div>
    <el-button @click="handleReload">重新加载</el-button>
    <PageRenderer 
      ref="pageRef"
      :config-loader="configLoader"
      :enable-css-scope="true"
      @before-load="(pageId) => console.log('Loading:', pageId)"
    >
      <template #loading>
        <el-icon class="is-loading"><Loading /></el-icon>
        加载中...
      </template>
    </PageRenderer>
  </div>
</template>
```

---

## Composables

### useCssScope

CSS 作用域隔离 Hook。

#### 类型签名

```typescript
function useCssScope(options: UseCssScopeOptions): {
  scopedCss: Ref<string>
  setScopedCss: (css: string) => void
}

interface UseCssScopeOptions {
  pageId: string
  enableScope?: boolean
}
```

#### 参数

- `pageId` - 页面 ID，用于生成唯一的作用域前缀
- `enableScope` - 是否启用作用域（默认 true）

#### 返回值

- `scopedCss` - 处理后的 CSS 字符串（响应式）
- `setScopedCss` - 设置 CSS 内容的方法

#### 使用示例

```typescript
import { useCssScope } from '@spark-view/spark-renderer'

const { scopedCss, setScopedCss } = useCssScope({ 
  pageId: 'home',
  enableScope: true 
})

// 设置样式
setScopedCss(`
  .button {
    color: red;
  }
`)

// scopedCss.value 输出:
// [data-page="home"] .button { color: red; }
```

### usePageDataSet

DataSet 管理 Hook。

#### 类型签名

```typescript
function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn

interface UsePageDataSetOptions {
  pageData: Record<string, unknown>
  context: PageContext
  originalRules?: Ref<Rule[]>
  formApi?: Ref<FormCreateAPI | null>
  enableDataSet?: boolean
  dataLoader?: (tableName: string) => Promise<DataRow[]>
}

interface UsePageDataSetReturn {
  dataSet: Ref<IDataSet | null>
  initDataSet: () => void
  autoSubscribeTables: () => void
  clearDataSet: () => void
}
```

#### 参数

- `pageData` - 页面数据对象（响应式）
- `context` - 页面上下文
- `originalRules` - 原始规则数组（可选）
- `formApi` - FormCreate API（可选）
- `enableDataSet` - 是否启用 DataSet（默认 true）
- `dataLoader` - 自定义数据加载器（可选）

#### 返回值

- `dataSet` - DataSet 实例（响应式）
- `initDataSet` - 初始化 DataSet
- `autoSubscribeTables` - 自动订阅表数据变化
- `clearDataSet` - 清除 DataSet

#### 使用示例

```typescript
import { usePageDataSet } from '@spark-view/spark-renderer'

const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
  pageData,
  context: pageContext,
  originalRules,
  formApi,
  enableDataSet: true,
  dataLoader: async (tableName) => {
    // 自定义数据加载逻辑
    const response = await fetch(`/api/${tableName}`)
    return response.json()
  }
})

// 初始化
initDataSet()

// 自动订阅
await nextTick()
autoSubscribeTables()
```

### useRuleBinding

Rule 数据绑定 Hook。

#### 类型签名

```typescript
function useRuleBinding(options: UseRuleBindingOptions): {
  boundRules: Ref<Rule[]>
  rebindRules: () => void
}

interface UseRuleBindingOptions {
  originalRules: Ref<Rule[]>
  pageData: Record<string, unknown>
  pageFunctions: Ref<Record<string, Function>>
  dataSet: Ref<IDataSet | null>
  formApi: Ref<FormCreateAPI | null>
}
```

#### 参数

- `originalRules` - 原始规则数组
- `pageData` - 页面数据对象
- `pageFunctions` - 页面脚本函数
- `dataSet` - DataSet 实例
- `formApi` - FormCreate API

#### 返回值

- `boundRules` - 绑定后的规则数组（响应式）
- `rebindRules` - 重新绑定规则的方法

#### 使用示例

```typescript
import { useRuleBinding } from '@spark-view/spark-renderer'

const { boundRules, rebindRules } = useRuleBinding({
  originalRules,
  pageData,
  pageFunctions,
  dataSet,
  formApi
})

// 数据变化时重新绑定
watch(pageData, () => {
  rebindRules()
})
```

---

## 类型定义

### Rule

页面规则配置。

```typescript
interface Rule {
  type: string                              // 组件类型
  name?: string                             // 组件名称
  props?: Record<string, unknown>           // 组件属性
  children?: (Rule | string)[]              // 子元素
  style?: Record<string, string | number>   // 样式
  class?: string | string[]                 // CSS 类
  on?: Record<string, Function | string>    // 事件处理器
  slots?: Record<string, Rule[]>            // 插槽
  dataKey?: string                          // 数据绑定键
  contextId?: string                        // 上下文 ID
  render?: Function                         // 自定义渲染函数
  [key: string]: unknown                    // 其他属性
}
```

### FormCreateAPI

FormCreate API 接口。

```typescript
interface FormCreateAPI {
  rule: Rule[]
  formData(): Record<string, unknown>
  setValue(field: string, value: unknown): void
  getValue(field: string): unknown
  el(name: string): HTMLElement | null
  [key: string]: unknown
}
```

### PageContext

页面脚本运行时上下文。

```typescript
interface PageContext {
  $api: FormCreateAPI | null                // FormCreate API
  $route: RouteLocationNormalizedLoaded     // Vue Router 当前路由
  $data: Record<string, unknown>            // 页面数据（响应式）
  $el: () => HTMLElement | null             // 页面容器元素
  $query: (selector: string) => HTMLElement | null  // 查询单个元素
  $queryAll: (selector: string) => NodeListOf<Element>  // 查询所有元素
  $rebindRules: () => void                  // 重新绑定规则
  $refreshData: (key?: string) => Promise<void>  // 刷新数据
  $dataSet: IDataSet | null                 // DataSet 实例
}
```

### PageConfig

页面配置。

```typescript
interface PageConfig {
  pageId: string                            // 页面 ID
  rule: Rule[]                              // 规则数组
  data: Record<string, unknown>             // 页面数据
  style?: string                            // 页面样式
  script?: Record<string, Function>         // 页面脚本
}
```

### PageRendererOptions

PageRenderer 组件选项。

```typescript
interface PageRendererOptions {
  configLoader?: ConfigLoader
  pageId?: string
  pageConfig?: PageConfig
  formCreateOptions?: Record<string, unknown>
  enableCssScope?: boolean
  enableDataSet?: boolean
  beforeLoad?: (pageId: string) => void | Promise<void>
  afterLoad?: (config: PageConfig) => void | Promise<void>
  onError?: (error: Error) => void
}
```

---

## 工具函数

### scopeCSS

为 CSS 添加作用域前缀（内部使用，不导出）。

```typescript
function scopeCSS(options: { pageId: string; css: string }): string
```

### bindDataToRules

绑定数据到规则（内部使用，不导出）。

```typescript
function bindDataToRules(options: RuleBindingOptions): Rule[]
```

### compileFunctions

编译脚本函数（内部使用，不导出）。

```typescript
function compileFunctions(
  scriptText: string,
  context: PageContext,
  functionNames: string[]
): Record<string, Function>
```

---

## 命名空间 API

### SparkRenderer

统一的命名空间 API。

```typescript
const SparkRenderer = {
  // 组件
  PageRenderer: Component,
  
  // Composables
  composables: {
    useCssScope: Function,
    usePageDataSet: Function,
    useRuleBinding: Function
  }
}
```

#### 使用示例

```typescript
import { SparkRenderer } from '@spark-view/spark-renderer'

// 访问组件
const { PageRenderer } = SparkRenderer

// 访问 Composables
const { useCssScope, usePageDataSet, useRuleBinding } = SparkRenderer.composables
```

---

## 最佳实践

### 1. 使用 ConfigLoader

推荐使用 ConfigLoader 加载配置，而不是直接传入配置对象：

```vue
<template>
  <!-- ✅ 推荐 -->
  <PageRenderer :config-loader="configLoader" />
  
  <!-- ❌ 不推荐（除非特殊场景） -->
  <PageRenderer :page-config="config" />
</template>
```

### 2. 自定义插槽

充分利用插槽自定义 UI：

```vue
<template>
  <PageRenderer :config-loader="configLoader">
    <template #loading>
      <el-skeleton :rows="5" animated />
    </template>
    
    <template #error="{ error }">
      <el-result
        icon="error"
        title="加载失败"
        :sub-title="error"
      >
        <template #extra>
          <el-button @click="reload">重试</el-button>
        </template>
      </el-result>
    </template>
  </PageRenderer>
</template>
```

### 3. 使用 Expose 方法

通过 ref 访问组件方法：

```vue
<script setup lang="ts">
const pageRef = ref()

const handleAction = () => {
  // 访问 pageContext
  console.log(pageRef.value?.pageContext.$data)
  
  // 访问 dataSet
  console.log(pageRef.value?.dataSet?.tables)
  
  // 重新加载
  pageRef.value?.reload()
}
</script>

<template>
  <PageRenderer ref="pageRef" />
</template>
```

### 4. DataSet 初始化

正确初始化和订阅 DataSet：

```typescript
const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
  pageData,
  context,
  originalRules,
  formApi
})

// 初始化
initDataSet()

// 等待 DOM 渲染完成再订阅
await nextTick()
autoSubscribeTables()
```

### 5. 错误处理

使用 onError 回调处理错误：

```vue
<template>
  <PageRenderer
    :config-loader="configLoader"
    :on-error="handleError"
  />
</template>

<script setup lang="ts">
const handleError = (error: Error) => {
  console.error('页面加载失败:', error)
  ElMessage.error(error.message)
}
</script>
```

---

## 常见问题

### Q: PageRenderer 和 DynamicPage 有什么区别？

A: 
- `PageRenderer` 是纯渲染组件，不包含路由逻辑
- `DynamicPage` 是应用层组件，包含路由参数解析和导航
- 推荐在路由视图中使用 `PageRenderer`，在独立场景中使用 `PageRenderer`

### Q: 如何禁用 CSS 隔离？

A: 设置 `enableCssScope` 为 `false`：

```vue
<PageRenderer :enable-css-scope="false" />
```

### Q: 如何禁用 DataSet？

A: 设置 `enableDataSet` 为 `false`：

```vue
<PageRenderer :enable-data-set="false" />
```

### Q: 页面脚本如何访问上下文？

A: 通过沙箱注入的全局变量：

```javascript
// script.js
function handleClick() {
  // 访问页面数据
  const pageData = $data
  
  // 访问 FormCreate API
  const value = $api?.getValue('field')
  
  // 访问 DataSet
  const users = $dataSet?.tables.Users.rows
  
  // 访问 DOM
  const el = $el()
}
```

### Q: 如何注册自定义数据加载器？

A: 在页面脚本的 `__init__` 函数中注册：

```javascript
// script.js
function __init__() {
  const dataSet = $dataSet
  
  if (dataSet) {
    dataSet.dataLoader = async (tableName) => {
      const response = await fetch(`/api/${tableName}`)
      return response.json()
    }
  }
}
```

---

## 相关文档

- [README.md](./README.md) - 项目概览和快速开始
- [INTEGRATION.md](./INTEGRATION.md) - L1/L2 集成说明
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实现总结
- [@spark-view/spark-core](../spark-core/API.md) - 组件系统 API
- [@spark-view/spark-data](../spark-data/API.md) - 数据空间 API
- [@spark-view/spark-page-config](../spark-page-config/API.md) - 配置层 API
