# Pages Configuration

该目录包含所有动态页面的配置文件，包括表单规则、页面数据、样式和脚本。

## 📍 位置说明

**为什么在 public/ 下？**

- ✅ **静态资源** - 页面配置是运行时加载的 JSON/CSS/JS，不参与构建
- ✅ **直接访问** - 可通过 `/pages-config/xxx` HTTP 路径访问
- ✅ **标准实践** - public/ 文件直接复制到 dist/，符合 Vite 惯例
- ✅ **清晰分离** - 配置数据与源码分离，职责明确

## 目录结构

```
public/pages-config/
├── routes.json                 # 路由配置（所有页面）
└── {page-id}/                  # 页面目录
    ├── rule.json               # form-create 规则（必需）
    ├── pagedata.json           # 页面数据配置（必需）
    ├── style.css               # 页面样式（可选）
    └── script.js               # 页面脚本（可选）
```

## 文件说明

### routes.json - 路由配置
定义所有可用页面的路由信息：

```json
[
  {
    "path": "/users",
    "name": "users",
    "pageId": "users",
    "meta": {
      "title": "用户管理",
      "icon": "User"
    }
  }
]
```

### rule.json - 表单规则
基于 [form-create](http://www.form-create.com/) 的表单配置：

```json
[
  {
    "type": "input",
    "field": "name",
    "title": "用户名"
  }
]
```

### pagedata.json - 页面数据
包含数据集定义和零代码配置：

```json
{
  "dataSets": {
    "Users": {
      "tableName": "Users",
      "columns": [...]
    }
  },
  "zeroCode": {
    "Users": {
      "api": "/api/getUsers",
      "autoLoad": true
    }
  }
}
```

### style.css - 页面样式
可选的页面级 CSS，自动添加作用域隔离。

### script.js - 页面脚本
可选的页面级 JavaScript，导出函数供页面使用：

```javascript
export const handleClick = () => {
  console.log('Button clicked')
}

export const __init__ = () => {
  console.log('Page initialized')
}
```

## 使用方式

### 应用代码中加载

```typescript
// src/services/page-config.ts
import { getPageConfig } from '@/services/page-config'

const config = await getPageConfig('users')
// config 包含 rule 和 data
```

### 路径别名配置

**Vite** (vite.config.ts):
```typescript
alias: {
  '/pages-config': path.resolve(__dirname, 'public', 'pages-config')
}
```

**TypeScript** (tsconfig.typecheck.json):
```json
{
  "paths": {
    "/pages-config/*": ["./public/pages-config/*"]
  }
}
```

### 动态导入示例

```typescript
// 导入路由配置
import routes from '/pages-config/routes.json'

// 动态导入页面配置
const rule = await import(`/pages-config/${pageId}/rule.json`)
const data = await import(`/pages-config/${pageId}/pagedata.json`)

// Glob 导入所有脚本
const scripts = import.meta.glob('/pages-config/*/script.js')
```

## 开发工作流

### 1. 创建新页面

```bash
mkdir public/pages-config/my-page
cd public/pages-config/my-page
```

### 2. 添加配置文件

```bash
touch rule.json pagedata.json style.css script.js
```

### 3. 注册路由

在 `routes.json` 中添加路由条目。

### 4. 访问页面

开发环境：`http://localhost:5173/my-page`

## 架构优势

### 与 src/ 的关系

```
src/                    # 应用源码（参与构建）
  services/             # API 服务层
    page-config.ts      # 加载页面配置

public/                 # 静态资源（直接复制）
  pages-config/         # 页面配置数据
    users/
    settings/
```

- `src/services/page-config.ts` 负责加载配置
- `public/pages-config/` 存储配置数据
- 职责清晰，便于维护

### 与 mocks/ 的关系

- **mocks/** - 开发工具（提供 Mock API）
- **public/pages-config/** - 应用数据（运行时加载）
- 开发环境：mocks/api.ts 拦截请求并从 public/pages-config/ 读取
- 生产环境：直接从 public/pages-config/ 或真实 API 加载

## 最佳实践

### 文件组织
- ✅ 每个页面一个目录
- ✅ 使用 kebab-case 命名（users, user-settings）
- ✅ 必需文件：rule.json, pagedata.json
- ✅ 可选文件：style.css, script.js

### 数据隔离
- ✅ 每个页面独立的数据集
- ✅ 避免跨页面数据依赖
- ✅ 使用零代码配置自动加载数据

### 性能优化
- ✅ 使用动态导入（按需加载）
- ✅ 避免在 rule.json 中嵌入大量数据
- ✅ 大数据集使用 API 加载

## 相关文档

- [form-create 文档](http://www.form-create.com/)
- [DataSet API 文档](../../packages/spark-data/README.md)
- [零代码功能指南](../../docs/data/Zero-Code-Features.md)
