# @spark-view/spark-renderer API 文档

<!-- markdownlint-disable MD024 MD033 MD009 -->

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
}

interface UsePageDataSetReturn {
  dataSet: Ref<IDataSet | null>
  initDataSet: () => void
  clearDataSet: () => void
}
```

#### 参数

- `pageData` - 页面数据对象（响应式）
- `context` - 页面上下文
- `originalRules` - 原始规则数组（可选）
- `formApi` - FormCreate API（可选）
- `enableDataSet` - 是否启用 DataSet（默认 true）

#### 返回值

- `dataSet` - DataSet 实例（响应式）
- `initDataSet` - 初始化 DataSet
- `clearDataSet` - 清除 DataSet

#### 使用示例

```typescript
import { usePageDataSet } from '@spark-view/spark-renderer'

const { dataSet, initDataSet } = usePageDataSet({
  pageData,
  context: pageContext,
  originalRules,
  formApi,
  enableDataSet: true,
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

FormCreate 官方 Rule 类型（运行时）。

```typescript
// 直接导入 FormCreate 官方类型
import type { Rule as FormCreateRule } from '@form-create/element-ui'
export type Rule = FormCreateRule

// 包含完整的 FormCreate 类型系统（泛型支持）
```

**说明**：
- 这是 FormCreate 的官方类型，提供完整的类型安全
- 用于运行时（PageRenderer 渲染时）
- 不用于配置文件（配置文件使用简化的 `RuleConfig`）

### RuleConfig

配置层 Rule 类型（配置文件）。

```typescript
interface RuleConfig {
  type: string                              // 组件类型
  field?: string                            // 字段名
  title?: string                            // 标题
  props?: Record<string, unknown>           // 组件属性
  children?: RuleConfig[]                   // 子元素
  on?: Record<string, string | Function>    // 事件（支持字符串引用）
  dataKey?: string                          // 数据绑定键（DataKey @ 格式）
  [key: string]: unknown                    // 其他属性
}
```

**说明**：
- 用于配置文件（rule.json、pagedata.json）
- 简化的类型，支持字符串函数引用（`"click": "handleClick"`）
- `dataKey` 使用统一的 DataKey @ 格式：`scope@tableName@viewId@field`
  - 完整格式：`MyApp@Users@grid@rows`
  - 简写（viewId 默认 default）：`MyApp@Users@rows`
  - field 可选值：`rows` | `currentRow` | `selectedRows`
  - 当 `field === 'rows'` 时，渲染层会把目标 `DataView` 规范化为 `IDataSource`（{ rows, total, page, pageSize }）；
    - `el-table` / 渲染器会把 `dataSource.rows` 绑定到组件的 `data`，并同时把完整的 `dataSource` 放入 `props.dataSource`（`props.dataSource` **为 DataView 实例**，因为 DataView 结构兼容 `IDataSource`）。
    - 额外注入：若 DataKey 指向 DataSet，则会把对应的 `DataView` 实例注入到 `props.dataView`（可用于调用 `loadFromServer()`、`setSelectedRows()` 等方法）。
  - 非 DataSet 键（如 `settings.siteName`）回落到 pageData 路径
- 在 PageRenderer 加载时会转换为 `Rule` 类型

**类型转换**：
```typescript
// 配置层 → 运行时
const rules = (config.rule || []) as unknown as Rule[]
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
  rule: RuleConfig[]                        // 规则数组（配置层类型）
  data: Record<string, unknown>             // 页面数据
  style?: string                            // 页面样式（CSS 文本）
  script?: string                           // 页面脚本（JS 文本）
}
```

**重要说明**：
- `rule` 使用 `RuleConfig[]` 类型（配置层）
- `script` 是字符串类型（纯 JS 代码文本），不是函数对象
- 脚本编译由 `compileFunctions` 处理

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

### extractFunctionNames

从 rules 中提取需要的函数名（内部使用）。

```typescript
function extractFunctionNames(rules: unknown): string[]
```

**功能**：扫描 rules 树，提取所有事件处理器函数名和 `Render*` 组件类型。

**提取规则**：
1. 扫描 `on` 对象中值为字符串的属性（`"click": "handleClick"`）
2. 检测 `type` 以 `Render` 开头的组件（`RenderButton`、`RenderCustom`）
3. 递归扫描 `children` 数组

**返回**：去重后的函数名数组

**示例**：
```typescript
const rules = [
  {
    type: 'el-button',
    on: { click: 'handleClick' },
    children: [
      {
        type: 'RenderCustom',  // 提取组件类型
        on: { submit: 'handleSubmit' }
      }
    ]
  }
]

extractFunctionNames(rules)
// → ['handleClick', 'RenderCustom', 'handleSubmit']
```

### getRequiredFunctionNames

获取完整的需要函数名列表（内部使用）。

```typescript
function getRequiredFunctionNames(
  rules: unknown,
  additionalNames: string[] = ['__init__']
): string[]
```

**功能**：在 `extractFunctionNames` 基础上添加额外函数（如 `__init__`）。

**参数**：
- `rules` - 规则树
- `additionalNames` - 额外函数名（默认包含 `__init__`）

**返回**：完整函数名数组

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

**功能**：使用 Function 构造器编译脚本，按需返回指定函数。

**编译策略**：
```typescript
// 1. 构建返回语句
const returnStatement = `\nreturn { ${functionNames.join(', ')} }`

// 2. 拼接完整脚本
const fullScript = scriptText + returnStatement

// 3. 创建函数并执行
const func = new Function('$api', '$route', '$data', ..., fullScript)
return func(context.$api, context.$route, context.$data, ...)
```

**参数**：
- `scriptText` - 原始脚本文本（纯函数定义，无 export）
- `context` - 页面上下文（提供 $api、$route 等变量）
- `functionNames` - 需要返回的函数名列表

**返回**：函数对象（`{ handleClick: fn, __init__: fn, ... }`）

**脚本格式要求**：
```javascript
// ✅ 正确：普通函数定义
function handleClick() { ... }
function __init__() { ... }

// ❌ 错误：不支持 export
export function handleClick() { ... }
export default { ... }
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

### Q: PageRenderer 的职责是什么？

A: 
- `PageRenderer` 是纯渲染组件，专注于将页面配置渲染为 Vue 组件
- 不包含路由参数解析和导航逻辑，这些应该在应用层实现
- 推荐在路由视图中直接使用 `PageRenderer`

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

A: 数据加载现在通过 DataView 的 CRUD API 完成：

```javascript
// script.js
function __init__() {
  const dataSet = $dataSet
  
  if (dataSet) {
    // 通过视图的 loadFromServer() 加载数据
    const view = dataSet.getView('Users', 'default')
    view?.loadFromServer()
  }
}
```

---

## 相关文档

- [README.md](./README.md) - 项目概览和快速开始
- [INTEGRATION.md](./INTEGRATION.md) - L1/L2 集成说明
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实现总结
- [@spark-view/spark-component](../spark-component/API.md) - 组件系统 API
- [@spark-view/spark-data](../spark-data/API.md) - 数据空间 API
- [@spark-view/spark-page-config](../spark-page-config/API.md) - 配置层 API
