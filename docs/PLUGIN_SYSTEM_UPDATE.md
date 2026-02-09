# 插件配置系统更新摘要

## 🎯 问题背景

原有插件配置只是简单的布尔值，缺少**插件名称到实际模块的映射机制**：

```json
// ❌ 旧格式：硬编码，不灵活
{
  "plugins": {
    "elementPlus": true,
    "vxeTable": true,
    "formCreate": true
  }
}
```

问题：
1. 插件名和实际模块的映射硬编码在 `main.ts` 中
2. 无法配置插件选项
3. 无法控制插件加载顺序
4. 难以扩展自定义插件

## ✅ 解决方案

实现了完整的**插件注册表 + 配置驱动**的插件系统。

### 核心架构

```
┌────────────────────────────────────────────────────────────┐
│                    配置文件 (JSON)                          │
│  { "plugins": { "element-plus": { enabled, options } } }   │
└────────────────┬───────────────────────────────────────────┘
                 │
                 v
┌────────────────────────────────────────────────────────────┐
│              PluginManager (配置解析 + 加载)                │
│  loadPlugins(config) → 解析配置 → 按优先级排序 → 加载插件   │
└────────────────┬───────────────────────────────────────────┘
                 │
                 v
┌────────────────────────────────────────────────────────────┐
│           PluginRegistry (插件名 → 模块映射)                │
│  'element-plus' → { loader: () => import('element-plus') } │
│  'vxe-table'    → { loader: () => import('vxe-table') }    │
│  'my-plugin'    → { loader: () => import('./my-plugin') }  │
└────────────────────────────────────────────────────────────┘
```

### 新配置格式

```json
{
  "plugins": {
    "element-plus": {
      "enabled": true,
      "options": {
        "size": "default",
        "zIndex": 2000
      },
      "priority": 1
    },
    "vxe-table": {
      "enabled": true,
      "priority": 2
    },
    "form-create": {
      "enabled": false
    }
  }
}
```

**支持字段**：
- `enabled`: 是否启用（必填）
- `options`: 插件选项，传递给 `app.use(plugin, options)`
- `priority`: 加载优先级，数字越小越先加载
- 向后兼容：仍支持简单的布尔值格式

## 📦 新增文件

| 文件 | 说明 |
|------|------|
| [packages/spark-app/src/plugins/registry.ts](../packages/spark-app/src/plugins/registry.ts) | 插件注册表核心实现 |
| [docs/guides/PLUGIN_CONFIGURATION.md](../docs/guides/PLUGIN_CONFIGURATION.md) | 完整使用指南 |
| [public/config/plugin-config.example.json](../public/config/plugin-config.example.json) | 配置示例 |

## 🔧 修改文件

| 文件 | 修改内容 |
|------|----------|
| [src/config/types.ts](../src/config/types.ts) | 新增 `PluginConfigItem` 类型，`UIPluginsConfig` 改为 `Record<string, boolean \| PluginConfigItem>` |
| [src/main.ts](../src/main.ts) | 使用 `PluginManager.loadPlugins()` 替代硬编码的插件加载 |
| [public/config/default.json](../public/config/default.json) | 更新为新的插件配置格式 |
| [public/config/tenants/*.json](../public/config/tenants/) | 添加租户级别的插件配置示例 |
| [tools/mock-config-api.mjs](../tools/mock-config-api.mjs) | 更新 Mock API 返回的配置格式 |

## 🚀 核心 API

### PluginRegistry (插件注册表)

```typescript
import { PluginRegistry } from '@spark-view/spark-app'

// 注册单个插件
PluginRegistry.register('my-plugin', {
  name: 'My Plugin',
  module: './plugins/my-plugin',
  loader: () => import('./plugins/my-plugin'),
  defaultOptions: { theme: 'light' }
})

// 批量注册
PluginRegistry.registerAll({
  'plugin1': { ... },
  'plugin2': { ... }
})

// 查询
PluginRegistry.has('my-plugin')  // true
PluginRegistry.get('my-plugin')  // PluginLoader
PluginRegistry.getAllIds()       // ['element-plus', 'vxe-table', ...]
```

### PluginManager (插件加载器)

```typescript
import { PluginManager } from '@spark-view/spark-app'

// 根据配置加载插件
const plugins = await PluginManager.loadPlugins({
  'element-plus': {
    enabled: true,
    options: { size: 'large' }
  },
  'vxe-table': true  // 支持简单格式
})

// 返回 { plugin: Plugin, options?: any }[]
```

### 内置插件注册

```typescript
import { registerBuiltinPlugins } from '@spark-view/spark-app'

// 在 main.ts 中调用一次
registerBuiltinPlugins()

// 已注册的插件：
// - 'element-plus'
// - 'vxe-table'
// - 'form-create'
```

## 💡 使用示例

### 1. 基本用法（main.ts）

```typescript
import { registerBuiltinPlugins, PluginManager } from '@spark-view/spark-app'
import { loadAppConfig } from './config/loader'

async function startApp() {
  // 1. 注册内置插件
  registerBuiltinPlugins()
  
  // 2. 加载配置
  const config = await loadAppConfig()
  
  // 3. 根据配置加载插件
  const pluginInstances = await PluginManager.loadPlugins(config.plugins)
  const plugins = pluginInstances.map(p => p.plugin)
  
  // 4. 启动应用
  await SparkApp.start({ plugins, ... })
}
```

### 2. 注册自定义插件

```typescript
// src/config/custom-plugins.ts
import { PluginRegistry } from '@spark-view/spark-app'

export function registerCustomPlugins() {
  PluginRegistry.register('pinia', {
    name: 'Pinia',
    module: 'pinia',
    loader: async () => {
      const { createPinia } = await import('pinia')
      return { default: createPinia() }
    },
    description: 'Vue 状态管理'
  })
}

// main.ts
import { registerCustomPlugins } from './config/custom-plugins'

registerBuiltinPlugins()
registerCustomPlugins()
```

### 3. 租户级别配置

```json
// tenant-demo.json
{
  "tenant": { ... },
  "plugins": {
    "element-plus": {
      "enabled": true,
      "options": {
        "size": "large"  // 覆盖默认的 "default"
      }
    }
  }
}
```

### 4. 插件优先级控制

```json
{
  "plugins": {
    "pinia": { "enabled": true, "priority": 0 },          // 最先加载
    "element-plus": { "enabled": true, "priority": 1 },   // 第二
    "vxe-table": { "enabled": true, "priority": 2 },      // 第三
    "form-create": { "enabled": true, "priority": 3 }     // 最后
  }
}
```

## 🎓 最佳实践

### 1. 按需加载插件

只启用需要的插件，减少首屏加载体积：

```json
{
  "plugins": {
    "element-plus": true,   // 必需的 UI 框架
    "vxe-table": false,     // 如果不用表格，禁用
    "form-create": false    // 如果不用表单，禁用
  }
}
```

### 2. 设置合理的优先级

确保依赖关系正确：

```
优先级建议：
- 0-10:  状态管理（pinia, vuex）
- 10-20: UI 框架（element-plus）
- 20-30: UI 组件（vxe-table, form-create）
- 30-40: 工具插件（i18n, router）
- 40+:   业务插件
```

### 3. 类型安全

为自定义插件定义选项类型：

```typescript
interface MyPluginOptions {
  theme: 'light' | 'dark'
  debug: boolean
}

PluginRegistry.register('my-plugin', {
  loader: () => import('./my-plugin'),
  defaultOptions: {
    theme: 'light',
    debug: false
  } as MyPluginOptions
})
```

## 📊 对比总结

| 特性 | 旧方案 | 新方案 |
|------|--------|--------|
| 配置格式 | 简单布尔值 | 布尔值 + 详细配置对象 |
| 插件选项 | ❌ 不支持 | ✅ 支持 `options` 字段 |
| 加载顺序 | ❌ 固定顺序 | ✅ 可配置 `priority` |
| 扩展性 | ❌ 修改 main.ts | ✅ 注册表机制 |
| 租户定制 | ❌ 仅能启用/禁用 | ✅ 可覆盖插件选项 |
| 类型安全 | ⚠️ 部分 | ✅ 完整 TypeScript 支持 |

## 🔗 相关文档

- [插件配置完整指南](../docs/guides/PLUGIN_CONFIGURATION.md)
- [多租户配置指南](../docs/guides/MULTI_TENANT_CONFIG.md)
- [远程配置 API](../docs/guides/REMOTE_CONFIG_API.md)
- [配置类型定义](../src/config/types.ts)
- [插件注册表源码](../packages/spark-app/src/plugins/registry.ts)

## ✅ 测试验证

运行以下命令验证功能：

```bash
# 类型检查
pnpm run typecheck

# 启动应用（测试默认配置）
pnpm run dev

# 测试租户配置
# http://localhost:5173?tenant=demo
# http://localhost:5173?tenant=enterprise

# 查看控制台日志
# 🔌 Loading plugin: element-plus
# ✅ Plugin loaded: element-plus
# ✅ 已加载 3 个插件
```

---

**更新时间**: 2026-02-10  
**版本**: v1.0.0  
**作者**: GitHub Copilot
