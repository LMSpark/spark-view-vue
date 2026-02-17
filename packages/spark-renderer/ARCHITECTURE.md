# @spark-view/spark-renderer 包结构说明

## 📁 目录结构

```
packages/spark-renderer/
├── src/
│   ├── components/
│   │   └── PageRenderer.vue          # 核心渲染组件
│   ├── composables/
│   │   ├── useCssScope.ts            # CSS 作用域隔离
│   │   ├── usePageDataSet.ts         # DataSet 管理
│   │   └── useRuleBinding.ts         # Rule 数据绑定
│   ├── utils/
│   │   ├── createSandbox.ts          # 脚本沙箱（compileFunctions）
│   │   ├── bindRules.ts              # Rule 绑定逻辑
│   │   └── scopeCSS.ts               # CSS 作用域工具
│   ├── types/
│   │   └── index.ts                  # 类型定义
│   ├── index.ts                      # 包入口（公共 API）
│   ├── namespace.ts                  # SparkRenderer 命名空间
│   └── shims-vue.d.ts                # Vue 类型扩展
├── dist/                             # 构建输出
├── API.md                            # API 文档
├── README.md                         # 项目说明
├── INTEGRATION.md                    # L1/L2 集成说明
├── IMPLEMENTATION_SUMMARY.md         # 实现总结
├── package.json                      # 包配置
└── tsconfig.json                     # TypeScript 配置
```

## 📦 公共 API（index.ts）

### 导出内容

```typescript
// 组件
export { default as PageRenderer } from './components/PageRenderer.vue'

// Composables
export { useCssScope } from './composables/useCssScope'
export { usePageDataSet } from './composables/usePageDataSet'
export { useRuleBinding } from './composables/useRuleBinding'

// 类型
export type {
  Rule,
  FormCreateAPI,
  PageContext,
  PageConfig,
  PageRendererOptions,
  RuleBindingOptions
} from './types'

// 命名空间
export { SparkRenderer } from './namespace'
```

### 内部使用（不导出）

以下功能仅供内部使用，不对外暴露：

- `scopeCSS` - CSS 作用域添加（由 useCssScope 内部使用）
- `removeScopedStyle` - 清理作用域样式（由 useCssScope 内部使用）
- `compileFunctions` - 脚本编译（由 PageRenderer 内部使用）
- `bindDataToRules` - Rule 绑定（由 useRuleBinding 内部使用）

## 🧩 组件层（components/）

### PageRenderer.vue

**职责**：
- 页面配置加载
- DataSet 初始化
- CSS 作用域应用
- 脚本沙箱执行
- Rule 绑定和渲染

**核心流程**：
```
加载配置 → 初始化 DataSet → 执行脚本 → 绑定 Rule → 渲染组件
```

**依赖**：
- L1: `pageLogger`, `ErrorCodes`, `getErrorMessage`
- L2: `ConfigLoader`
- Composables: `useCssScope`, `usePageDataSet`, `useRuleBinding`
- Utils: `compileFunctions`

## 🎣 Composables 层（composables/）

### useCssScope.ts

**职责**：CSS 作用域隔离

**输入**：
- `pageId` - 页面 ID
- `enableScope` - 是否启用

**输出**：
- `scopedCss` - 处理后的 CSS
- `setScopedCss` - 设置 CSS 方法

**实现**：
```typescript
const { scopedCss, setScopedCss } = useCssScope({ pageId, enableScope })

// 内部调用 scopeCSS 工具添加前缀
scopedCss.value = enableScope 
  ? scopeCSS({ pageId, css })
  : css
```

### usePageDataSet.ts

**职责**：DataSet 管理

**输入**：
- `pageData` - 页面数据对象
- `context` - 页面上下文
- `originalRules` - 原始规则
- `formApi` - FormCreate API
- `enableDataSet` - 是否启用
- `dataLoader` - 数据加载器（可选）

**输出**：
- `dataSet` - DataSet 实例
- `initDataSet` - 初始化方法
- `autoSubscribeTables` - 自动订阅方法
- `clearDataSet` - 清理方法

**实现要点**：
- 使用 `DataSetManager.create` 创建实例
- 自动订阅 el-table 的 dataKey（DataKey @ 格式）对应的表和视图
- 监听 currentRow 和 selectedRows 变化
- 组件卸载时清理订阅

### useRuleBinding.ts

**职责**：Rule 数据绑定

**输入**：
- `originalRules` - 原始规则
- `pageData` - 页面数据
- `pageFunctions` - 页面脚本函数
- `dataSet` - DataSet 实例
- `formApi` - FormCreate API

**输出**：
- `boundRules` - 绑定后的规则
- `rebindRules` - 重新绑定方法

**实现**：
```typescript
const rebindRules = () => {
  boundRules.value = bindDataToRules({
    rules: originalRules.value,
    pageData,
    pageFunctions: pageFunctions.value,
    dataSet: dataSet.value,
    formApi: formApi.value
  })
}
```

## 🛠️ Utils 层（utils/）

### extractFunctionNames.ts

**核心函数**：`extractFunctionNames`、`getRequiredFunctionNames`

**职责**：从 rules 树中提取需要的函数名

**签名**：
```typescript
function extractFunctionNames(rules: unknown): string[]
function getRequiredFunctionNames(
  rules: unknown,
  additionalNames?: string[]
): string[]
```

**提取规则**：
1. 扫描 `on` 对象中值为字符串的属性（`"click": "handleClick"`）
2. 检测 `type` 以 `Render` 开头的组件（`RenderButton`、`RenderCustom`）
3. 递归扫描 `children` 数组
4. 去重并返回

**示例**：
```typescript
const rules = [
  {
    type: 'el-button',
    on: { click: 'handleClick' },
    children: [{ type: 'RenderCustom', on: { submit: 'handleSubmit' } }]
  }
]

extractFunctionNames(rules)
// → ['handleClick', 'RenderCustom', 'handleSubmit']

getRequiredFunctionNames(rules)
// → ['handleClick', 'RenderCustom', 'handleSubmit', '__init__']
```

### createSandbox.ts

**核心函数**：`compileFunctions`

**职责**：编译页面脚本为可执行函数

**签名**：
```typescript
function compileFunctions(
  scriptText: string,
  context: PageContext,
  functionNames: string[]
): Record<string, Function>
```

**编译策略**（"统一编译，按需返回"）：
```typescript
// 1. 构建返回语句
const returnStatement = `\nreturn { ${functionNames.join(', ')} }`

// 2. 拼接完整脚本
const fullScript = scriptText + returnStatement

// 3. 创建函数并执行
const func = new Function('$api', '$route', '$data', ..., fullScript)
return func(context.$api, context.$route, context.$data, ...)
```

**上下文变量**：
- `$api` - FormCreate API
- `$route` - Vue Router
- `$data` - 页面数据
- `$el` - 容器元素
- `$query` / `$queryAll` - DOM 查询
- `$dataSet` - DataSet 实例
- `$rebindRules` - 重新绑定方法
- `$refreshData` - 刷新数据方法

**脚本格式要求**：
```javascript
// ✅ 正确：普通函数定义
function handleClick() { ... }
function __init__() { ... }

// ❌ 错误：不支持 export
export function handleClick() { ... }
```

**实现原理**：
```typescript
// 使用 Function 构造器创建沙箱
const func = new Function(
  '$api',
  '$route',
  '$data',
  '$el',
  '$query',
  '$queryAll',
  '$dataSet',
  '$rebindRules',
  '$refreshData',
  fullScript
)

// 执行并返回函数对象
return func(
  context.$api,
  context.$route,
  context.$data,
  // ...
)
```

### bindRules.ts

**核心函数**：`bindDataToRules`

**职责**：绑定数据和事件到规则

**处理逻辑**：
1. 处理自定义渲染函数（`Render*` 开头的 type）
2. 将事件处理器字符串转换为函数引用
3. 为 el-table 自动注入 DataSet 同步事件
4. 递归处理子元素

**关键功能**：
- `injectTableEvents` - 为表格注入 `currentChange` 和 `selectionChange` 事件
- `syncSelectedRowsToTable` - 同步选中行到表格 UI

### scopeCSS.ts

**核心函数**：`scopeCSS`

**职责**：为 CSS 添加作用域前缀

**实现**：
```typescript
// 输入: .button { color: red; }
// 输出: [data-page="home"] .button { color: red; }

return css.replace(
  /([^{}]+)\{([^}]*)\}/g,
  (match, selector, rules) => {
    const selectors = selector.split(',').map(s => {
      return `[data-page="${pageId}"] ${s.trim()}`
    })
    return `${selectors.join(', ')} {${rules}}`
  }
)
```

**辅助函数**：
- `createScopedStyleElement` - 创建带作用域的 style 元素
- `removeScopedStyle` - 移除页面样式

## 📝 类型层（types/）

### 核心类型

#### Rule（运行时类型）

FormCreate 官方 Rule 类型，用于运行时渲染。

```typescript
import type { Rule as FormCreateRule } from '@form-create/element-ui'
export type Rule = FormCreateRule
```

**特点**：
- 直接使用 FormCreate 官方类型
- 完整的泛型支持和类型安全
- 用于 PageRenderer 渲染和 bindRules

#### RuleConfig（配置层类型）

简化的配置层类型，用于 JSON 配置文件。

```typescript
interface RuleConfig {
  type: string
  field?: string
  props?: Record<string, unknown>
  children?: RuleConfig[]
  on?: Record<string, string | Function>  // 支持字符串引用
  dataKey?: string                        // DataKey @ 格式
  [key: string]: unknown
}
```

**特点**：
- 简化的结构，易于编写配置
- 支持字符串函数引用（`"click": "handleClick"`）
- 用于 `PageConfig.rule` 类型声明

#### 类型转换边界

```typescript
// PageRenderer.vue 中的转换
interface PageConfig {
  rule: RuleConfig[]  // 配置层
  // ...
}

// 使用时转换为运行时类型
const rules = (config.rule || []) as unknown as Rule[]
```

**转换时机**：PageRenderer 加载配置后，绑定数据前。

#### FormCreateAPI
FormCreate 提供的表单 API 接口。

```typescript
interface FormCreateAPI {
  formData(): Record<string, unknown>
  setValue(field: string, value: unknown): void
  getValue(field: string): unknown
  // ...更多方法
}
```

#### PageContext
页面脚本运行时上下文，包含沙箱注入的所有变量。

```typescript
interface PageContext {
  $api: FormCreateAPI | null
  $route: RouteLocationNormalizedLoaded
  $data: Record<string, unknown>
  $el: () => HTMLElement | null
  $dataSet: IDataSet | null
  $rebindRules: () => void
  // ...
}
```

#### PageConfig
页面配置，包含 rule、data、style、script。

```typescript
interface PageConfig {
  pageId: string
  rule: RuleConfig[]        // 配置层类型
  data: Record<string, unknown>
  style?: string            // CSS 文本
  script?: string           // JS 文本（注意：是字符串，不是对象）
}
```

**重要**：`script` 类型是 `string`（JS 代码文本），由 `compileFunctions` 编译。

#### PageRendererOptions
PageRenderer 组件的 Props 类型。

#### RuleBindingOptions
bindDataToRules 的参数类型。

## 🎯 核心架构概念

### 类型系统双层设计

```
配置文件（JSON）
  ↓ RuleConfig[]
PageConfig.rule
  ↓ as unknown as Rule[]
PageRenderer 运行时
  ↓ Rule[]（FormCreate 官方类型）
bindRules / FormCreate
```

**设计原因**：
1. 配置层需要简单、易写（支持字符串函数引用）
2. 运行时需要类型安全（使用 FormCreate 官方类型）
3. 类型转换在边界明确进行（PageRenderer 加载后）

### 脚本编译策略

**"统一编译，按需返回"**：

```
1. 提取需要的函数名
   extractFunctionNames(rules) → ['handleClick', 'handleSubmit']
   
2. 编译整个脚本
   scriptText + `\nreturn { handleClick, handleSubmit, __init__ }`
   
3. 使用 Function 构造器
   new Function('$api', ..., fullScript)(context.$api, ...)
   
4. 返回函数对象
   { handleClick: fn, handleSubmit: fn, __init__: fn }
```

**优势**：
- 统一编译避免重复解析
- 按需返回减少内存占用
- 函数间可以互相调用（在同一作用域）
- 支持 `__init__` 生命周期钩子

## 🔄 数据流

### 页面渲染流程

```
1. 加载配置
   ConfigLoader.loadPageConfig(pageId)
   ↓
2. 初始化 DataSet
   DataSetManager.create(pageData.dataset, dataLoader)
   ↓
3. 执行脚本
   compileFunctions(scriptText, pageContext, functionNames)
   ↓
4. 绑定 Rules
   bindDataToRules(originalRules, pageData, pageFunctions, ...)
   ↓
5. 渲染组件
   <form-create :rule="boundRules" />
```

### DataSet 同步流程

```
用户操作表格
   ↓
触发 el-table 事件（currentChange / selectionChange）
   ↓
injectTableEvents 中的事件处理器
   ↓
同步到 DataSet.context.currentRow / selectedRows
   ↓
触发 DataSet 订阅者（其他表格）
   ↓
其他表格重新筛选数据
   ↓
UI 自动更新
```

### 脚本执行流程

```
PageConfig.script（函数对象）
   ↓
PageRenderer 转换为脚本文本
   ↓
compileFunctions 编译
   ↓
Function 构造器创建沙箱
   ↓
注入 PageContext（$api, $data, $dataSet, ...）
   ↓
执行脚本
   ↓
返回函数对象（pageFunctions）
   ↓
bindDataToRules 绑定到 rule.on
```

## 🔌 依赖关系

### 内部依赖

```
PageRenderer.vue
  ├─ useCssScope
  │   └─ scopeCSS (utils)
  ├─ usePageDataSet
  │   └─ DataSetManager (@spark-view/spark-data)
  ├─ useRuleBinding
  │   └─ bindDataToRules (utils)
  └─ compileFunctions (utils)
```

### 外部依赖

```
@spark-view/spark-app
  ├─ pageLogger
  ├─ ErrorCodes
  └─ getErrorMessage

@spark-view/spark-page-config
  └─ ConfigLoader

@spark-view/spark-data
  ├─ DataSetManager
  ├─ IDataSet
  ├─ DataRow
  └─ BindingContext

vue
  └─ ref, reactive, watch, onMounted, nextTick

vue-router
  └─ RouteLocationNormalizedLoaded
```

## 🧪 测试策略

### 单元测试

- `useCssScope.test.ts` - CSS 作用域测试
- `usePageDataSet.test.ts` - DataSet 管理测试
- `useRuleBinding.test.ts` - Rule 绑定测试
- `scopeCSS.test.ts` - CSS 工具测试
- `bindRules.test.ts` - Rule 绑定逻辑测试
- `compileFunctions.test.ts` - 脚本编译测试

### 集成测试

- `PageRenderer.test.ts` - 完整渲染流程测试

## 📚 最佳实践

### 1. 组件开发

- 遵循单一职责原则（SRP）
- 每个 Composable 只负责一个功能
- 工具函数保持纯函数特性

### 2. 类型定义

- 使用接口而非具体类（DIP）
- 导出公共类型，内部类型保持私有
- 充分利用 TypeScript 类型推导

### 3. 错误处理

- 使用 L1 ErrorCodes 统一错误码
- 使用 pageLogger 记录日志
- 提供 onError 回调给用户

### 4. 性能优化

- 使用 ref 和 reactive 合理管理状态
- 避免不必要的重新绑定
- 利用 Vue 的响应式系统

### 5. 代码组织

- 公共 API 统一从 index.ts 导出
- 内部实现细节不对外暴露
- 保持清晰的依赖关系

## 🔍 代码审查清单

- [ ] 是否遵循 SOLID 原则？
- [ ] 类型定义是否完整？
- [ ] 是否添加了必要的日志？
- [ ] 是否处理了错误情况？
- [ ] 是否编写了单元测试？
- [ ] 是否更新了文档？
- [ ] 是否保持了向后兼容？
- [ ] 性能是否满足要求？

## 📖 相关文档

- [API.md](./API.md) - 完整 API 文档
- [README.md](./README.md) - 项目概览
- [INTEGRATION.md](./INTEGRATION.md) - L1/L2 集成
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实现总结
