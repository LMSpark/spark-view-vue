# 插件管理系统架构升级

## 📋 变更摘要

**日期**: 2026-02-10  
**类型**: 架构重构  
**影响范围**: 插件管理模块

## 🎯 问题背景

用户提出："是不是要在 SPARKAPP 单端搞个插件管理模块？"

**原有架构问题**：
- 插件管理代码位于应用层（已删除）
- 与应用配置紧密耦合
- 无法跨项目复用
- 不符合"基础设施在 spark-app"的架构原则

## ✅ 解决方案

将插件管理提升到 `@spark-view/spark-app` 包，作为应用层基础设施的一部分。

### 新架构

```
packages/spark-app/
├── src/
│   ├── plugins/              # ✨ 新增：插件管理模块
│   │   ├── index.ts          # 统一导出
│   │   ├── registry.ts       # 核心：注册表 + 管理器
│   │   └── presets.ts        # 预设：内置插件
│   ├── auth/                 # 认证模块
│   ├── bootstrap/            # 引导模块
│   ├── logger/               # 日志模块
│   ├── router/               # 路由模块
│   └── index.ts              # 总导出（新增插件 API）
```

### 模块职责

#### 1. PluginRegistry (插件注册表)

```typescript
// 管理插件名称到加载器的映射
class PluginRegistry {
  static register(id: string, loader: PluginLoader): void
  static registerAll(loaders: Record<string, PluginLoader>): void
  static get(id: string): PluginLoader | undefined
  static has(id: string): boolean
  static getAll(): PluginLoader[]
  static unregister(id: string): boolean
  static clear(): void
}
```

#### 2. PluginManager (插件管理器)

```typescript
// 负责加载和管理插件生命周期
class PluginManager {
  static async loadPlugins(configs: Record<string, PluginConfig>): Promise<PluginInstance[]>
  static async loadPlugin(id: string, config: PluginConfig): Promise<PluginInstance | null>
}
```

#### 3. Presets (预设插件)

```typescript
// 注册常用插件
function registerBuiltinPlugins(): void {
  // element-plus, vxe-table, form-create
}

function registerAllPresetPlugins(): void {
  // 注册所有预设
}
```

## 📦 文件变更

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| [packages/spark-app/src/plugins/registry.ts](../packages/spark-app/src/plugins/registry.ts) | 270 | 核心注册表和管理器 |
| [packages/spark-app/src/plugins/presets.ts](../packages/spark-app/src/plugins/presets.ts) | 100 | 内置插件预设 |
| [packages/spark-app/src/plugins/index.ts](../packages/spark-app/src/plugins/index.ts) | 20 | 模块导出 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| [packages/spark-app/src/index.ts](../packages/spark-app/src/index.ts) | 新增插件管理 API 导出 |
| [src/main.ts](../src/main.ts) | 从 `@spark-view/spark-app` 导入插件管理 |

### 删除文件

| 文件 | 说明 |
|------|------|
| `src/config/plugin-registry.ts` | ✅ 已删除，功能已迁移到 spark-app |

## 🔄 迁移指南

### 旧代码（应用层）

```typescript
// ❌ 旧方式：从应用层导入（已删除）
// import { PluginRegistry, PluginManager } from '@/config/plugin-registry'
```

### 新代码（spark-app）

```typescript
// ✅ 新方式：从 spark-app 导入
import { PluginRegistry, PluginManager } from '@spark-view/spark-app'
```

### 向后兼容

## ⚙️ 不兼容变更

旧路径已删除，必须更新为新路径：

```typescript
// ❌ 已删除
// import { PluginRegistry } from '@/config/plugin-registry'

// ✅ 必须使用新路径
import { PluginRegistry } from '@spark-view/spark-app'
```

## 📊 架构对比

### Before（应用层实现）

```
src/
├── config/
│   ├── loader.ts              # 配置加载
│   └── types.ts               # 配置类型
└── main.ts                     # ❌ 直接使用应用层插件管理
```

**问题**：
- 插件管理与应用配置耦合
- 无法跨项目复用
- 不符合分层原则

### After（spark-app 基础设施）

```
packages/spark-app/
└── src/
    ├── plugins/               # ✅ 插件管理（独立模块）
    │   ├── registry.ts
    │   ├── presets.ts
    │   └── index.ts
    └── index.ts               # ✅ 统一导出

src/
├── config/
│   ├── loader.ts              # 配置加载（解耦）
│   ├── plugin-registry.ts     # ⚠️ 废弃（重新导出）
│   main.ts                     # ✅ 使用 spark-app 插件管理
```

**优势**：
- ✅ 插件管理成为基础设施
- ✅ 可跨项目复用
- ✅ 符合分层架构
- ✅ 职责更清晰

## 🚀 使用示例

### 在应用中使用

```typescript
import { 
  SparkApp,
  registerBuiltinPlugins,
  PluginManager 
} from '@spark-view/spark-app'

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

### 在其他 SPARK 应用中复用

```typescript
// 其他基于 SPARK 的应用
import { PluginManager, registerBuiltinPlugins } from '@spark-view/spark-app'

// 直接使用，无需重新实现
registerBuiltinPlugins()
const plugins = await PluginManager.loadPlugins({
  'element-plus': true,
  'vxe-table': { enabled: true, options: { ... } }
})
```

## 📈 架构改进

### 符合 SPARK 分层架构

```
┌─────────────────────────────────────────────┐
│  Application Layer (src/)                   │
│  - 业务配置                                  │
│  - 应用启动                                  │
│  - 使用 spark-app 提供的服务                │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  @spark-view/spark-app                      │
│  ✨ Plugins (新增)                          │
│  - 插件注册表                                │
│  - 插件管理器                                │
│  - 内置插件预设                              │
│  + Logger, Auth, Router, Bootstrap         │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│  @spark-view/spark-component                │
│  - 组件系统                                  │
│  - 能力系统                                  │
└─────────────────────────────────────────────┘
```

### 关注点分离

| 层级 | 职责 | 示例 |
|------|------|------|
| **应用层** | 业务配置、应用启动 | `main.ts`, `config/*.json` |
| **基础设施层** | 通用服务、插件管理 | `@spark-view/spark-app` |
| **组件层** | 组件系统、能力系统 | `@spark-view/spark-component` |

## ✅ 验证结果

### 类型检查

```bash
pnpm run typecheck
# ✅ 通过（0 errors）
```

### API 导出

```typescript
// ✅ 可从 spark-app 导入
import {
  PluginRegistry,
  PluginManager,
  registerBuiltinPlugins,
  type PluginConfig,
  type PluginLoader,
  type PluginInstance
} from '@spark-view/spark-app'
```

### 向后兼容

### 1. 在 spark-app 中注册通用插件

```typescript
// packages/spark-app/src/plugins/presets.ts
export function registerBuiltinPlugins() {
  PluginRegistry.registerAll({
    'element-plus': { ... },
    'vxe-table': { ... }
  })
}
```

### 2. 在应用层注册特定插件

```typescript
// src/config/custom-plugins.ts
import { PluginRegistry } from '@spark-view/spark-app'

export function registerAppPlugins() {
  PluginRegistry.register('my-business-plugin', {
    loader: () => import('./plugins/my-plugin')
  })
}
```

### 3. 统一的插件配置

```json
// config/default.json
{
  "plugins": {
    "element-plus": {
      "enabled": true,
      "options": { "size": "default" }
    }
  }
}
```

## 📚 相关文档

- [插件配置指南](./PLUGIN_CONFIGURATION.md)
- [SparkApp API 文档](../packages/spark-app/README.md)
- [架构设计文档](./SPARK_ARCHITECTURE.md)

## 🔗 PR/Issue 参考

- **Issue**: 插件管理应该在 SparkApp 层
- **类型**: 架构改进
- **优先级**: 高
- **状态**: ✅ 已完成

---

**总结**: 将插件管理提升到 `@spark-view/spark-app`，成为应用层基础设施的一部分，提高了架构的清晰度和代码的复用性。
