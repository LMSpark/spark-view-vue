# 远程配置 API 测试指南

本指南说明如何测试 SPARK 应用的远程配置功能。

## 🚀 快速开始

### 方式一：同时启动应用和 Mock API（推荐）

```bash
# 安装依赖（如果尚未安装）
pnpm install

# 同时启动 Vite 开发服务器和 Mock API 服务器
pnpm run dev:full
```

此命令会同时启动：
- **Vite Dev Server**: http://localhost:5173
- **Mock Config API**: http://localhost:3001

### 方式二：分别启动

**终端 1 - 启动 Mock API 服务器**
```bash
pnpm run dev:api
```

**终端 2 - 启动应用开发服务器**
```bash
pnpm run dev
```

## 📡 测试远程配置

### 1. 测试默认配置

访问：http://localhost:5173

应用会从 API 加载默认配置，控制台显示：
```
📡 Loading default config from API: /api/config/default
✅ Default config loaded from API
🏢 租户: 默认配置
```

### 2. 测试租户配置

**Demo 租户**
```
URL: http://localhost:5173?tenant=demo
控制台输出:
📡 Loading default config from API: /api/config/default
✅ Default config loaded from API
📡 Loading tenant config from API: /api/config/tenant/demo
✅ Tenant config loaded from API for: demo
🏢 租户: Demo Company (demo)
```

**Enterprise 租户**
```
URL: http://localhost:5173?tenant=enterprise
控制台输出:
📡 Loading default config from API: /api/config/default
✅ Default config loaded from API
📡 Loading tenant config from API: /api/config/tenant/enterprise
✅ Tenant config loaded from API for: enterprise
🏢 租户: Enterprise Corporation (enterprise)
```

**Test 租户**
```
URL: http://localhost:5173?tenant=test
控制台输出:
📡 Loading default config from API: /api/config/default
✅ Default config loaded from API
📡 Loading tenant config from API: /api/config/tenant/test
✅ Tenant config loaded from API for: test
🏢 租户: Test Tenant (test)
```

### 3. 查看配置详情

访问多租户配置演示页面：
```
http://localhost:5173/tenant-config?tenant=demo
```

页面会显示：
- 当前租户信息
- 应用配置
- 功能开关
- 完整配置 JSON

## 🔌 Mock API 端点

Mock API 服务器提供以下端点：

### 获取默认配置
```bash
curl http://localhost:3001/api/config/default
```

### 获取租户配置
```bash
# Demo 租户
curl http://localhost:3001/api/config/tenant/demo

# Enterprise 租户
curl http://localhost:3001/api/config/tenant/enterprise

# Test 租户
curl http://localhost:3001/api/config/tenant/test
```

### 列出所有租户
```bash
curl http://localhost:3001/api/tenants
```

### 健康检查
```bash
curl http://localhost:3001/health
```

## 🧪 测试降级策略

### 测试 Hybrid 模式（API → 本地文件）

**步骤 1**: 确保配置源为 `hybrid` 模式

编辑 `public/config/default.json`:
```json
{
  "configSource": {
    "type": "hybrid",
    "fallback": {
      "enabled": true,
      "useLocal": true
    }
  }
}
```

**步骤 2**: 停止 Mock API 服务器
```bash
# 找到并终止 Mock API 进程（端口 3001）
```

**步骤 3**: 访问应用
```
URL: http://localhost:5173?tenant=demo
```

**预期结果**：
```
⚠️ Failed to load default config from API: ...
📁 Loading default config from local: /config/default.json
✅ Default config loaded from local file

⚠️ Failed to load tenant config from API for demo: ...
📁 Loading tenant config from local: /config/tenants/tenant-demo.json
✅ Tenant config loaded from local file for: demo

🏢 租户: Demo Company (demo)
```

应用仍然正常启动，使用本地配置文件。

### 测试纯 Remote 模式（仅 API）

**步骤 1**: 修改配置源为 `remote` 模式

编辑 `public/config/default.json`:
```json
{
  "configSource": {
    "type": "remote",
    "api": {
      "defaultConfigEndpoint": "/api/config/default",
      "tenantConfigEndpoint": "/api/config/tenant/{tenantId}",
      "timeout": 5000
    }
  }
}
```

**步骤 2**: 确保 Mock API 正在运行
```bash
pnpm run dev:api
```

**步骤 3**: 访问应用
```
URL: http://localhost:5173?tenant=enterprise
```

**预期结果**：
- 配置完全从 API 加载
- 不会尝试加载本地文件

**步骤 4**: 停止 Mock API 并刷新页面

**预期结果**：
```
❌ Failed to load default config: ...
🏢 租户: 默认配置
```

应用使用最小配置启动（降级到内置配置）。

## 🛠️ 自定义 Mock API

### 添加新租户

编辑 `tools/mock-config-api.mjs`，在 `tenantDatabase` 中添加：

```javascript
const tenantDatabase = new Map([
  // ... existing tenants
  ['custom', {
    tenant: {
      tenantId: 'custom',
      tenantName: 'Custom Tenant',
      tenantCode: 'CUSTOM001',
      theme: {
        primaryColor: '#ff4d4f'
      }
    },
    config: {
      apiBaseUrl: 'https://custom-api.example.com',
      logLevel: 'warn'
    }
  }]
])
```

重启 Mock API 服务器，然后访问：
```
http://localhost:5173?tenant=custom
```

### 模拟网络延迟

Mock API 内置了延迟模拟：
- 默认配置：500ms
- 租户配置：300ms

修改 `delay()` 调用来调整延迟：

```javascript
// 在 mock-config-api.mjs 中
app.get('/api/config/default', async (req, res) => {
  await delay(2000)  // 增加到 2 秒延迟
  // ...
})
```

### 模拟 API 错误

**返回 404**（测试租户不存在）：
```bash
curl http://localhost:3001/api/config/tenant/nonexistent
```

**模拟超时**：设置较长的延迟（超过配置的 timeout）
```javascript
await delay(10000)  // 10 秒，超过默认 5 秒超时
```

## 📊 监控和调试

### Vite 开发服务器

访问：http://localhost:5173

查看浏览器控制台的日志：
- 📡 API 请求
- ✅ 成功加载
- ⚠️ 降级到本地文件
- ❌ 加载失败

### Mock API 服务器

服务器控制台会显示：
```
[2026-02-10T10:30:00.000Z] GET /api/config/default
✅ Returned default config

[2026-02-10T10:30:01.000Z] GET /api/config/tenant/demo
✅ Returned config for tenant: demo
```

### 浏览器 Network 面板

打开开发者工具 → Network 标签，查看：
- 请求 URL
- 响应状态码
- 响应数据
- 请求耗时

## 🔍 故障排查

### API 请求失败（CORS 错误）

**问题**：浏览器控制台显示 CORS 错误

**解决方案**：
1. 确保 Mock API 服务器正在运行
2. 检查 `vite.config.ts` 中的代理配置
3. 确认 Mock API 已启用 CORS（默认已启用）

### 配置未生效

**问题**：租户配置未按预期加载

**解决方案**：
1. 清除浏览器缓存和 ConfigLoader 缓存：
   ```javascript
   // 在浏览器控制台执行
   localStorage.clear()
   location.reload()
   ```
2. 检查控制台日志确认配置加载过程
3. 使用 `/tenant-config` 页面查看完整配置

### Mock API 无法启动

**问题**：端口 3001 已被占用

**解决方案**：
1. 修改端口号：
   ```bash
   PORT=3002 pnpm run dev:api
   ```
2. 更新 `vite.config.ts` 中的代理配置

### 连接超时

**问题**：API 请求超时

**解决方案**：
1. 增加超时时间（在 `default.json` 中）
2. 减少 Mock API 的延迟时间
3. 检查网络连接

## 📚 相关文档

- [远程配置 API 集成指南](../docs/guides/REMOTE_CONFIG_API.md)
- [多租户配置指南](../docs/guides/MULTI_TENANT_CONFIG.md)
- [配置类型定义](../src/config/types.ts)
- [配置加载器源码](../src/config/loader.ts)

## ✅ 测试清单

- [ ] 默认配置从 API 加载成功
- [ ] Demo 租户配置从 API 加载成功
- [ ] Enterprise 租户配置从 API 加载成功
- [ ] Test 租户配置从 API 加载成功
- [ ] 不存在的租户返回 404
- [ ] API 失败时降级到本地文件（hybrid 模式）
- [ ] API 失败时使用最小配置（remote 模式）
- [ ] 租户切换功能正常工作
- [ ] 配置缓存正常工作
- [ ] 多租户配置页面正常显示
