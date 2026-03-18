# SPARK 0.6.0 迁移指南

> **适用版本**：从 0.5.x 升级到 0.6.0
>
> **发布日期**：计划 2026-Q2

---

## 🚨 破坏性变更清单

| 变更项 | 影响范围 | 迁移难度 |
|--------|---------|---------|
| 移除 `authService` 单例 | spark-app | ⭐ 简单 |
| 移除 `PluginRegistry` 静态方法 | spark-app | ⭐ 简单 |
| 移除 `registerComponents` 选项 | spark-app/start | ⭐ 简单 |
| 移除 `FileCacheEntry` 类型 | spark-utils | ⭐ 简单 |

---

## 1. authService → APP_SERVICES.auth

### 变更说明

`authService` 单例已废弃，改为通过能力系统 `APP_SERVICES.auth` 访问。

### 迁移步骤

**0.5.x（旧）**：
```typescript
import { authService } from '@spark-view/spark-app'

// 组件外部
authService.login(credentials)
authService.logout()
authService.checkAuth()
```

**0.6.x（新）**：
```typescript
import { APP_SERVICES } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'

// 组件内部
const { consume } = useSparkComponent(props.config)
const services = consume(APP_SERVICES)
services?.auth?.login(credentials)
services?.auth?.logout()
services?.auth?.checkAuth()

// 或使用应用层 bootstrap 注入的实例
import { start } from '@spark-view/spark-app'
const app = await start({
  auth: {
    loginUrl: '/api/auth/login',
    // ...其他配置
  }
})
// app 内部已通过 APP_SERVICES 提供 auth 能力
```

### 代码搜索

```bash
# 查找需要迁移的代码
grep -r "authService" --include="*.ts" --include="*.vue" src/
```

---

## 2. PluginRegistry → getGlobalPluginRegistry()

### 变更说明

`PluginRegistry` 的静态方法（`register`, `get`, `has`, `clear` 等）已废弃，改为通过 `getGlobalPluginRegistry()` 获取注册表实例。

### 迁移步骤

**0.5.x（旧）**：
```typescript
import { PluginRegistry } from '@spark-view/spark-app'

PluginRegistry.register('my-plugin', loader)
PluginRegistry.registerAll({ 'plugin-a': loaderA, 'plugin-b': loaderB })
const plugin = PluginRegistry.get('my-plugin')
const exists = PluginRegistry.has('my-plugin')
PluginRegistry.unregister('my-plugin')
PluginRegistry.clear()
```

**0.6.x（新）**：
```typescript
import { getGlobalPluginRegistry } from '@spark-view/spark-app'

const registry = getGlobalPluginRegistry()

registry.register('my-plugin', loader)
registry.registerAll({ 'plugin-a': loaderA, 'plugin-b': loaderB })
const plugin = registry.get('my-plugin')
const exists = registry.has('my-plugin')
registry.unregister('my-plugin')
registry.clear()
```

### 批量迁移脚本

```javascript
// migrate-plugin-registry.js
const fs = require('fs')
const path = require('path')

const files = fs.readdirSync('src', { recursive: true })
  .filter(f => f.endsWith('.ts') || f.endsWith('.vue'))

files.forEach(file => {
  const filePath = path.join('src', file)
  let content = fs.readFileSync(filePath, 'utf-8')
  
  if (content.includes('PluginRegistry.')) {
    // 添加 import
    if (!content.includes('getGlobalPluginRegistry')) {
      content = content.replace(
        /import\s*{\s*([^}]*PluginRegistry[^}]*)\s*}\s*from\s*['"]@spark-view\/spark-app['"]/,
        `import { $1, getGlobalPluginRegistry } from '@spark-view/spark-app'`
      )
    }
    
    // 替换静态调用
    content = content.replace(/PluginRegistry\.(\w+)/g, 'getGlobalPluginRegistry().$1')
    
    fs.writeFileSync(filePath, content)
    console.log(`Updated: ${filePath}`)
  }
})
```

---

## 3. registerComponents 选项移除

### 变更说明

`start()` 函数的 `registerComponents` 选项已移除，框架现在自动发现并注册组件。

### 迁移步骤

**0.5.x（旧）**：
```typescript
import { start } from '@spark-view/spark-app'
import { registerComponents } from 'virtual:spark-components'

start({
  registerComponents,  // ❌ 已废弃
  // ...其他配置
})
```

**0.6.x（新）**：
```typescript
import { start } from '@spark-view/spark-app'

start({
  // registerComponents 选项已移除，无需传递
  // 框架自动通过 Vite 插件发现并注册组件
})
```

### 注意事项

- 确保 `vite.config.ts` 中已配置 `vite-plugin-spark-components`
- 如需手动注册组件，使用 `Spark.register()` API

---

## 4. FileCacheEntry → CacheEntry<string>

### 变更说明

`FileCacheEntry` 类型别名已移除，改用泛型 `CacheEntry<string>`。

### 迁移步骤

**0.5.x（旧）**：
```typescript
import type { FileCacheEntry } from '@spark-view/spark-utils'

const cache: Map<string, FileCacheEntry> = new Map()
```

**0.6.x（新）**：
```typescript
import type { CacheEntry } from '@spark-view/spark-utils'

const cache: Map<string, CacheEntry<string>> = new Map()
```

---

## 📋 迁移检查清单

在升级前，请逐项检查：

- [ ] 搜索并替换所有 `authService` 引用
- [ ] 搜索并替换所有 `PluginRegistry.` 静态调用
- [ ] 移除 `start()` 配置中的 `registerComponents` 选项
- [ ] 替换 `FileCacheEntry` 类型为 `CacheEntry<string>`
- [ ] 运行 `pnpm run typecheck` 验证类型正确
- [ ] 运行 `pnpm run test` 确保测试通过
- [ ] 更新项目文档中的示例代码

---

## 🔧 自动迁移工具

我们提供了 codemod 脚本帮助自动迁移：

```bash
# 安装 codemod 工具
npx @spark-view/codemod@latest --version 0.6.0

# 预览变更（不修改文件）
npx @spark-view/codemod@latest --dry-run src/

# 执行迁移
npx @spark-view/codemod@latest src/
```

---

## ❓ 常见问题

### Q: 为什么移除 authService 单例？

A: 单例模式与能力系统的依赖注入理念冲突，且难以在测试中 mock。通过 `APP_SERVICES.auth` 能力键，可以：
- 在测试中轻松注入 mock 实现
- 支持多租户场景下的实例隔离
- 保持与其他能力（router、logger）的一致性

### Q: PluginRegistry 静态方法有什么问题？

A: 静态方法绑定到类本身，难以在测试中清理状态。使用 `getGlobalPluginRegistry()` 返回的实例可以：
- 使用 `createPluginRegistry()` 创建隔离实例（测试用）
- 避免测试间状态泄露
- 支持未来的多注册表场景

### Q: 如何验证迁移是否完成？

A: 运行以下命令：

```bash
# 类型检查
pnpm run typecheck

# 搜索残留的废弃 API
grep -r "authService\|PluginRegistry\.\|registerComponents\|FileCacheEntry" \
  --include="*.ts" --include="*.vue" src/
```

---

## 📚 相关文档

- [能力系统设计](../../.github/copilot-instructions.md#能力体系)
- [CHANGELOG](../../CHANGELOG.md)
