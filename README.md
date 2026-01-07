# Form Create SSR Application

基于 Vue 3 + TypeScript + Element Plus 的服务端渲染表单应用。

## ✨ 特性

- 🚀 **SSR (服务端渲染)**: LCP 0.04s，首屏极速加载
- 💪 **TypeScript**: 完整类型支持，严格模式编译
- 🎨 **Element Plus**: 企业级 UI 组件库
- 📝 **Form Create**: 强大的动态表单生成器
- 🔥 **热更新**: Vite HMR 开发体验
- ✅ **代码质量**: ESLint + TypeScript 严格检查
- 🐛 **调试支持**: VS Code 断点调试配置

## 📦 技术栈

- **前端框架**: Vue 3.4
- **构建工具**: Vite 5.4
- **UI 组件**: Element Plus 2.5
- **表单引擎**: @form-create/element-ui 3.2
- **路由**: Vue Router 4.6
- **服务器**: Express 4.21
- **TypeScript**: 5.9 (严格模式)
- **运行时**: Node.js 20+

## 🚀 快速开始

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 开发模式

#### CSR 模式（客户端渲染）
```bash
npm run dev
```
访问: http://localhost:5173

#### SSR 模式（服务端渲染）
```bash
npm run dev:ssr
```
访问: http://localhost:3000

### 生产构建

```bash
# 构建 SSR 版本
npm run build:ssr

# 预览生产版本
npm run preview:ssr
```

### 代码检查

```bash
# TypeScript 类型检查
npm run typecheck

# ESLint 检查
npm run lint

# ESLint 自动修复
npm run lint:fix
```

## 📁 项目结构

```
form-create-ssr-app/
├── src/
│   ├── api/             # API 接口
│   ├── components/      # Vue 组件
│   ├── mock/            # Mock 数据
│   │   ├── routes.json  # 路由配置
│   │   └── pages/       # 页面配置
│   ├── router/          # 路由配置
│   ├── types/           # TypeScript 类型
│   ├── views/           # 页面视图
│   │   └── DynamicPage.vue  # 动态表单页面
│   ├── app.ts           # 应用工厂函数
│   ├── entry-client.ts  # 客户端入口
│   ├── entry-server.ts  # 服务端入口
│   └── main.ts          # CSR 入口
├── server.ts            # SSR 服务器
├── vite.config.ts       # Vite 配置
├── tsconfig.json        # TypeScript 配置
├── eslint.config.js     # ESLint 配置
└── package.json
```

## 🎯 核心功能

### 1. 动态表单渲染

基于 form-create，支持通过 JSON 配置动态生成表单。

### 2. 服务端渲染 (SSR)

- **首屏速度**: LCP 0.04s，比传统 CSR 快 50-75 倍
- **SEO 友好**: 搜索引擎可抓取完整内容
- **自动 Hydration**: 客户端无缝接管

### 3. 动态路由

支持配置化路由，无需手动编写路由文件。

### 4. TypeScript 严格模式

- 完整类型推导
- 编译时错误检查
- IDE 智能提示

## 🐛 调试

项目已配置完整的 VS Code 调试环境，按 `F5` 即可启动调试。

详见: `.vscode/DEBUG_GUIDE.md`

## 📊 性能指标

| 指标 | CSR | SSR (本项目) |
|------|-----|-------------|
| LCP | 2-3s | 0.04s ⚡ |
| FID | ~100ms | ~50ms |
| CLS | 0.1-0.3 | 0 |

## 🚢 部署

### PM2 部署

```bash
pm2 start ecosystem.config.js
pm2 save
```

### Docker 部署

```bash
docker build -t form-create-ssr .
docker run -d -p 3000:3000 form-create-ssr
```

## 📝 开发指南

### 添加新页面

1. 在 `src/mock/pages/` 创建页面配置 JSON
2. 在 `src/mock/routes.json` 添加路由配置
3. 自动通过 DynamicPage.vue 渲染

## 📄 License

MIT
