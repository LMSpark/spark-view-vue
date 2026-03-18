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

```
public/pages-config/
  <pageId>/
      rule.json         # 页面规则（组件树）
      pagedata.json     # 页面数据
      script.js         # 页面脚本（可选）
```

### 2. 页面规则 (rule.json)

```json
{
  "type": "container",
  "id": "root",
  "children": [
    {
      "type": "spark-ej2-grid",
      "id": "userGrid",
      "props": {
        "dataSource": "@{dataSet.Users}"
      }
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

## 与 L1 (spark-app) 集成

本包依赖 [spark-app](../spark-app/README.md) 提供的基础设施：

- **Logger** - 使用 `createLogger(scope)` 创建作用域日志
- **符号常量** - 使用 `DefaultConfig`、`ErrorCodes`
- **错误处理** - 统一错误码和消息
- **权限过滤** - 通过 `beforeRegister` 钩子集成

详细集成说明请查阅 [INTEGRATION.md](./INTEGRATION.md)。

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

```json
{
  "@spark-view/spark-app": "workspace:*",
  "vue-router": "^4.2.0"
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
