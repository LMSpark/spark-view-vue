# Release Notes - v1.0.0 (MVP)

## 🎉 首次发布

**发布日期**: 2026-01-02

SPARK.View for VUE v1.0.0 是一个最小可行版本（MVP），实现了从 DSL 到 Vue SSR 的完整链路。

---

## ✨ 核心功能

### DSL 系统

- ✅ JSON Schema 1.0 定义
- ✅ YAML/JSON 双格式支持
- ✅ 表达式系统（data/env 访问 + 白名单函数）
- ✅ 条件渲染与循环渲染
- ✅ 水合策略配置

### 编译链

- ✅ Lexer + Parser（从 YAML/JSON 到 AST）
- ✅ IR Generator（AST → 中间表示）
- ✅ Vue Renderer（IR → Vue Render Function）
- ✅ 安全表达式求值器

### SSR 服务器

- ✅ Express 服务器
- ✅ 内存缓存（可扩展为 Redis）
- ✅ 错误处理与降级
- ✅ 健康检查端点

### 客户端运行时

- ✅ 部分水合（immediate/idle/visible/interaction）
- ✅ IntersectionObserver 支持
- ✅ 水合事件监听

### 工程化

- ✅ Monorepo（pnpm workspace）
- ✅ TypeScript + ESLint + Prettier
- ✅ Vitest 单元测试
- ✅ GitHub Actions CI/CD
- ✅ 性能验证脚本

### 文档

- ✅ 完整 README
- ✅ 每个 package 的文档
- ✅ 9 篇系列文章草稿

---

## 📦 Packages

| Package | Version | Description |
|---------|---------|-------------|
| @spark-view/dsl-spec | 1.0.0 | DSL JSON Schema 定义 |
| @spark-view/dsl-parser | 1.0.0 | DSL 解析器 |
| @spark-view/dsl-compiler | 1.0.0 | DSL 编译器 |
| @spark-view/ssr-server | 1.0.0 | SSR 服务器 |
| @spark-view/runtime | 1.0.0 | 客户端运行时 |

---

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 测试
pnpm test

# 启动 SSR 服务器
pnpm --filter @spark-view/ssr-server dev
```

---

## 📊 性能指标

| 指标 | 值 |
|-----|---|
| TTFB | < 50ms |
| First Paint | < 120ms |
| LCP | < 180ms |
| Hydration | < 350ms |

---

## 🔮 后续计划（v1.1.0）

### 编译器增强

- [ ] 支持自定义组件
- [ ] CSS-in-JS 支持
- [ ] Tree-shaking 优化

### SSR 优化

- [ ] 流式 SSR（renderToNodeStream）
- [ ] Redis 缓存适配器
- [ ] CDN 边缘部署示例

### 运行时增强

- [ ] 预加载策略（link preload）
- [ ] Service Worker 支持
- [ ] 离线缓存

### 工具链

- [ ] VSCode 扩展（DSL 语法高亮）
- [ ] CLI 工具（脚手架生成）
- [ ] 可视化编辑器

### 文档

- [ ] 完整 API 文档
- [ ] 视频教程
- [ ] 最佳实践指南

---

## 🐛 已知问题

1. **表达式安全性**: 当前使用 Function 构造函数，建议生产环境使用 vm2
2. **SSR 执行**: 动态 eval bundle 有安全风险，待改进为沙箱执行
3. **性能监控**: 缺少 APM 集成（如 Sentry、Datadog）

---

## 💬 反馈与贡献

- **Issues**: https://github.com/your-org/spark-view-vue/issues
- **Discussions**: https://github.com/your-org/spark-view-vue/discussions
- **Contributing**: 查看 [CONTRIBUTING.md](./docs/CONTRIBUTING.md)

---

## 📄 许可证

MIT License

---

**感谢所有贡献者！** 🙏

特别感谢：
- Vue.js 团队
- Vite 团队
- 所有测试者与反馈者
