# 多租户配置指南

## 概述

SPARK 应用支持多租户配置，允许不同租户使用不同的配置，实现应用的灵活定制。

## 架构设计

### 配置层级

```
默认配置 (default.json)
    ↓ (合并)
租户配置 (tenant-{id}.json)
    ↓ (覆盖)
环境变量 (import.meta.env)
    ↓
最终配置
```

### 文件结构

```
public/
  config/
    default.json              # 默认配置（基线）
    tenants/
      tenant-demo.json        # 演示租户配置
      tenant-enterprise.json  # 企业租户配置
      tenant-{id}.json        # 其他租户配置
```

## 配置文件格式

### 默认配置 (default.json)

```json
{
  "router": {
    "mode": "history"
  },
  "mountTarget": "#app",
  "plugins": {
    "elementPlus": true,
    "vxeTable": true,
    "formCreate": true
  },
  "spark": {
    "enabled": true
  },
  "pageConfig": {
    "source": "local",
    "apiBaseUrl": "/api",
    "localPrefix": "/pages-config",
    "enableCache": true,
    "homePath": "/home"
  },
  "config": {
    "apiBaseUrl": "/api",
    "logLevel": "debug",
    "enableMock": true,
    "version": "1.0.0",
    "features": {
      "enableAI": false,
      "enableExport": true,
      "enableOffline": false
    }
  },
  "logger": {
    "level": "debug",
    "enableColors": true,
    "showTimestamp": true,
    "enableRemote": false,
    "remoteEndpoint": "/api/logs"
  }
}
```

### 租户配置 (tenant-{id}.json)

租户配置只需包含需要覆盖的字段：

```json
{
  "tenant": {
    "tenantId": "demo",
    "tenantName": "演示租户",
    "tenantCode": "DEMO",
    "logo": "/assets/logo-demo.png",
    "theme": {
      "primaryColor": "#1890ff"
    }
  },
  "config": {
    "apiBaseUrl": "/api/demo",
    "version": "1.0.0-demo"
  },
  "pageConfig": {
    "apiBaseUrl": "/api/demo",
    "homePath": "/dashboard"
  },
  "logger": {
    "level": "info",
    "enableRemote": true
  }
}
```

## 租户识别

系统支持多种租户识别方式，按优先级排序：

### 1. URL 参数（最高优先级）

```
https://example.com?tenant=demo
```

### 2. 子域名

```
https://demo.example.com
```

系统会自动提取子域名作为租户 ID。

### 3. localStorage

```javascript
localStorage.setItem('tenantId', 'demo')
```

### 4. Cookie

```
tenantId=demo; path=/
```

## 使用方式

### 方式 1: URL 参数切换租户

访问应用时添加 `tenant` 参数：

```
http://localhost:5173?tenant=demo
http://localhost:5173?tenant=enterprise
```

首次访问后，租户 ID 会自动保存到 localStorage。

### 方式 2: 子域名

配置子域名指向同一应用：

```
demo.example.com      → tenant-demo.json
enterprise.example.com → tenant-enterprise.json
```

### 方式 3: 程序化设置

```typescript
import { TenantResolver } from '@/config/loader'

// 保存租户 ID
TenantResolver.save('demo')

// 重新加载页面使配置生效
window.location.reload()
```

## 配置合并规则

1. **深度合并**：嵌套对象会递归合并
2. **覆盖优先**：租户配置覆盖默认配置
3. **undefined 忽略**：租户配置中的 undefined 值不会覆盖默认值
4. **数组替换**：数组类型直接替换，不合并

### 示例

**默认配置：**
```json
{
  "config": {
    "apiBaseUrl": "/api",
    "features": {
      "enableAI": false,
      "enableExport": true
    }
  }
}
```

**租户配置：**
```json
{
  "config": {
    "apiBaseUrl": "/api/demo",
    "features": {
      "enableAI": true
    }
  }
}
```

**最终配置：**
```json
{
  "config": {
    "apiBaseUrl": "/api/demo",  // 被覆盖
    "features": {
      "enableAI": true,          // 被覆盖
      "enableExport": true       // 保留默认值
    }
  }
}
```

## 环境变量覆盖

系统支持通过环境变量覆盖配置：

### 开发环境 (DEV)

```typescript
config.logger.level = 'debug'
config.logger.showTimestamp = true
config.logger.enableRemote = false
config.config.enableMock = true
config.config.logLevel = 'debug'
```

### 生产环境 (PROD)

```typescript
config.logger.level = 'info'
config.logger.showTimestamp = false
config.logger.enableRemote = true
config.config.enableMock = false
config.config.logLevel = 'info'
```

### 自定义环境变量

在 `.env` 文件中配置：

```env
VITE_API_BASE_URL=https://api.example.com
```

系统会自动应用到配置中。

## 新增租户

### 步骤 1: 创建租户配置文件

在 `public/config/tenants/` 目录下创建新文件：

```json
// public/config/tenants/tenant-mycompany.json
{
  "tenant": {
    "tenantId": "mycompany",
    "tenantName": "我的公司",
    "tenantCode": "MYCOMPANY",
    "logo": "/assets/logo-mycompany.png",
    "theme": {
      "primaryColor": "#52c41a"
    }
  },
  "config": {
    "apiBaseUrl": "/api/mycompany"
  }
}
```

### 步骤 2: 测试租户配置

访问：`http://localhost:5173?tenant=mycompany`

### 步骤 3: 验证配置

检查浏览器控制台输出：

```
🏢 租户: 我的公司 (mycompany)
```

## 配置缓存

系统会自动缓存已加载的配置，提升性能。

### 清除缓存

```typescript
import { ConfigLoader } from '@/config/loader'

const loader = ConfigLoader.getInstance()
loader.clearCache()
```

## 最佳实践

### 1. 配置分层

- **default.json**: 存放通用配置
- **tenant-{id}.json**: 仅存放差异化配置

### 2. 租户隔离

- 不同租户使用独立的 API 端点
- 通过 `apiBaseUrl` 区分租户数据

### 3. 主题定制

```json
{
  "tenant": {
    "theme": {
      "primaryColor": "#1890ff",
      "successColor": "#52c41a",
      "warningColor": "#faad14",
      "errorColor": "#f5222d"
    }
  }
}
```

### 4. 功能开关

```json
{
  "config": {
    "features": {
      "enableAI": true,
      "enableExport": false,
      "enableOffline": true
    }
  }
}
```

### 5. 日志策略

不同租户使用不同的日志级别和上报策略：

```json
{
  "logger": {
    "level": "warn",
    "enableRemote": true,
    "remoteEndpoint": "/api/mycompany/logs"
  }
}
```

## 故障排查

### 配置未生效

1. 检查文件路径：`public/config/tenants/tenant-{id}.json`
2. 验证 JSON 格式（使用 JSONLint）
3. 清除浏览器缓存
4. 检查控制台报错

### 租户识别失败

1. 检查 URL 参数格式
2. 验证 localStorage 中的 tenantId
3. 清除 localStorage 重试

### 配置合并异常

1. 检查配置结构是否匹配类型定义
2. 使用浏览器开发工具查看最终配置
3. 查看控制台警告信息

## API 参考

### ConfigLoader

```typescript
// 获取实例
const loader = ConfigLoader.getInstance()

// 加载默认配置
const defaultConfig = await loader.loadDefaultConfig()

// 加载租户配置
const tenantConfig = await loader.loadTenantConfig('demo')

// 加载完整配置（合并后）
const fullConfig = await loader.loadConfig('demo')

// 清除缓存
loader.clearCache()
```

### TenantResolver

```typescript
// 从 URL 参数获取租户 ID
const fromQuery = TenantResolver.fromQuery()

// 从子域名获取租户 ID
const fromSubdomain = TenantResolver.fromSubdomain()

// 从 localStorage 获取租户 ID
const fromLocalStorage = TenantResolver.fromLocalStorage()

// 从 cookie 获取租户 ID
const fromCookie = TenantResolver.fromCookie()

// 综合识别（按优先级）
const tenantId = TenantResolver.resolve()

// 保存租户 ID
TenantResolver.save('demo')
```

### 便捷函数

```typescript
import { loadAppConfig } from '@/config/loader'

// 自动识别租户并加载配置
const config = await loadAppConfig()
```

## 示例场景

### 场景 1: SaaS 多租户应用

每个租户有独立的数据和 UI 定制：

```json
{
  "tenant": {
    "tenantId": "company-a",
    "tenantName": "公司 A",
    "theme": {
      "primaryColor": "#1890ff"
    }
  },
  "config": {
    "apiBaseUrl": "/api/company-a"
  }
}
```

### 场景 2: 白标产品

同一产品为不同客户提供不同品牌：

```json
{
  "tenant": {
    "tenantName": "客户品牌",
    "logo": "/assets/customer-logo.png",
    "theme": {
      "primaryColor": "#custom-color"
    }
  }
}
```

### 场景 3: 功能分级

不同租户开放不同功能：

```json
{
  "config": {
    "features": {
      "enableAI": true,      // 高级版
      "enableExport": true,  // 标准版
      "enableOffline": false // 基础版不支持
    }
  }
}
```
