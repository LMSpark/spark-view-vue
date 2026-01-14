# 🚀 SSR 快速开始指南

## 第一步：安装依赖

```bash
cd packages/element-ui/src/demo/ts-version
pnpm install
```

## 第二步：运行 SSR 开发服务器

```bash
pnpm dev:ssr
```

访问 http://localhost:3000

## 第三步：对比 CSR 和 SSR

### CSR 模式（客户端渲染）
```bash
pnpm dev
```

**特点：**
- ✅ 空白 HTML，JavaScript 加载后渲染
- ✅ 适合后台管理系统
- ❌ SEO 不友好

### SSR 模式（服务端渲染）  
```bash
pnpm dev:ssr
```

**特点：**
- ✅ 完整 HTML 内容，首屏即可见
- ✅ SEO 友好
- ✅ 社交媒体预览支持
- ⚡ 首屏加载更快

## 验证 SSR 是否工作

### 方法 1：查看页面源代码
在浏览器中右键 → "查看网页源代码"

**CSR 模式：**
```html
<div id="app"></div>  <!-- 空的 -->
```

**SSR 模式：**
```html
<div id="app">
  <!-- 完整的渲染内容 -->
  <div class="el-button">...</div>
</div>
```

### 方法 2：禁用 JavaScript
1. 打开浏览器开发者工具
2. Settings → Disable JavaScript
3. 刷新页面

**CSR 模式：** 白屏  
**SSR 模式：** 页面内容可见（但不可交互）

## 生产构建和部署

### 构建
```bash
pnpm build:ssr
```

生成文件：
- `dist/client/` - 客户端静态资源
- `dist/server/` - 服务端代码

### 运行生产服务器
```bash
pnpm preview:ssr
```

## 项目结构说明

```
├── src/
│   ├── app.ts              # ⭐ 应用工厂（CSR/SSR 共用）
│   ├── entry-client.ts     # ⭐ 客户端入口
│   ├── entry-server.ts     # ⭐ 服务端入口
│   └── ...
├── server.ts               # ⭐ SSR 服务器
├── index.html              # HTML 模板（含 <!--ssr-outlet-->）
└── vite.config.ts          # Vite 配置（支持 SSR）
```

## 常见问题

### Q: Mock API 在 SSR 模式下不工作？
A: vite-plugin-mock 主要用于开发模式。生产环境 SSR 需要真实 API 或在 server.ts 中实现 Mock。

### Q: 出现 "window is not defined" 错误？
A: 在服务端渲染时不能使用浏览器 API。使用条件判断：
```typescript
if (typeof window !== 'undefined') {
  // 只在客户端执行
}
```

### Q: Element Plus 样式丢失？
A: 已在 vite.config.ts 中配置 `ssr.noExternal: ['element-plus']`

## 下一步

查看完整文档：[README_SSR.md](../architecture/README_SSR.md)

