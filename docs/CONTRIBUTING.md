# 贡献指南

欢迎为 SPARK.View for VUE 贡献代码！

## 开发流程

### 1. Fork 仓库

```bash
# 克隆你的 fork
git clone https://github.com/your-username/spark-view-vue.git
cd spark-view-vue
```

### 2. 创建分支

```bash
git checkout -b feature/your-feature-name
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 开发与测试

```bash
# 构建
pnpm build

# 测试
pnpm test

# Lint
pnpm lint
```

### 5. 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 添加新功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式化
refactor: 重构
test: 测试相关
chore: 构建/工具相关
```

示例：

```bash
git commit -m "feat(compiler): 支持嵌套循环渲染"
```

### 6. 推送并创建 PR

```bash
git push origin feature/your-feature-name
```

在 GitHub 上创建 Pull Request，填写 PR 模板。

## 代码规范

### TypeScript

- 使用严格模式
- 优先使用 interface 而非 type
- 导出类型定义

### 测试

- 覆盖率要求 > 80%
- 单元测试使用 Vitest
- E2E 测试使用 Playwright

### 文档

- README 必须包含使用示例
- 公共 API 需要 JSDoc 注释
- 复杂逻辑添加代码注释

## 发布流程

由维护者执行：

```bash
# 更新版本号
pnpm changeset

# 发布到 npm
pnpm changeset publish
```

## 行为准则

- 尊重他人
- 保持专业
- 欢迎新手

## 联系我们

- Issues: https://github.com/your-org/spark-view-vue/issues
- Discussions: https://github.com/your-org/spark-view-vue/discussions
- Email: spark-view@example.com

感谢你的贡献！🎉
