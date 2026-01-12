# EJ2 集成安装指南

## 📦 第一步：安装依赖

```bash
# 安装 EJ2 核心包
pnpm add @syncfusion/ej2-vue-grids
pnpm add @syncfusion/ej2-vue-inputs
pnpm add @syncfusion/ej2-vue-calendars
pnpm add @syncfusion/ej2-base

# 安装 EJ2 样式（Material 主题）
pnpm add @syncfusion/ej2-vue-buttons
```

预计增加包体积：
- Grid 组件：~200KB
- Inputs 组件：~50KB
- Calendars 组件：~80KB
- **总计：约 330KB**（gzip 后约 100KB）

## 🔑 第二步：注册授权（可选）

如果你有 Syncfusion 授权，在 `main.ts` 和 `app.ts` 顶部添加：

```typescript
import { registerLicense } from '@syncfusion/ej2-base'

// 替换为你的授权密钥
registerLicense('YOUR-LICENSE-KEY-HERE')
```

**免费社区许可证**：
- 适用于年收入 < $1M 的公司
- 申请地址：https://www.syncfusion.com/sales/communitylicense

## 🎨 第三步：导入样式

### 方法 1：在 main.ts 中全局导入（推荐）

```typescript
// main.ts
import '@syncfusion/ej2-base/styles/material.css'
import '@syncfusion/ej2-buttons/styles/material.css'
import '@syncfusion/ej2-calendars/styles/material.css'
import '@syncfusion/ej2-dropdowns/styles/material.css'
import '@syncfusion/ej2-inputs/styles/material.css'
import '@syncfusion/ej2-navigations/styles/material.css'
import '@syncfusion/ej2-popups/styles/material.css'
import '@syncfusion/ej2-splitbuttons/styles/material.css'
import '@syncfusion/ej2-vue-grids/styles/material.css'
```

### 方法 2：在 style.css 中导入

```css
/* src/style.css */
@import '@syncfusion/ej2-base/styles/material.css';
@import '@syncfusion/ej2-vue-grids/styles/material.css';
@import '@syncfusion/ej2-inputs/styles/material.css';
@import '@syncfusion/ej2-calendars/styles/material.css';
```

**可用主题**：
- `material.css` - Material Design
- `bootstrap5.css` - Bootstrap 5
- `tailwind.css` - Tailwind CSS
- `fluent.css` - Microsoft Fluent

## 🔌 第四步：注册插件

### main.ts（客户端）

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import formCreate from '@form-create/element-ui'

// ✅ 导入 EJ2 插件
import { GridPlugin } from '@syncfusion/ej2-vue-grids'
import { TextBoxPlugin, NumericTextBoxPlugin } from '@syncfusion/ej2-vue-inputs'
import { DatePickerPlugin } from '@syncfusion/ej2-vue-calendars'

const app = createApp(App)

// 注册 Element Plus（表单、按钮等）
app.use(ElementPlus)
app.use(formCreate)

// ✅ 注册 EJ2 插件（表格专用）
app.use(GridPlugin)
app.use(TextBoxPlugin)
app.use(NumericTextBoxPlugin)
app.use(DatePickerPlugin)

app.mount('#app')
```

### app.ts（SSR 服务端）

```typescript
import { createSSRApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import formCreate from '@form-create/element-ui'

// ✅ 导入 EJ2 插件
import { GridPlugin } from '@syncfusion/ej2-vue-grids'
import { TextBoxPlugin, NumericTextBoxPlugin } from '@syncfusion/ej2-vue-inputs'
import { DatePickerPlugin } from '@syncfusion/ej2-vue-calendars'

export function createApp() {
  const app = createSSRApp(App)
  
  app.use(ElementPlus)
  app.use(formCreate)
  
  // ✅ 注册 EJ2 插件
  app.use(GridPlugin)
  app.use(TextBoxPlugin)
  app.use(NumericTextBoxPlugin)
  app.use(DatePickerPlugin)
  
  return { app }
}
```

## 🧪 第五步：测试安装

创建测试页面 `src/pages-config/ej2-test/rule.json`：

```json
[
  {
    "type": "div",
    "children": [
      {
        "type": "h1",
        "children": ["EJ2 Grid 测试"]
      }
    ]
  }
]
```

添加路由到 `src/pages-config/routes.json`：

```json
{
  "path": "/ej2-test",
  "name": "ej2-test",
  "pageId": "ej2-test",
  "meta": { "title": "EJ2 测试" }
}
```

访问 `http://localhost:3000/ej2-test` 验证安装。

## 🚀 第六步：使用 EJ2 渲染器

### 方法 1：在 form-create 中注册自定义组件

在页面的 `script.js` 中：

```javascript
import EJ2DynamicRenderer from '@/components/renderers/ej2/DynamicRenderer.vue'

export function __init__() {
  // 返回自定义组件映射
  return {
    'ej2-renderer': EJ2DynamicRenderer
  }
}
```

在 `rule.json` 中使用：

```json
{
  "type": "ej2-renderer",
  "props": {
    "rule": {
      "type": "ej2-table",
      "dataSource": "users",
      "allowPaging": true,
      "children": [
        { "type": "text", "name": "姓名", "value": "name" }
      ]
    },
    "data": { "dataKey": "pageData" }
  }
}
```

### 方法 2：直接在 DynamicPage.vue 中集成（推荐）

修改 `src/views/DynamicPage.vue`，在渲染规则时检测 `ej2-table` 类型：

```typescript
// 伪代码示例
if (rule.type === 'ej2-table' || rule.type === 'ej2-grid') {
  return h(EJ2TableRenderer, {
    config: rule,
    data: pageData
  }, renderChildren(rule.children))
}
```

## ⚙️ 配置优化

### vite.config.ts 优化

```typescript
export default defineConfig({
  optimizeDeps: {
    include: [
      '@syncfusion/ej2-vue-grids',
      '@syncfusion/ej2-vue-inputs',
      '@syncfusion/ej2-vue-calendars'
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ej2-grids': ['@syncfusion/ej2-vue-grids'],
          'ej2-inputs': ['@syncfusion/ej2-vue-inputs', '@syncfusion/ej2-vue-calendars']
        }
      }
    }
  }
})
```

## 📊 包体积对比

### 当前（Element Plus 全量）
- Element Plus: ~500KB
- form-create: ~200KB
- **总计: ~700KB**

### 添加 EJ2 后
- Element Plus: ~500KB
- form-create: ~200KB
- EJ2 Grid: ~200KB
- EJ2 Inputs: ~50KB
- EJ2 Calendars: ~80KB
- **总计: ~1030KB**

### 优化方案（推荐）
- 保留 Element Plus：用于表单、按钮、布局
- 仅引入 EJ2 Grid：用于复杂数据表格
- **总计: ~900KB**（比全量 EJ2 小 50%）

## ✅ 验证清单

- [ ] pnpm install 成功
- [ ] 无编译错误
- [ ] 样式正确加载
- [ ] EJ2 Grid 可以渲染
- [ ] 分页、排序功能正常
- [ ] SSR 模式无错误

## 🐛 常见问题

### 1. 编译错误：找不到模块

```bash
# 确保安装了所有依赖
pnpm add @syncfusion/ej2-base
```

### 2. 样式未生效

检查是否导入了样式：

```typescript
import '@syncfusion/ej2-vue-grids/styles/material.css'
```

### 3. SSR 报错：window is not defined

EJ2 组件已支持 SSR，确保在 `app.ts` 中也注册了插件。

### 4. 授权提示

如果看到授权提示，有两种选择：
1. 申请免费社区许可证
2. 忽略提示（开发环境可用）

## 📚 下一步

- 查看示例：[examples.json](./examples.json)
- 阅读文档：[README.md](./README.md)
- 创建演示页面：参考 `src/pages-config/ej2-demo/`

## 🆘 需要帮助？

- EJ2 官方文档：https://ej2.syncfusion.com/vue/documentation/
- 示例代码：https://ej2.syncfusion.com/vue/demos/
- 社区论坛：https://www.syncfusion.com/forums/vue
