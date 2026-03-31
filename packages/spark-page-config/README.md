# @spark-view/spark-page-config

> SPARK 页面配置层 - 支持本地/远程配置加载、动态路由和配置验证

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-green.svg)](https://vuejs.org/)

## 特性

- **多源加载** - 本地（SPA）/远程（API）/混合模式
- **配置缓存** - 内存缓存，可配置过期时间
- **配置验证** - Schema 验证，确保配置正确
- **脚本沙箱** - 安全执行页面脚本
- **热更新** - 支持配置刷新

## 安装

```bash
pnpm add @spark-view/spark-page-config
```

## 快速开始

### 1. 配置文件结构

本地 SPA 模式（`source: 'local'`）下，页面配置存放于前端静态目录：

```
public/pages-config/
  <pageId>/
      rule.json         # 页面规则（组件树）
      pagedata.json     # 页面数据
      script.js         # 页面脚本（可选）
```

> 生产部署默认使用远程模式（`source: 'remote'`），配置由后端 API 管理（`spark-ai-server/data/pages-config/`）。

### 2. 页面规则 (rule.json)

```json
{
  "type": "container",
  "id": "root",
  "children": [
    {
      "type": "r-table",
      "id": "userGrid",
      "dataKey": "Users@rows"
    }
  ]
}
```

### 3. 使用配置加载器

```typescript
import { createConfigLoader } from '@spark-view/spark-page-config'

// 创建加载器
const loader = createConfigLoader({
  source: 'local',  // 'local' | 'remote' | 'hybrid'
  fileStorage: 'localStorage'  // 'localStorage' | 'sessionStorage' | 'memory'
})

// 加载页面配置
const pageConfig = await loader.loadPageConfig('home')
```

## 核心 API

### ConfigLoader

配置加载器

```typescript
const loader = createConfigLoader({
  source: 'local',           // 加载模式
  fileStorage: 'localStorage', // 缓存存储次层
  timeout: 10000             // 请求超时（毫秒，仅 remote 模式有效）
})

// 加载方法
await loader.loadPageConfig(pageId)          // 加载页面配置（rule + data + script + css）
await loader.loadRule(pageId)               // 加载页面规则
await loader.loadPageData(pageId)            // 加载页面数据
await loader.loadScript(pageId)             // 加载页面脚本
await loader.loadCss(pageId)                // 加载页面样式

// 缓存管理
loader.clearCache()                          // 清空缓存
loader.getCacheStats()                       // 缓存统计
```

### 配置验证

```typescript
import { validateRuleConfig } from '@spark-view/spark-page-config'

// 验证页面规则（返回错误数组，空数组表示有效）
const ruleErrors = validateRuleConfig(ruleConfig)
if (ruleErrors.length > 0) {
  console.error('规则配置无效:', ruleErrors)
}
```

## 与其他 SPARK 包的关系

本包依赖：
- **[spark-data](../spark-data/API.md)** — DataSet / DataView / DataKey 数据模型
- **[spark-utils](../spark-utils/README.md)** — Logger、能力系统基础设施

## 依赖

```json
{
  "@spark-view/spark-data": "workspace:*",
  "@spark-view/spark-utils": "workspace:*"
}
```

## 开发命令

```bash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
```

## License

MIT
