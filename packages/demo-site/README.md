# Demo Site

SPARK.View DSL 可视化编辑器与预览工具。

## 功能

- ✅ DSL 实时编辑（Monaco-like textarea）
- ✅ SSR/CSR 模式切换
- ✅ 编译结果预览
- ✅ 错误提示
- ✅ 代码复制

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm --filter demo-site dev

# 访问 http://localhost:5173
```

## 构建

```bash
pnpm --filter demo-site build
```

## 部署

生成的静态文件在 `dist/` 目录，可部署到：

- GitHub Pages
- Vercel
- Netlify
- 任何静态文件服务器

## 待实现功能（v1.1.0）

- [ ] Monaco Editor 集成
- [ ] 语法高亮
- [ ] 自动补全
- [ ] 实时 SSR 渲染（调用 ssr-server）
- [ ] 部署脚本
- [ ] 示例模板库

## License

MIT
