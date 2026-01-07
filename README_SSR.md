# Form Create TypeScript SSR Demo

完全使用 TypeScript + Vite SSR + Mock 的 form-create 动态页面配置系统。

## ✨ SSR 特性

- ✅ **服务端渲染（SSR）** - 首屏快速加载，SEO 友好
- ✅ **客户端激活（Hydration）** - 无缝过渡到交互式应用
- ✅ **开发/生产模式** - 支持开发热更新和生产构建
- ✅ **TypeScript 类型安全** - 完整的类型定义和检查
- ✅ **Vite 构建工具** - 极速的开发体验和 HMR 热更新
- ✅ **Element Plus UI 组件库** - 丰富的组件支持
- ✅ **Mock API 模拟** - 无需后端即可开发
- ✅ **配置驱动 UI** - 通过 JSON 配置生成表单和页面
- ✅ **页面脚本系统** - ES6 模块化的页面逻辑

## 📦 安装依赖

```bash
npm install
# 或
pnpm install
```

## 🚀 开发模式

### CSR 开发模式（客户端渲染）
```bash
npm run dev
```
访问 http://localhost:3000

### SSR 开发模式（服务端渲染）
```bash
npm run dev:ssr
```
访问 http://localhost:3000

## 🏗️ 生产构建

### CSR 构建
```bash
npm run build
npm run preview
```

### SSR 构建
```bash
npm run build:ssr
npm run preview:ssr
```

## 📁 项目结构

```
├── src/
│   ├── api/                 # API 请求层
│   ├── mock/                # Mock 数据层
│   ├── pageScripts/         # 页面脚本（ES6 模块）
│   ├── router/              # Vue Router 配置
│   ├── types/               # TypeScript 类型定义
│   ├── views/               # 视图组件
│   │   └── DynamicPage.vue  # 动态页面渲染器
│   ├── app.ts               # 应用工厂函数（CSR/SSR 共用）
│   ├── entry-client.ts      # 客户端入口
│   ├── entry-server.ts      # 服务端入口
│   ├── main.ts              # CSR 入口（兼容）
│   ├── App.vue              # 主组件
│   └── style.css            # 全局样式
├── server.ts                # SSR 服务器
├── index.html               # HTML 模板
├── package.json
├── tsconfig.json
└── vite.config.ts           # Vite 配置（支持 SSR）
```

## 🔑 核心概念

### SSR 工作流程

1. **服务端渲染**：
   - 请求到达 Node.js 服务器
   - 服务器执行 `entry-server.ts`
   - Vue 在服务端渲染为 HTML 字符串
   - 返回包含完整内容的 HTML

2. **客户端激活**：
   - 浏览器加载 HTML
   - 执行 `entry-client.ts`
   - Vue 激活（hydrate）已渲染的 DOM
   - 应用变为完全交互式

### 应用入口说明

- **app.ts** - 应用工厂函数，创建 Vue 应用实例（CSR/SSR 共用）
- **entry-client.ts** - 客户端入口，负责激活服务端渲染的 HTML
- **entry-server.ts** - 服务端入口，负责将应用渲染为 HTML 字符串
- **main.ts** - 传统 CSR 入口（向后兼容）

### 页面配置驱动

每个页面由以下配置文件驱动：

- **rule.json** - 表单组件配置（使用 form-create 规则）
- **data.json** - 页面数据
- **style.css** - 页面专属样式（自动作用域隔离）

## 🛠️ 开发指南

### 添加新页面

1. 在 `src/mock/routes.json` 添加路由配置
2. 在 `src/mock/pages/<pageName>/` 创建页面配置：
   - `rule.json` - 组件规则
   - `data.json` - 页面数据
   - `style.css` - 页面样式
3. 在 `src/pageScripts/<pageName>/script.js` 创建页面脚本

### SSR vs CSR 选择

**使用 SSR 的场景：**
- 需要 SEO 优化
- 首屏加载性能要求高
- 需要社交媒体预览
- 公开页面需要被爬虫索引

**使用 CSR 的场景：**
- 纯后台管理系统
- 实时交互密集的应用
- 不需要 SEO 的私有页面

## 📝 脚本命令详解

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 CSR 开发服务器 (Vite) |
| `npm run dev:ssr` | 启动 SSR 开发服务器 (Node.js + Vite) |
| `npm run build` | 构建 CSR 版本 |
| `npm run build:client` | 构建 SSR 客户端 |
| `npm run build:server` | 构建 SSR 服务端 |
| `npm run build:ssr` | 构建完整 SSR 版本 |
| `npm run preview` | 预览 CSR 构建结果 |
| `npm run preview:ssr` | 预览 SSR 构建结果 |

## 🌐 部署

### 部署 SSR 版本

1. 构建应用：
```bash
npm run build:ssr
```

2. 部署文件：
   - `dist/client/` - 客户端资源（静态文件）
   - `dist/server/` - 服务端代码
   - `server.ts` - 服务器入口
   - `package.json` - 依赖配置

3. 启动服务器：
```bash
NODE_ENV=production node server.js
```

### 部署 CSR 版本

1. 构建应用：
```bash
npm run build
```

2. 部署 `dist/` 目录到任意静态文件服务器（Nginx、Vercel、Netlify 等）

## 🔧 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **TypeScript** - 类型安全的 JavaScript 超集
- **Vite** - 下一代前端构建工具
- **Element Plus** - 基于 Vue 3 的组件库
- **Form Create** - 动态表单生成器
- **Vue Router** - Vue.js 官方路由
- **Express** - Node.js Web 框架（SSR 服务器）
- **vite-plugin-mock** - Vite Mock 插件

## 📚 相关文档

- [Vue SSR 指南](https://cn.vuejs.org/guide/scaling-up/ssr.html)
- [Vite SSR](https://cn.vitejs.dev/guide/ssr.html)
- [Form Create 文档](https://form-create.com/v3/)
- [Element Plus 文档](https://element-plus.org/)

## ⚠️ 注意事项

1. **Mock API 限制**：SSR 模式下需要确保 Mock API 在服务端也能正常工作
2. **浏览器 API**：避免在服务端代码中使用 `window`、`document` 等浏览器专用 API
3. **生命周期钩子**：`mounted`、`beforeUnmount` 等钩子仅在客户端执行
4. **全局状态**：服务端渲染时每个请求应该有独立的应用实例

## 📄 License

MIT
