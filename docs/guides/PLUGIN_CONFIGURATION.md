# 插件配置系统使用指南

本文档说明 SPARK 应用的插件配置和注册机制。

## 📋 目录

- [概述](#概述)
- [插件配置格式](#插件配置格式)
- [内置插件](#内置插件)
- [注册自定义插件](#注册自定义插件)
- [插件优先级](#插件优先级)
- [插件选项](#插件选项)
- [最佳实践](#最佳实践)

## 概述

SPARK 采用**插件名称 → 插件模块**的映射机制，实现了：

- ✅ **配置驱动**：通过 JSON 配置控制插件加载
- ✅ **动态导入**：按需加载插件，减少首屏体积
- ✅ **可扩展性**：支持注册自定义插件
- ✅ **类型安全**：完整的 TypeScript 类型支持

## 插件配置格式

### 简单格式（布尔值）

```json
{
  "plugins": {
    "element-plus": true,
    "vxe-table": false
  }
}
```

### 详细格式（配置对象）

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
    }
  }
}
```

### 配置项说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `enabled` | boolean | ✅ | 是否启用插件 |
| `options` | object | ❌ | 插件选项（传递给插件的 install 方法） |
| `priority` | number | ❌ | 加载优先级（数字越小越先加载，默认 100） |
| `lazy` | boolean | ❌ | 是否懒加载（暂未实现） |

## 内置插件

SPARK 预注册了以下插件：

### Element Plus

```json
{
  "element-plus": {
    "enabled": true,
    "options": {
      "size": "default",    // 组件默认大小：large | default | small
      "zIndex": 2000        // 弹出层默认 z-index
    },
    "priority": 1
  }
}
```

**支持的选项**：
- `size`: 全局组件大小
- `zIndex`: 弹出层起始 z-index
- `locale`: 国际化配置

### VXE Table

```json
{
  "vxe-table": {
    "enabled": true,
    "priority": 2
  }
}
```

**支持的选项**：
- `i18n`: 国际化配置
- `table`: 表格默认配置
- `grid`: 表格容器默认配置

## 注册自定义插件

### 1. 创建插件加载器

在 `src/config/custom-plugins.ts` 中：

```typescript
import { PluginRegistry } from '@spark-view/spark-app'
import type { PluginLoader } from '@spark-view/spark-app'

export function registerCustomPlugins(): void {
  // 注册 Pinia 状态管理
  PluginRegistry.register('pinia', {
    name: 'Pinia',
    module: 'pinia',
    loader: async () => {
      const { createPinia } = await import('pinia')
      return { default: createPinia() }
    },
    description: 'Vue 状态管理库',
    defaultOptions: {}
  })

  // 注册 Vue Router（如果需要自定义）
  PluginRegistry.register('vue-router', {
    name: 'Vue Router',
    module: 'vue-router',
    loader: async () => {
      const { createRouter, createWebHistory } = await import('vue-router')
      const router = createRouter({
        history: createWebHistory(),
        routes: []
      })
      return { default: router }
    },
    description: 'Vue 路由管理器'
  })

  // 注册自定义插件
  PluginRegistry.register('my-plugin', {
    name: 'My Custom Plugin',
    module: './plugins/my-plugin',
    loader: () => import('./plugins/my-plugin'),
    description: '我的自定义插件',
    defaultOptions: {
      theme: 'light',
      debug: false
    }
  })
}
```

### 2. 在 main.ts 中注册

```typescript
import { registerBuiltinPlugins } from '@spark-view/spark-app'
import { registerCustomPlugins } from './config/custom-plugins'

async function startApp() {
  // 注册内置插件
  registerBuiltinPlugins()

  // 注册自定义插件
  registerCustomPlugins()

  // 加载配置
  const appConfig = await loadAppConfig()

  // 加载插件
  const plugins = await PluginManager.loadPlugins(appConfig.plugins)

  // 启动应用
  await SparkApp.start({ plugins, ... })
}
```

### 3. 在配置中使用

```json
{
  "plugins": {
    "pinia": true,
    "my-plugin": {
      "enabled": true,
      "options": {
        "theme": "dark",
        "debug": true
      }
    }
  }
}
```

## 插件优先级

插件按 `priority` 值从小到大加载：

```json
{
  "plugins": {
    "pinia": {
      "enabled": true,
      "priority": 0        // 最先加载（状态管理）
    },
    "element-plus": {
      "enabled": true,
      "priority": 1        // 第二加载（UI 框架）
    },
    "vxe-table": {
      "enabled": true,
      "priority": 2        // 第三加载（基于 Element Plus）
    }
  }
}
```

**默认优先级**：如果未指定 `priority`，默认为 `100`

**加载顺序**：
```
priority: 0 → 1 → 2 → 3 → ... → 100 → 101 → ...
```

## 插件选项

### 传递选项到插件

```typescript
// 配置
{
  "element-plus": {
    "enabled": true,
    "options": {
      "size": "large",
      "zIndex": 3000
    }
  }
}

// 等价于
import ElementPlus from 'element-plus'
app.use(ElementPlus, {
  size: 'large',
  zIndex: 3000
})
```

### 默认选项

在注册插件时可以指定默认选项：

```typescript
PluginRegistry.register('element-plus', {
  name: 'Element Plus',
  module: 'element-plus',
  loader: () => import('element-plus'),
  defaultOptions: {
    size: 'default',    // 默认值
    zIndex: 2000        // 默认值
  }
})
```

**选项合并规则**：
```
最终选项 = { ...defaultOptions, ...userOptions }
```

## 租户级别配置

不同租户可以使用不同的插件配置：

### 默认配置（default.json）

```json
{
  "plugins": {
    "element-plus": {
      "enabled": true,
      "options": {
        "size": "default"
      }
    },
  }
}
```

### Demo 租户配置（tenant-demo.json）

```json
{
  "tenant": { ... },
  "plugins": {
    "element-plus": {
      "enabled": true,
      "options": {
        "size": "large"     // 覆盖默认的 "default"
      }
    }
  }
}
```

**配置合并**：租户配置会深度合并到默认配置上。

## 最佳实践

### 1. 按需加载

只启用必需的插件：

```json
{
  "plugins": {
    "element-plus": true,   // 基础 UI 框架
    "vxe-table": false      // 如果不需要表格，禁用
  }
}
```

### 2. 设置合理的优先级

确保依赖关系正确：

```json
{
  "plugins": {
    "pinia": { "priority": 0 },          // 状态管理最先
    "element-plus": { "priority": 1 },   // UI 框架其次
    "my-plugin": { "priority": 2 }       // 自定义插件依赖 UI 框架
  }
}
```

### 3. 使用类型安全的配置

在 TypeScript 中定义插件选项类型：

```typescript
// src/config/types.ts
export type MyPluginOptions = {
  theme: 'light' | 'dark'
  debug: boolean
  apiEndpoint?: string
}

// 注册时指定类型
PluginRegistry.register('my-plugin', {
  name: 'My Plugin',
  module: './plugins/my-plugin',
  loader: () => import('./plugins/my-plugin'),
  defaultOptions: {
    theme: 'light',
    debug: false
  } as MyPluginOptions
})
```

### 4. 插件版本管理

在 `package.json` 中锁定插件版本：

```json
{
  "dependencies": {
    "element-plus": "^2.5.0",
    "vxe-table": "^4.17.0"
  }
}
```

### 5. 条件加载插件样式

根据插件配置按需加载样式：

```typescript
// 在 main.ts 中
const pluginInstances = await PluginManager.loadPlugins(appConfig.plugins)

// 加载插件样式
if (appConfig.plugins['element-plus']) {
  await import('element-plus/dist/index.css')
}
if (appConfig.plugins['vxe-table']) {
  await import('vxe-table/lib/style.css')
}
```

### 6. 调试插件加载

查看控制台日志了解插件加载情况：

```
🔌 Loading plugin: element-plus
✅ Plugin loaded: element-plus
🔌 Loading plugin: vxe-table
✅ Plugin loaded: vxe-table
✅ 已加载 2 个插件
```

### 7. 处理插件加载失败

插件加载失败不会中断应用启动：

```typescript
try {
  module = await loader.loader()
} catch (error) {
  console.error(`❌ Failed to load plugin "${id}":`, error)
  // 继续加载其他插件
}
```

## API 参考

### PluginRegistry

```typescript
class PluginRegistry {
  // 注册单个插件
  static register(id: string, loader: PluginLoader): void

  // 批量注册插件
  static registerAll(loaders: Record<string, PluginLoader>): void

  // 获取插件加载器
  static get(id: string): PluginLoader | undefined

  // 检查插件是否已注册
  static has(id: string): boolean

  // 获取所有插件 ID
  static getAllIds(): string[]

  // 清除所有注册
  static clear(): void
}
```

### PluginManager

```typescript
class PluginManager {
  // 根据配置加载插件
  static async loadPlugins(
    pluginConfigs: Record<string, boolean | PluginConfig>
  ): Promise<{ plugin: Plugin; options?: any }[]>
}
```

### PluginLoader

```typescript
type PluginLoader = {
  name: string                                      // 插件名称
  module: string                                    // 模块路径
  loader: () => Promise<{ default: Plugin }>        // 动态导入函数
  defaultOptions?: Record<string, any>              // 默认选项
  description?: string                              // 描述
}
```

### PluginConfigItem

```typescript
type PluginConfigItem = {
  enabled: boolean                  // 是否启用
  options?: Record<string, any>     // 插件选项
  lazy?: boolean                    // 是否懒加载
  priority?: number                 // 优先级
}
```

## 相关文档

- [配置系统指南](./CONFIG_SYSTEM.md)
- [配置类型定义](../../src/config/types.ts)
- [插件注册表源码](../../packages/spark-app/src/plugins/registry.ts)
