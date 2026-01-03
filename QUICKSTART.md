# 快速开始指南

本指南帮助你在 5 分钟内运行 SPARK.View for VUE 项目。

## 前置要求

- Node.js >= 16.0.0
- pnpm >= 8.0.0

## 安装

```bash
# 克隆仓库
git clone https://github.com/your-org/spark-view-vue.git
cd spark-view-vue

# 安装依赖
pnpm install
```

## 构建

```bash
# 构建所有 packages
pnpm build
```

## 运行测试

```bash
# 运行所有测试
pnpm test
```

## 启动 SSR 服务器

```bash
# 启动服务器
pnpm --filter @spark-view/ssr-server dev

# 服务器运行在 http://localhost:3000
```

## 测试 SSR

创建一个测试 DSL 文件：

```bash
mkdir -p packages/ssr-server/dsls

cat > packages/ssr-server/dsls/test.json <<'EOF'
{
  "dslVersion": "1.0",
  "page": {
    "id": "test",
    "title": "测试页面",
    "layout": {
      "type": "container",
      "props": {
        "padding": "20px"
      },
      "children": [
        {
          "type": "text",
          "props": {
            "content": "{{ data.message }}",
            "fontSize": "24px"
          }
        }
      ]
    }
  },
  "data": {
    "message": "Hello SPARK.View!"
  }
}
EOF
```

访问渲染结果：

```bash
curl http://localhost:3000/render/test
```

## 下一步

- 查看 [packages/dsl-spec/README.md](packages/dsl-spec/README.md) 学习 DSL 语法
- 阅读 [docs/series/](docs/series/) 中的系列文章
- 运行 `pnpm validate` 执行完整验证

## 常见问题

### pnpm install 失败

确保使用 pnpm >= 8.0.0：

```bash
npm install -g pnpm@latest
```

### 构建失败

清理并重新构建：

```bash
pnpm clean
pnpm install
pnpm build
```

### 端口被占用

修改 SSR 服务器端口：

```bash
PORT=3001 pnpm --filter @spark-view/ssr-server dev
```

## 获取帮助

- Issues: https://github.com/your-org/spark-view-vue/issues
- Discussions: https://github.com/your-org/spark-view-vue/discussions
