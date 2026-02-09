# 远程配置 API 集成指南

本文档说明如何实现后端 API 来提供多租户配置，以及如何配置前端应用使用远程配置。

## 📋 目录

- [概述](#概述)
- [配置源模式](#配置源模式)
- [API 接口规范](#api-接口规范)
- [前端配置](#前端配置)
- [后端实现示例](#后端实现示例)
- [降级策略](#降级策略)
- [最佳实践](#最佳实践)

## 概述

SPARK 配置系统支持三种配置源模式：

1. **local**：仅从本地 JSON 文件加载
2. **remote**：仅从后端 API 加载
3. **hybrid**（推荐）：优先从 API 加载，失败时降级到本地文件

## 配置源模式

### Local 模式（本地文件）

```json
{
  "configSource": {
    "type": "local",
    "local": {
      "defaultConfigPath": "/config/default.json",
      "tenantConfigTemplate": "/config/tenants/tenant-{tenantId}.json"
    }
  }
}
```

**适用场景**：
- 开发环境
- 静态部署
- 无需动态配置的场景

### Remote 模式（纯 API）

```json
{
  "configSource": {
    "type": "remote",
    "api": {
      "defaultConfigEndpoint": "/api/config/default",
      "tenantConfigEndpoint": "/api/config/tenant/{tenantId}",
      "timeout": 5000,
      "headers": {
        "Authorization": "Bearer xxx"
      }
    }
  }
}
```

**适用场景**：
- 生产环境
- 需要动态配置
- 集中式配置管理

### Hybrid 模式（推荐）

```json
{
  "configSource": {
    "type": "hybrid",
    "api": {
      "defaultConfigEndpoint": "/api/config/default",
      "tenantConfigEndpoint": "/api/config/tenant/{tenantId}",
      "timeout": 5000
    },
    "local": {
      "defaultConfigPath": "/config/default.json",
      "tenantConfigTemplate": "/config/tenants/tenant-{tenantId}.json"
    },
    "fallback": {
      "enabled": true,
      "useLocal": true
    }
  }
}
```

**适用场景**：
- 生产环境（推荐）
- 需要高可用性
- API 不稳定时的降级方案

## API 接口规范

### 1. 获取默认配置

**请求**
```http
GET /api/config/default
Content-Type: application/json
```

**响应**
```json
{
  "router": {
    "mode": "history"
  },
  "plugins": {
    "elementPlus": true,
    "vxeTable": true,
    "formCreate": true
  },
  "config": {
    "apiBaseUrl": "/api",
    "logLevel": "info",
    "version": "1.0.0"
  },
  "logger": {
    "level": "info",
    "enableRemote": true
  }
}
```

### 2. 获取租户配置

**请求**
```http
GET /api/config/tenant/{tenantId}
Content-Type: application/json
```

**路径参数**
- `tenantId`: 租户唯一标识符

**响应**
```json
{
  "tenant": {
    "tenantId": "demo",
    "tenantName": "Demo Company",
    "tenantCode": "DEMO001",
    "logo": "https://example.com/logo.png",
    "theme": {
      "primaryColor": "#1890ff"
    }
  },
  "config": {
    "apiBaseUrl": "https://demo-api.example.com",
    "logLevel": "debug"
  },
  "pageConfig": {
    "homePath": "/demo-home"
  }
}
```

### 3. 错误响应

**404 Not Found**（租户不存在）
```json
{
  "error": "TENANT_NOT_FOUND",
  "message": "Tenant 'xxx' not found",
  "code": 404
}
```

**500 Internal Server Error**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to load configuration",
  "code": 500
}
```

## 前端配置

### 1. 修改 default.json

编辑 `public/config/default.json`，设置配置源：

```json
{
  "configSource": {
    "type": "hybrid",
    "api": {
      "defaultConfigEndpoint": "https://your-api.com/api/config/default",
      "tenantConfigEndpoint": "https://your-api.com/api/config/tenant/{tenantId}",
      "timeout": 5000,
      "headers": {
        "X-App-Version": "1.0.0"
      }
    },
    "local": {
      "defaultConfigPath": "/config/default.json",
      "tenantConfigTemplate": "/config/tenants/tenant-{tenantId}.json"
    },
    "fallback": {
      "enabled": true,
      "useLocal": true
    }
  }
}
```

### 2. 环境变量覆盖

在 `.env.production` 中设置：

```bash
# API 基础地址
VITE_CONFIG_API_BASE=https://config-api.example.com

# 配置端点
VITE_CONFIG_DEFAULT_ENDPOINT=/api/config/default
VITE_CONFIG_TENANT_ENDPOINT=/api/config/tenant/{tenantId}

# 超时时间（毫秒）
VITE_CONFIG_API_TIMEOUT=5000
```

## 后端实现示例

### Node.js (Express)

```javascript
const express = require('express')
const app = express()

// 存储租户配置（实际应从数据库读取）
const tenantConfigs = new Map([
  ['demo', {
    tenant: {
      tenantId: 'demo',
      tenantName: 'Demo Company',
      tenantCode: 'DEMO001',
      theme: { primaryColor: '#1890ff' }
    },
    config: {
      apiBaseUrl: 'https://demo-api.example.com',
      logLevel: 'debug'
    }
  }],
  ['enterprise', {
    tenant: {
      tenantId: 'enterprise',
      tenantName: 'Enterprise Corp',
      tenantCode: 'ENT001',
      theme: { primaryColor: '#722ed1' }
    },
    config: {
      apiBaseUrl: 'https://enterprise-api.example.com',
      logLevel: 'info',
      features: {
        enableAI: true,
        enableExport: true
      }
    }
  }]
])

// 获取默认配置
app.get('/api/config/default', (req, res) => {
  const defaultConfig = {
    router: { mode: 'history' },
    mountTarget: '#app',
    plugins: {
      elementPlus: true,
      vxeTable: true,
      formCreate: true
    },
    config: {
      apiBaseUrl: '/api',
      logLevel: 'info',
      version: '1.0.0'
    },
    logger: {
      level: 'info',
      enableRemote: true,
      remoteEndpoint: '/api/logs'
    }
  }
  
  res.json(defaultConfig)
})

// 获取租户配置
app.get('/api/config/tenant/:tenantId', (req, res) => {
  const { tenantId } = req.params
  
  const tenantConfig = tenantConfigs.get(tenantId)
  
  if (!tenantConfig) {
    return res.status(404).json({
      error: 'TENANT_NOT_FOUND',
      message: `Tenant '${tenantId}' not found`,
      code: 404
    })
  }
  
  res.json(tenantConfig)
})

app.listen(3000, () => {
  console.log('Config API server running on port 3000')
})
```

### 数据库集成示例

```javascript
const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// 从数据库获取租户配置
app.get('/api/config/tenant/:tenantId', async (req, res) => {
  const { tenantId } = req.params
  
  try {
    // 查询租户信息
    const tenantQuery = await pool.query(
      'SELECT * FROM tenants WHERE tenant_id = $1',
      [tenantId]
    )
    
    if (tenantQuery.rows.length === 0) {
      return res.status(404).json({
        error: 'TENANT_NOT_FOUND',
        message: `Tenant '${tenantId}' not found`,
        code: 404
      })
    }
    
    const tenant = tenantQuery.rows[0]
    
    // 查询租户配置
    const configQuery = await pool.query(
      'SELECT config_data FROM tenant_configs WHERE tenant_id = $1',
      [tenantId]
    )
    
    const tenantConfig = {
      tenant: {
        tenantId: tenant.tenant_id,
        tenantName: tenant.tenant_name,
        tenantCode: tenant.tenant_code,
        logo: tenant.logo_url,
        theme: tenant.theme_config
      },
      ...(configQuery.rows[0]?.config_data || {})
    }
    
    res.json(tenantConfig)
  } catch (error) {
    console.error('Database error:', error)
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to load tenant configuration',
      code: 500
    })
  }
})
```

## 降级策略

### 加载流程

```
1. 尝试从 API 加载配置
   └─ 成功 → 使用 API 配置
   └─ 失败 ↓

2. 检查是否启用降级
   └─ 未启用 → 返回最小配置
   └─ 已启用 ↓

3. 尝试从本地文件加载
   └─ 成功 → 使用本地配置
   └─ 失败 → 返回最小配置
```

### 最小配置

当所有配置源都失败时，系统会使用内置的最小配置：

```typescript
{
  router: { mode: 'history' },
  mountTarget: '#app',
  plugins: {
    elementPlus: true,
    vxeTable: true,
    formCreate: true
  },
  config: {
    apiBaseUrl: '/api',
    logLevel: 'debug',
    version: '1.0.0'
  }
}
```

## 最佳实践

### 1. 使用 Hybrid 模式

生产环境推荐使用 `hybrid` 模式，确保在 API 不可用时应用仍能正常启动。

### 2. 合理设置超时时间

```json
{
  "api": {
    "timeout": 5000  // 5秒超时（推荐）
  }
}
```

- 开发环境：3-5 秒
- 生产环境：5-10 秒

### 3. 配置缓存策略

前端会自动缓存配置，避免重复请求。可以通过以下方式清除缓存：

```typescript
import { ConfigLoader } from '@/config/loader'

// 清除配置缓存
ConfigLoader.getInstance().clearCache()

// 重新加载配置
const newConfig = await ConfigLoader.getInstance().loadConfig(tenantId)
```

### 4. 监控配置加载

在应用启动时，配置加载器会输出日志：

```
📡 Loading default config from API: /api/config/default
✅ Default config loaded from API

📡 Loading tenant config from API: /api/config/tenant/demo
✅ Tenant config loaded from API for: demo

🏢 租户: Demo Company (demo)
```

监控这些日志可以帮助诊断配置加载问题。

### 5. 安全性考虑

**API 认证**：
```json
{
  "api": {
    "headers": {
      "Authorization": "Bearer ${AUTH_TOKEN}",
      "X-App-Key": "your-app-key"
    }
  }
}
```

**HTTPS**：生产环境必须使用 HTTPS

**敏感信息**：不要在配置中存储密码、密钥等敏感信息

### 6. 版本管理

在配置中包含版本信息：

```json
{
  "config": {
    "version": "1.2.3",
    "minClientVersion": "1.0.0"
  }
}
```

前端可以检查版本兼容性并提示用户更新。

## 故障排查

### API 请求失败

**症状**：控制台显示 "⚠️ Failed to load config from API"

**解决方案**：
1. 检查 API 地址是否正确
2. 检查网络连接
3. 查看浏览器开发者工具的 Network 标签
4. 确认后端 API 是否正常运行

### 租户配置未生效

**症状**：使用了默认配置而不是租户配置

**解决方案**：
1. 检查租户 ID 是否正确识别
2. 查看控制台日志确认租户配置是否加载
3. 确认后端返回的租户配置格式正确
4. 清除浏览器缓存和 ConfigLoader 缓存

### CORS 错误

**症状**：浏览器控制台显示 CORS 错误

**解决方案**：
在后端添加 CORS 头：

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  next()
})
```

## 参考资料

- [多租户配置指南](./MULTI_TENANT_CONFIG.md)
- [API 参考文档](./API_REFERENCE.md)
- [配置类型定义](../../src/config/types.ts)
- [配置加载器源码](../../src/config/loader.ts)
