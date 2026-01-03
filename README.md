# SPARK.View for VUE

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)

**DSL 驱动的 Vue SSR 框架，支持部分水合与极速首屏**

[English](./README.md) | [中文文档](./README_CN.md)

</div>

## 📖 项目简介

SPARK.View for VUE 是一个创新的 DSL（领域特定语言）驱动的 Vue 服务端渲染框架。它通过声明式 DSL 描述页面结构，经过编译器转换为高效的 Vue 组件，并通过智能的部分水合策略实现极速的首屏加载性能。

### 核心特性

- 🎯 **DSL 驱动**：通过 YAML/JSON DSL 描述页面，零 Vue 组件编写
- ⚡ **Vue SSR**：基于 @vue/server-renderer 的高性能服务端渲染
- 💧 **部分水合**：智能的 hydrationHints，按需激活交互组件
- 🔧 **类型安全**：完整的 TypeScript 支持与 JSON Schema 验证
- 🚀 **边缘部署**：支持 Cloudflare Workers / Vercel Edge / Deno Deploy
- 📦 **按需打包**：基于 Vite 的智能代码分割与懒加载
- 🎨 **组件生态**：可扩展的组件系统与主题定制
- 🔒 **安全表达式**：受限的 EL 表达式引擎，禁止 eval/new Function

## 🏗️ Monorepo 结构

```
spark-view-vue/
├── packages/
│   ├── dsl-spec/         # DSL JSON Schema 定义与示例
│   ├── dsl-parser/       # DSL 词法分析与语法解析
│   ├── dsl-compiler/     # DSL -> Vue Render Function 编译器
│   ├── ssr-server/       # SSR 服务器（支持流式渲染与缓存）
│   ├── runtime/          # 客户端运行时（部分水合）
│   └── demo-site/        # Demo 站点（编辑器 + 预览）
├── scripts/              # 构建与验证脚本
├── docs/                 # 文档与系列文章
└── .github/              # CI/CD 配置
```

## 🚀 快速开始

### 前置要求

- Node.js >= 16.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose（生产部署）
- Redis（运行时架构）

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/your-org/spark-view-vue.git
cd spark-view-vue

# 安装依赖（使用 pnpm）
pnpm install
```

### 本地开发

```bash
# 构建所有 packages
pnpm build

# 运行测试
pnpm test

# 启动 Demo 站点
pnpm dev:demo

# 启动 SSR 服务器
pnpm dev:ssr

# 启动 API Server（运行时架构）
pnpm dev:api
```

### 生产部署

#### 方式1：Docker 一键部署

```bash
# Linux/Mac
./scripts/deploy-prod.sh

# Windows
scripts\deploy-prod.bat
```

#### 方式2：编译时架构（纯 SPA）

```bash
# 构建静态文件
pnpm build:static

# 部署到 Vercel
pnpm deploy:vercel

# 部署到 Netlify
pnpm deploy:netlify
```

📖 **完整部署指南**: [DEPLOYMENT.md](./DEPLOYMENT.md)

### 验证完整链路

```bash
# 运行完整验证（安装、构建、测试、性能验证）
pnpm validate
```

## 📝 DSL 示例

**basic-page.yaml**

```yaml
dslVersion: "1.0"
page:
  id: home
  title: "Welcome to SPARK.View"
  layout:
    type: container
    props:
      maxWidth: 1200px
    children:
      - type: header
        props:
          height: 80px
        children:
          - type: text
            props:
              content: "{{ data.title }}"
              fontSize: 32px
              fontWeight: bold
      - type: button
        props:
          text: "Click Me"
          onClick: "handleClick"
        hydration:
          strategy: idle
          priority: low
data:
  title: "Hello SPARK.View"
```

编译后生成的 Vue Render Function 可在 SSR 服务器中渲染，并根据 hydration hints 在客户端按需激活。

## 🔨 核心 Packages

### @spark-view/dsl-spec

定义 DSL 的 JSON Schema（dslVersion 1.0），提供 YAML/JSON 示例与类型定义。

### @spark-view/dsl-parser

将 YAML/JSON DSL 解析为 AST（抽象语法树）：

```typescript
import { parse } from '@spark-view/dsl-parser';

const ast = parse(dslContent);
```

### @spark-view/dsl-compiler

将 AST 编译为 Vue Render Function 与 hydrationHints：

```typescript
import { compile } from '@spark-view/dsl-compiler';

const { ssrBundle, clientChunks, hydrationHints } = compile(ast);
```

### @spark-view/ssr-server

SSR 服务器，支持缓存与流式渲染：

```typescript
import { createSSRServer } from '@spark-view/ssr-server';

const server = createSSRServer({
  port: 3000,
  cache: {
    get: async (key) => redis.get(key),
    set: async (key, value, ttl) => redis.setex(key, ttl, value),
  },
});

server.listen();
```

### @spark-view/runtime

客户端运行时，实现部分水合：

```typescript
import { hydratePartial } from '@spark-view/runtime';

hydratePartial({
  hints: window.__HYDRATION_HINTS__,
  strategy: 'idle', // 'idle' | 'visible' | 'immediate'
});
```

### demo-site

可视化编辑器 + 预览工具，支持：

- DSL 文本编辑（Monaco Editor）
- 实时预览（SSR/CSR 切换）
- 一键部署到 GitHub Pages / Vercel

## 🧪 测试

每个 package 都包含单元测试（Vitest）：

```bash
# 运行所有测试
pnpm test

# 运行特定 package 的测试
pnpm --filter @spark-view/dsl-parser test

# 覆盖率
pnpm test -- --coverage
```

## 📊 性能验证

使用 Playwright 进行性能验证：

```bash
node scripts/performance-test.js
```

生成的性能报告包含：

- TTFB（Time to First Byte）
- First Paint
- LCP（Largest Contentful Paint）
- Hydration Cost

## � 文档

### 系列文章

在 [docs/series](./docs/series) 目录中提供了完整的技术文章：

1. [设计 DSL Schema 与版本策略](./docs/series/01-dsl-schema-design.md)
2. [DSL 编译链：Lexer → AST → IR](./docs/series/02-compiler-implementation.md)
3. [Vue SSR 原理与工程实践](./docs/series/03-vue-ssr-principles.md)
4. [DSL 驱动的 SSR：端到端实现](./docs/series/04-dsl-driven-ssr.md)
5. [部分水合与极速首屏策略](./docs/series/05-partial-hydration.md)
6. [组件分级与按需打包](./docs/series/06-component-splitting.md)
7. [边缘部署与缓存回源策略](./docs/series/07-edge-deployment.md)
8. [智能编译与运行时裁剪](./docs/series/08-intelligent-compilation.md)
9. [监控、回滚与演进路线](./docs/series/09-monitoring-evolution.md)
10. [路由系统与 SPA 架构](./docs/series/10-router-spa-architecture.md)
11. [混合架构 - SSR首屏 + SPA导航](./docs/series/11-hybrid-ssr-spa.md)

### 补充文档

- 📖 [生产环境部署指南](./DEPLOYMENT.md) - Docker、云平台、监控完整方案
- 🔄 [协商缓存机制详解](./docs/cache-negotiation.md) - 304响应优化
- 🏗️ [运行时 vs 编译时架构对比](./docs/runtime-vs-buildtime.md) - 架构选择指南

## 🏭 生产环境

### 架构选择

**运行时架构（SSR + SPA）**：
- ⚡ 首屏 TTFB < 100ms
- 🔄 实时更新，无需重新构建
- 📊 适合内容频繁变化的场景

**编译时架构（纯 SPA）**：
- 📦 纯静态文件，CDN 友好
- 🚀 部署简单，无需后端
- 💰 运维成本低

### 部署方案

```bash
# Docker Compose 一键部署
docker-compose up -d

# 访问服务
http://localhost          # Nginx 反向代理
http://localhost/api      # API Server
http://localhost:9090     # Prometheus 监控
http://localhost:3001     # Grafana 可视化
```

详见：[完整部署指南](./DEPLOYMENT.md)

## 🔄 CI/CD

GitHub Actions 自动执行：

- **CI Workflow**：Lint → Build → Test（Node 16/18 矩阵）
- **Deploy Workflow**：自动部署 demo-site 到 GitHub Pages
- **Docker Build**：自动构建并推送 Docker 镜像

## 🤝 贡献指南

欢迎贡献！请阅读 [CONTRIBUTING.md](./docs/CONTRIBUTING.md) 了解详情。

### 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m "feat: add your feature"`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

### Commit 规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新特性
- `fix:` Bug 修复
- `docs:` 文档更新
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具相关

## 📄 许可证

[MIT License](./LICENSE)

## 🔗 相关链接

- [Vue 官方文档](https://vuejs.org/)
- [Vue SSR 指南](https://vuejs.org/guide/scaling-up/ssr.html)
- [Vite 文档](https://vitejs.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/)

## 🌟 致谢

感谢以下开源项目的启发：

- [Vue.js](https://github.com/vuejs/core)
- [Vite](https://github.com/vitejs/vite)
- [Astro](https://github.com/withastro/astro)
- [Qwik](https://github.com/BuilderIO/qwik)

---

<div align="center">

**Made with ❤️ by SPARK.View Team**

</div>
