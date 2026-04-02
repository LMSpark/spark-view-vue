# 配置系统指南

SPARK 支持多租户配置和多种配置源（本地/远程/混合），实现灵活的应用定制。

## 配置层级

```
默认配置 (default.json)
    ↓ 深度合并
租户配置 (tenant-{id}.json)
    ↓ 覆盖
环境变量 (import.meta.env)
    ↓
最终配置
```

### 文件结构

```
public/config/
  default.json              # 默认配置（基线）
  tenants/
    tenant-demo.json        # 演示租户
    tenant-enterprise.json  # 企业租户
```

---

## 多租户配置

### 默认配置 (default.json)

```json
{
  "router": { "mode": "history" },
  "plugins": { "elementPlus": true, "vxeTable": true },
  "pageConfig": {
    "source": "local",
    "localPrefix": "/pages-config",
    "enableCache": true,
    "homePath": "/home"
  },
  "config": {
    "apiBaseUrl": "/api",
    "logLevel": "debug",
    "features": { "enableAI": false, "enableExport": true }
  },
  "logger": { "level": "debug", "enableColors": true }
}
```

### 租户配置（仅写差异）

```json
{
  "tenant": {
    "tenantId": "demo",
    "tenantName": "演示租户",
    "theme": { "primaryColor": "#1890ff" }
  },
  "config": { "apiBaseUrl": "/api/demo" },
  "pageConfig": { "homePath": "/dashboard" }
}
```

### 合并规则

- **深度合并**：嵌套对象递归合并
- **覆盖优先**：租户配置覆盖默认值
- **数组替换**：数组类型直接替换，不合并
- **undefined 忽略**：不会覆盖默认值

### 租户识别（按优先级）

1. **URL 参数**：`?tenant=demo`（最高优先级）
2. **子域名**：`demo.example.com`
3. **localStorage**：`tenantId` 键
4. **Cookie**：`tenantId=demo`

```typescript
import { TenantResolver, loadAppConfig } from '@/config/loader'

// 自动识别租户并加载合并配置
const config = await loadAppConfig()

// 或手动设置
TenantResolver.save('demo')
```

---

## 配置源模式

### 本地模式（默认）

```json
{ "pageConfig": { "source": "local", "localPrefix": "/pages-config" } }
```

页面配置从后端 `spark-ai-server/data/pages-config/` 目录加载（通过 API 访问）。

### 远程模式

```json
{
  "pageConfig": {
    "source": "remote",
    "apiBaseUrl": "https://api.example.com",
    "enableCache": true,
    "cacheExpiry": 300000
  }
}
```

从远程 API 加载页面配置，支持缓存。

### 混合模式

```json
{
  "pageConfig": {
    "source": "hybrid",
    "localPrefix": "/pages-config",
    "apiBaseUrl": "https://api.example.com",
    "fallbackToLocal": true
  }
}
```

优先远程，失败时回退本地。

---

## 环境变量覆盖

| 环境 | logger.level | enableMock | enableRemote |
|------|------------|------------|--------------|
| DEV | `debug` | `true` | `false` |
| PROD | `info` | `false` | `true` |

自定义环境变量（`.env` 文件）：

```env
VITE_API_BASE_URL=https://api.example.com
```

---

## API 参考

```typescript
// ConfigLoader
const loader = ConfigLoader.getInstance()
const config = await loader.loadConfig('demo')  // 加载合并配置
loader.clearCache()                              // 清除缓存

// TenantResolver
TenantResolver.resolve()          // 综合识别租户 ID
TenantResolver.fromQuery()        // 从 URL 参数
TenantResolver.fromSubdomain()    // 从子域名
TenantResolver.save('demo')       // 保存租户 ID
```

---

## 测试（Mock API）

使用 `tools/mock-config-api.mjs` 启动模拟服务器：

```bash
node tools/mock-config-api.mjs
# 默认端口 3001
```

测试远程模式：

```json
{
  "pageConfig": {
    "source": "remote",
    "apiBaseUrl": "http://localhost:3001/api"
  }
}
```

Mock API 端点（配置类）：

| 端点 | 说明 |
|------|------|
| `GET /api/config/default` | 默认应用配置 |
| `GET /api/config/tenant/:tenantId` | 租户配置 |
| `GET /api/tenants` | 租户列表 |

> 说明：页面配置文件本身仍由 Java 后端管理，正式路径是 `spark-ai-server/data/pages-config/`，不通过这个 mock 工具提供。

---

## 新增租户

1. 创建 `public/config/tenants/tenant-{id}.json`（仅写差异配置）
2. 访问 `http://localhost:5173?tenant={id}` 测试
3. 检查控制台：`🏢 租户: xxx (id)`

## 最佳实践

- **default.json** 放通用配置，租户文件仅放差异
- 不同租户使用独立 `apiBaseUrl` 隔离数据
- 用 `features` 对象做功能开关分级
- 生产环境开启 `enableCache` 减少请求
