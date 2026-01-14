# SSR 移除说明 (Migration to CSR)

## 📋 改动概述

项目已从 **SSR (Server-Side Rendering)** 模式迁移为纯 **CSR (Client-Side Rendering)** 模式。

**迁移日期**: 2026-01-14

## ✅ 已完成的改动

### 1. 备份的 SSR 文件
以下文件已重命名为 `.bak` 备份，如需恢复 SSR 可以还原：
- ✅ `server.ts` → `server.ts.bak`
- ✅ `server-types.d.ts` → `server-types.d.ts.bak`
- ✅ `src/entry-server.ts` → `src/entry-server.ts.bak`
- ✅ `src/entry-client.ts` → `src/entry-client.ts.bak`
- ✅ `src/app.ts` → `src/app.ts.bak`

### 2. package.json 修改

**移除的脚本**:
```json
❌ "dev:ssr": "tsx server.ts"
❌ "build:client": "vite build --outDir dist/client"
❌ "build:server": "vite build --ssr src/entry-server.ts --outDir dist/server"
❌ "build:ssr": "vue-tsc --noEmit && npm run build:client && npm run build:server"
❌ "start": "cross-env NODE_ENV=production node --loader tsx/esm server.ts"
❌ "preview:ssr": "cross-env NODE_ENV=production tsx server.ts"
```

**保留的脚本**:
```json
✅ "dev": "vite"                    # 开发模式（CSR）
✅ "build": "vue-tsc --noEmit && vite build"  # 构建生产版本
✅ "start": "vite preview --port 3000"        # 启动生产预览
✅ "preview": "vite preview --port 3000"      # 预览构建结果
```

**移除的依赖**:
```json
❌ "express": "^5.2.1"           # 不再需要 Express 服务器
❌ "@types/express": "^5.0.6"   # Express 类型定义
❌ "cross-env": "^10.1.0"        # 环境变量工具
❌ "tsx": "^4.21.0"              # TypeScript 执行器
```

**更新的项目信息**:
```json
"name": "form-create-app"  (原: form-create-ssr-app)
"description": "Form Create Application with TypeScript and Vue 3"
"keywords": ["form-create", "vue3", "typescript", "element-plus", "vite"]
              (移除了 "ssr")
```

### 3. vite.config.ts 简化

- ✅ 保持了代码分割优化（manualChunks）
- ✅ 保持了文件命名策略（chunkFileNames、assetFileNames）
- ✅ 移除了 SSR 相关构建配置
- ✅ 添加了 `preview.port: 3000` 配置

### 4. 应用入口

**现在的入口**: `src/main.ts`
- 直接使用 `createApp()` 创建 Vue 应用
- 无需 SSR 的 hydration 逻辑
- 保持了所有现有功能（Element Plus、form-create、EJ2、路由等）

## 🚀 如何使用

### 开发模式
```bash
npm run dev
```
访问: http://localhost:3000

### 构建生产版本
```bash
npm run build
```
输出目录: `dist/`

### 预览生产版本
```bash
npm run preview
# 或
npm start
```
访问: http://localhost:3000

### 清理依赖并重新安装
```bash
# 删除旧的依赖
rm -rf node_modules package-lock.json

# 重新安装（已移除 express, tsx, cross-env 等）
npm install
```

## 📝 架构对比

| 特性 | SSR 模式 | CSR 模式 |
|-----|---------|---------|
| **首屏渲染** | 服务端预渲染 | 客户端渲染 |
| **SEO** | 友好（有预渲染 HTML） | 较差（需额外处理） |
| **服务器要求** | 需要 Node.js 服务器 | 静态文件托管即可 |
| **部署方式** | Node.js 应用 | Nginx/CDN |
| **开发体验** | 需要 SSR 中间件 | Vite 开发服务器 |
| **HMR 速度** | 较慢 | 快速 |
| **构建产物** | client + server | 纯静态文件 |

## 🔄 如何恢复 SSR

如果需要恢复 SSR 模式：

1. **还原备份文件**:
```bash
# 还原所有 .bak 文件
Rename-Item server.ts.bak server.ts
Rename-Item server-types.d.ts.bak server-types.d.ts
Rename-Item src/entry-server.ts.bak src/entry-server.ts
Rename-Item src/entry-client.ts.bak src/entry-client.ts
Rename-Item src/app.ts.bak src/app.ts
```

2. **还原 package.json**:
```bash
git checkout HEAD -- package.json
```

3. **还原 vite.config.ts**:
```bash
git checkout HEAD -- vite.config.ts
```

4. **重新安装依赖**:
```bash
npm install express @types/express cross-env tsx --save
```

5. **运行 SSR 模式**:
```bash
npm run dev:ssr
```

## 📦 部署建议

### 静态托管（推荐）

**Nginx**:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Vercel/Netlify**:
- 直接连接 Git 仓库
- 构建命令: `npm run build`
- 输出目录: `dist`

**CDN**:
- 将 `dist` 目录上传到 CDN
- 配置为 SPA 模式（所有路由返回 index.html）

## ⚠️ 注意事项

### SEO 处理
CSR 模式对 SEO 不友好，如需 SEO 可以：
1. 使用 Prerender.io 等预渲染服务
2. 使用 Vue SSG（Static Site Generation）
3. 恢复 SSR 模式

### 首屏加载
CSR 首屏加载较慢，可以优化：
- ✅ 已启用代码分割（manualChunks）
- ✅ 已配置资源命名策略（缓存优化）
- 🔄 可考虑懒加载路由组件
- 🔄 可考虑使用 CDN 加载第三方库

### 浏览器兼容性
确保目标浏览器支持 ES Modules:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+

## 🔗 相关文档

- [Vite 官方文档](https://vitejs.dev/)
- [Vue 3 CSR 指南](https://vuejs.org/guide/)
- [SPA 部署指南](https://router.vuejs.org/guide/essentials/history-mode.html#example-server-configurations)

## 📊 迁移前后对比

### 构建产物
```
SSR 模式:
dist/
├── client/       # 客户端资源
└── server/       # 服务端渲染代码

CSR 模式:
dist/
├── index.html    # 入口 HTML
├── js/           # JavaScript 文件
├── css/          # CSS 文件
└── assets/       # 其他资源
```

### 启动方式
```bash
# SSR 模式
npm run dev:ssr   # 开发
npm run build:ssr # 构建
npm start         # 生产（需 Node.js）

# CSR 模式
npm run dev       # 开发
npm run build     # 构建
npm run preview   # 生产预览（或任意静态服务器）
```

---

**迁移完成！现在可以享受更简单的 CSR 开发体验。** 🎉
