# @spark-view/spark-renderer

SPARK 页面渲染引擎（L3 Model Layer）- 将配置化页面渲染为 Vue 组件，提供 DataSet 集成、CSS 隔离、脚本沙箱等核心能力。

## 📦 功能特性

- ✅ **配置化渲染** - 将 PageConfig 渲染为 Vue 组件
- ✅ **DataSet 集成** - 页面级数据管理和主从表联动
- ✅ **CSS 隔离** - 自动添加作用域前缀，避免样式污染
- ✅ **脚本沙箱** - 安全执行页面脚本，隔离执行环境
- ✅ **Rule 绑定** - 自动绑定数据和事件处理器
- ✅ **插槽支持** - 自定义 loading、error、content 插槽
- ✅ **L1/L2 集成** - 完整对接应用层和配置层

## 🏗️ 架构定位

```
L1 Application Layer (@spark-view/spark-app)
  ↓ 提供 Logger、ErrorCodes、Constants
L2 Business Orchestration (@spark-view/spark-page-config)
  ↓ 提供 ConfigLoader 加载配置
L3 Model Layer (@spark-view/spark-renderer)  ← 本包
  ↓ 渲染引擎 + DataSet + CSS隔离 + 脚本沙箱
L4-L6 Components (@spark-view/spark-core)
```

**L3 职责**：
1. **渲染引擎** - 将配置转换为 Vue 组件
2. **DataSet 管理** - 页面级数据隔离和联动
3. **CSS 隔离** - 样式作用域
4. **脚本沙箱** - 脚本执行隔离
5. **Rule 绑定** - 数据和事件绑定

## 🔗 与 L1/L2 的集成

L3 (spark-renderer) 依赖 L1 和 L2 提供的基础设施：

- **L1 Logger** - 使用 `pageLogger` 记录所有渲染日志
- **L1 ErrorCodes** - 使用 `CONFIG_INVALID`、`CONFIG_LOAD_FAILED` 等标准错误码
- **L2 ConfigLoader** - 通过 `configLoader.loadPageConfig()` 加载页面配置

详细集成说明请参阅 [INTEGRATION.md](./INTEGRATION.md)。

## 🚀 快速开始

### 1. 安装

```bash
pnpm add @spark-view/spark-renderer
```

### 2. 基础使用

```vue
<!-- DynamicPage.vue -->
<script setup lang="ts">
import { PageRenderer } from '@spark-view/spark-renderer'
import { configLoader } from '@/router'
</script>

<template>
  <PageRenderer :config-loader="configLoader" />
</template>
```

### 3. 自定义插槽

```vue
<template>
  <PageRenderer :config-loader="configLoader">
    <!-- 自定义 loading -->
    <template #loading>
      <div class="custom-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        正在加载页面...
      </div>
    </template>
    
    <!-- 自定义错误显示 -->
    <template #error="{ error }">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
      />
    </template>
  </PageRenderer>
</template>
```

### 4. 直接传入配置

```vue
<script setup lang="ts">
const pageConfig = {
  pageId: 'custom',
  rule: [
    {
      type: 'el-button',
      props: { type: 'primary' },
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
