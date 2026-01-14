# Form Create Application

基于 Vue 3 + TypeScript + Element Plus 的现代化 Web 应用。

> **⚠️ 重要更新**: 项目已从 SSR 模式迁移为 CSR (Client-Side Rendering) 模式。详见 [CSR_MIGRATION.md](CSR_MIGRATION.md)

## ✨ 特性

- 🚀 **CSR 模式**: 简单部署，快速开发，静态托管
- 💪 **TypeScript**: 完整类型支持，严格模式编译
- 🎨 **Element Plus**: 企业级 UI 组件库
- 📝 **Form Create**: 强大的动态表单生成器
- � **VXE Table**: 集成高级表格能力（可选）
- �🔥 **热更新**: Vite HMR 开发体验
- ✅ **代码质量**: ESLint + TypeScript 严格检查
- 🎯 **SLOT 递归架构**: 所有渲染器支持 Vue 3 作用域插槽
- 📊 **DataSet 架构**: 强大的数据管理和级联操作

## 📦 技术栈

- **前端框架**: Vue 3.4
- **构建工具**: Vite 7.3
- **UI 组件**: Element Plus 2.5 + Syncfusion EJ2
- **表单引擎**: @form-create/element-ui 3.2
- **路由**: Vue Router 4.6
- **TypeScript**: 5.9 (严格模式)
- **运行时**: Node.js 20+

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
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
│   ├── models/          # 领域模型 (camelCase)
│   │   ├── bindingContext.ts  # 视图层
│   │   ├── dataTable.ts       # 结构层
│   │   ├── dataSet.ts         # 领域层
│   │   └── dataSetManager.ts  # 工厂层
│   ├── utils/           # 工具函数和辅助类
│   │   ├── parsers/     # 解析器模块
│   │   ├── managers/    # 管理器模块
│   │   └── page-helpers/ # 页面辅助函数
│   ├── api/             # API 接口
│   ├── mock/            # Mock 数据
│   ├── router/          # 路由配置
│   ├── types/           # TypeScript 类型
│   ├── views/           # 页面视图
│   │   └── DynamicPage.vue  # 动态表单页面
│   ├── pages-config/    # 页面配置（低代码）
│   ├── app.ts           # 应用工厂函数
│   ├── entry-client.ts  # 客户端入口
│   ├── entry-server.ts  # 服务端入口
│   └── main.ts          # CSR 入口
├── docs/               # 项目文档
│   ├── architecture/   # 架构设计文档
│   ├── dataset/        # DataSet 相关文档
│   └── guides/         # 开发指南
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

1. 在 `src/pages-config/` 创建页面配置 JSON (`rule.json`, `pagedata.json`)
2. 在 `src/pages-config/routes.json` 添加路由配置
3. 自动通过 DynamicPage.vue 渲染

## � 文档索引
### 🚀 快速开始
- **[项目概览](docs/PROJECT_OVERVIEW.md)** - 5 分钟了解整个项目 ⭐
- [SSR 快速开始](docs/guides/QUICKSTART_SSR.md) - SSR 开发入门
### 🏗️ 架构设计
- [架构总览](docs/architecture/README_ARCHITECTURE.md) - 完整架构设计说明
- [项目结构规范](docs/architecture/PROJECT_STRUCTURE.md) - 文件组织和命名规范
- [SSR 服务端渲染](docs/architecture/README_SSR.md) - SSR 实现细节
- [SPA 客户端模式](docs/architecture/README_SPA.md) - CSR 模式说明
- [数据隔离机制](docs/architecture/Data-Isolation.md) - BindingContext 数据隔离
- [数据加载流程](docs/architecture/Data-Loading-Flow.md) - 完整加载流程图

### 📊 数据集 (DataSet)
- [CRUD 操作指南](docs/dataset/DATASET_CRUD_GUIDE.md) - 增删改查操作
- [DataKey 路径系统](docs/dataset/DataKey-Paths.md) - 数据绑定路径
- [过滤表达式](docs/dataset/FILTER_EXPRESSION_TESTS.md) - 过滤语法测试
- [排序指南](docs/dataset/Sorting-Guide.md) - 排序功能说明
- [树形结构管理](docs/dataset/README_TREE.md) - TreeManager 使用
- [数据流程](docs/dataset/PageData-Flow.md) - PageData 流程图

### 📘 开发指南
- [SSR 快速开始](docs/guides/QUICKSTART_SSR.md) - 5 分钟上手
- [异步数据加载](docs/guides/ASYNC_DATA_LOADING.md) - 异步数据处理
- [智能加载演示](docs/guides/SMART_LOAD_DEMO.md) - 智能依赖加载
- [速查手册](docs/guides/ASYNC_DATA_QUICK_REF.md) - API 快速参考

### 🎯 演示页面
- `/` - 首页演示
- `/dataset-demo` - DataSet 基础演示
- `/cascade-demo` - 级联操作演示
- `/smart-load` - 智能加载演示
- `/master-detail` - 主从表演示
- `/tree-demo` - 树形结构演示

## �📄 License

MIT
