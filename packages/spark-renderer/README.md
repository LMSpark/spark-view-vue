# @spark-view/spark-renderer

> SPARK 页面渲染引擎（L3 Model Layer）

将配置化页面渲染为 Vue 组件，提供 DataSet 集成、CSS 隔离、脚本沙箱等核心能力。

## 📦 功能特性

- ✅ **配置化渲染** - 将 PageConfig 渲染为 Vue 组件
- ✅ **DataSet 集成** - 页面级数据管理和主从表联动
- ✅ **CSS 隔离** - 自动添加作用域前缀，避免样式污染
- ✅ **脚本沙箱** - 安全执行页面脚本，隔离执行环境
- ✅ **双向绑定** - 自动绑定数据和事件处理器
- ✅ **插槽支持** - 自定义 loading、error、content 插槽

## 🏗️ 架构定位

```
L1 Application Layer (@spark-view/spark-app)
  ↓ Logger, ErrorCodes, Constants
L2 Business Orchestration (@spark-view/spark-page-config)
  ↓ ConfigLoader
L3 Model Layer (@spark-view/spark-renderer)  ← 本包
  ↓ PageRenderer + DataSet + CSS隔离 + 脚本沙箱
L4-L6 Components (@spark-view/spark-core)
  DataSpace (@spark-view/spark-data)
```

**L3 职责**：
- 渲染引擎 - 配置 → Vue 组件
- DataSet 管理 - 页面级数据隔离
- CSS 隔离 - 样式作用域
- 脚本沙箱 - 脚本执行隔离
- Rule 绑定 - 数据和事件绑定

## 🚀 快速开始

### 安装

```bash
pnpm add @spark-view/spark-renderer
```

### 基础使用

```vue
<script setup lang="ts">
import { PageRenderer } from '@spark-view/spark-renderer'
import { configLoader } from '@/router'
</script>

<template>
  <PageRenderer :config-loader="configLoader" />
</template>
```

### 自定义插槽

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

### 访问组件方法

```vue
<script setup lang="ts">
import { ref } from 'vue'

const pageRef = ref()

const reload = () => pageRef.value?.reload()
const rebind = () => pageRef.value?.rebindRules()
const getData = () => pageRef.value?.pageContext.$data
</script>

<template>
  <PageRenderer ref="pageRef" :config-loader="configLoader" />
</template>
```

## 📖 API 文档

详细 API 文档请查看 [API.md](./API.md)。

### 核心 API

#### 组件

- `PageRenderer` - 页面渲染组件

#### Composables

- `useCssScope` - CSS 作用域隔离
- `usePageDataSet` - DataSet 管理
- `useRuleBinding` - Rule 数据绑定

#### 类型

- `Rule` - 页面规则配置
- `PageContext` - 页面脚本上下文
- `PageConfig` - 页面配置
- `FormCreateAPI` - FormCreate API

## 🔌 Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| configLoader | ConfigLoader | 否* | - | 配置加载器 |
| pageId | string | 否 | - | 页面 ID（优先级最高） |
| pageConfig | PageConfig | 否* | - | 直接传入配置（跳过加载） |
| formCreateOptions | Record | 否 | {} | FormCreate 选项 |
| enableCssScope | boolean | 否 | true | 是否启用 CSS 隔离 |
| enableDataSet | boolean | 否 | true | 是否启用 DataSet |
| beforeLoad | Function | 否 | - | 页面加载前钩子 |
| afterLoad | Function | 否 | - | 页面加载后钩子 |
| onError | Function | 否 | - | 错误处理 |

*注：`configLoader` 和 `pageConfig` 必须提供其中之一。

## 🎰 插槽

| 插槽名 | 参数 | 说明 |
|-------|------|------|
| loading | - | 自定义加载状态 |
| error | { error: string } | 自定义错误显示 |
| content | { rules, pageData } | 自定义内容渲染 |

## 🔨 Expose 方法

通过 `ref` 访问：

```typescript
interface PageRendererExpose {
  reload: () => Promise<void>              // 重新加载页面
  rebindRules: () => void                  // 重新绑定规则
  pageContext: PageContext                 // 页面上下文
  formApi: Ref<FormCreateAPI | null>       // FormCreate API
  dataSet: Ref<IDataSet | null>            // DataSet 实例
}
```

## 📝 页面脚本上下文

页面脚本中可访问的全局变量：

| 变量 | 类型 | 说明 |
|------|------|------|
| `$api` | FormCreateAPI \| null | FormCreate API |
| `$route` | RouteLocationNormalizedLoaded | Vue Router 路由 |
| `$data` | reactive<Record> | 页面数据（响应式） |
| `$el` | () => HTMLElement \| null | 页面容器元素 |
| `$query` | (selector) => Element \| null | 查询单个元素 |
| `$queryAll` | (selector) => NodeListOf | 查询所有元素 |
| `$dataSet` | IDataSet \| null | DataSet 实例 |
| `$rebindRules` | () => void | 重新绑定规则 |
| `$refreshData` | async () => void | 刷新数据 |

### 脚本示例

```javascript
// script.js
function handleClick() {
  // 访问页面数据
  const pageData = $data
  pageData.count++
  
  // 访问 FormCreate API
  const value = $api?.getValue('username')
  
  // 访问 DataSet
  const users = $dataSet?.tables.Users.rows
  
  // 重新绑定 rules
  $rebindRules()
}

function __init__() {
  console.log('页面初始化')
  
  // 注册数据加载器
  if ($dataSet) {
    $dataSet.dataLoader = async (tableName) => {
      const response = await fetch(`/api/${tableName}`)
      return response.json()
    }
  }
}
```

## 🌲 依赖关系

```json
{
  "dependencies": {
    "@spark-view/spark-core": "workspace:*",
    "@spark-view/spark-data": "workspace:*",
    "@spark-view/spark-page-config": "workspace:*",
    "@spark-view/spark-app": "workspace:*"
  },
  "peerDependencies": {
    "vue": "^3.5.0",
    "vue-router": "^4.0.0"
  }
}
```

## 📚 相关文档

- [API.md](./API.md) - 完整 API 文档
- [INTEGRATION.md](./INTEGRATION.md) - L1/L2 集成说明
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实现总结
- [@spark-view/spark-core](../spark-core/README.md) - 组件系统
- [@spark-view/spark-data](../spark-data/README.md) - 数据空间
- [@spark-view/spark-page-config](../spark-page-config/README.md) - 配置层
- [@spark-view/spark-app](../spark-app/README.md) - 应用层

## 🤝 最佳实践

### 1. 使用 ConfigLoader

```vue
<!-- ✅ 推荐 -->
<PageRenderer :config-loader="configLoader" />

<!-- ❌ 不推荐（除非特殊场景） -->
<PageRenderer :page-config="config" />
```

### 2. 错误处理

```vue
<PageRenderer
  :config-loader="configLoader"
  :on-error="handleError"
>
  <template #error="{ error }">
    <el-alert :title="error" type="error" />
  </template>
</PageRenderer>
```

### 3. 生命周期钩子

```vue
<PageRenderer
  :config-loader="configLoader"
  :before-load="(pageId) => console.log('Loading:', pageId)"
  :after-load="(config) => console.log('Loaded:', config)"
/>
```

### 4. DataSet 数据加载

```javascript
// script.js
function __init__() {
  const dataSet = $dataSet
  if (dataSet) {
    // 注册自定义数据加载器
    dataSet.dataLoader = async (tableName) => {
      const response = await fetch(`/api/${tableName}`)
      return response.json()
    }
    
    // 监听加载事件
    dataSet.on('loadSuccess', ({ tableName }) => {
      console.log(`${tableName} 加载成功`)
    })
  }
}
```

## 📄 License

MIT

## 🙋 问题反馈

如有问题或建议，请提交 Issue。
      children: ['点击我']
    }
  ],
  data: { message: 'Hello' }
}
</script>

<template>
  <PageRenderer :page-config="pageConfig" />
</template>
```

## 📖 API 文档

### PageRenderer 组件

#### Props

```typescript
interface PageRendererOptions {
  // 配置加载器
  configLoader?: ConfigLoader
  
  // 页面ID（优先级最高）
  pageId?: string
  
  // 页面配置（直接传入，跳过加载）
  pageConfig?: PageConfig
  
  // FormCreate 选项
  formCreateOptions?: Record<string, any>
  
  // 是否启用 CSS 隔离（默认 true）
  enableCssScope?: boolean
  
  // 是否启用脚本沙箱（默认 true）
  enableScriptSandbox?: boolean
  
  // 是否启用 DataSet 自动初始化（默认 true）
  enableDataSet?: boolean
  
  // 页面加载前钩子
  beforeLoad?: (pageId: string) => void | Promise<void>
  
  // 页面加载后钩子
  afterLoad?: (config: PageConfig) => void | Promise<void>
  
  // 错误处理
  onError?: (error: Error) => void
}
```

#### 插槽

```vue
<PageRenderer>
  <!-- loading 插槽 -->
  <template #loading>
    自定义加载提示
  </template>
  
  <!-- error 插槽 -->
  <template #error="{ error }">
    自定义错误显示
  </template>
  
  <!-- content 插槽 -->
  <template #content="{ rules, pageData }">
    自定义渲染逻辑
  </template>
</PageRenderer>
```

#### 暴露方法

```typescript
const rendererRef = ref()

// 重新加载页面
rendererRef.value.reload()

// 重新绑定 Rules
rendererRef.value.rebindRules()

// 访问页面上下文
const { pageContext, formApi, dataSet } = rendererRef.value
```

### Composables

#### useCssScope

```typescript
const { scopedCss, setScopedCss, clearScopedCss } = useCssScope({
  pageId: 'home',
  enableScope: true
})

setScopedCss('.button { color: red; }')
```

#### useScriptSandbox

```typescript
const { pageFunctions, loadScript, executeFunction } = useScriptSandbox({
  pageId: 'home',
  context: pageContext,
  enableSandbox: true
})

await loadScript()
executeFunction('handleClick', arg1, arg2)
```

#### usePageDataSet

```typescript
const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
  pageData,
  context: pageContext,
  originalRules,
  enableDataSet: true
})

initDataSet()
autoSubscribeTables()
```

#### useRuleBinding

```typescript
const { boundRules, rebindRules } = useRuleBinding({
  originalRules,
  pageData,
  pageFunctions,
  dataSet,
  formApi
})

watch(pageData, () => {
  rebindRules()
})
```

### 工具函数

#### scopeCSS

```typescript
import { scopeCSS } from '@spark-view/spark-renderer'

const scopedCss = scopeCSS({
  pageId: 'home',
  css: '.button { color: red; }'
})
// 结果: [data-page="home"] .button { color: red; }
```

#### loadScriptModule

```typescript
import { loadScriptModule } from '@spark-view/spark-renderer'

const module = await loadScriptModule('home', '/pages-config')
const { handleClick } = module
```

#### bindDataToRules

```typescript
import { bindDataToRules } from '@spark-view/spark-renderer'

const boundRules = bindDataToRules({
  rules: originalRules,
  pageData,
  pageFunctions,
  dataSet,
  formApi
})
```

## 🎯 核心功能详解

### 1. DataSet 管理

自动为包含 `dataset` 的页面创建 DataSet 实例：

```json
// pagedata.json
{
  "dataset": {
    "dataSetName": "MyData",
    "tables": {
      "Users": {
        "tableName": "Users",
        "columns": [...],
        "rows": [...]
      }
    }
  }
}
```

自动订阅 rules 中引用的表：

```json
// rule.json
[
  {
    "type": "el-table",
    "dataKey": "dataset.tables.Users.rows",
    "contextId": "default"
  }
]
```

### 2. CSS 隔离

自动为页面样式添加作用域前缀：

```css
/* 原始 CSS */
.button { color: red; }

/* 处理后 */
[data-page="home"] .button { color: red; }
```

### 3. 脚本沙箱

提供隔离的执行环境：

```javascript
// script.js
export function handleClick() {
  // 可访问沙箱上下文
  const api = $api()
  const data = $data()
  const dataSet = $dataSet()
  
  alert('按钮被点击')
}
```

沙箱上下文：
- `$api()` - FormCreate API
- `$route()` - Vue Router
- `$data()` - 页面数据
- `$el()` - 页面容器 DOM
- `$dataSet()` - DataSet 实例
- `$query(selector)` - DOM 查询
- `$queryAll(selector)` - DOM 批量查询

### 4. Rule 绑定

自动绑定数据和事件：

```json
{
  "type": "el-button",
  "on": {
    "click": "handleClick"  // 字符串会自动转换为函数
  },
  "children": ["点击我"]
}
```

自动为 el-table 注入 DataSet 同步事件：
- `currentChange` - 同步单选行
- `selectionChange` - 同步多选行

## 🔧 高级用法

### 生命周期钩子

```vue
<PageRenderer
  :config-loader="configLoader"
  :before-load="onBeforeLoad"
  :after-load="onAfterLoad"
  :on-error="onError"
/>

<script setup>
const onBeforeLoad = async (pageId) => {
  console.log('准备加载:', pageId)
}

const onAfterLoad = async (config) => {
  console.log('加载完成:', config.pageId)
}

const onError = (error) => {
  console.error('加载失败:', error)
}
</script>
```

### 禁用特定功能

```vue
<PageRenderer
  :config-loader="configLoader"
  :enable-css-scope="false"
  :enable-script-sandbox="false"
  :enable-data-set="false"
/>
```

### 访问内部状态

```vue
<script setup>
const rendererRef = ref()

onMounted(() => {
  // 访问 FormCreate API
  const formApi = rendererRef.value.formApi
  console.log(formApi.formData())
  
  // 访问 DataSet
  const dataSet = rendererRef.value.dataSet
  console.log(dataSet.tables)
  
  // 访问页面上下文
  const context = rendererRef.value.pageContext
  console.log(context.$data)
})
</script>

<template>
  <PageRenderer ref="rendererRef" :config-loader="configLoader" />
</template>
```

## 📚 示例

查看完整示例：
- [基础用法](./examples/basic.md)
- [DataSet 集成](./examples/dataset.md)
- [自定义插槽](./examples/slots.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT
