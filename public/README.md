# 静态资源目录索引

`public/` 存放需要以静态文件方式直接暴露给前端的资源，不经过应用源码编译流程。

## 当前内容

- `favicon.*`：站点图标。
- `config/`：静态配置资源与默认配置文件。
- `dts-class-model/`：**编译镜像**（由 `pnpm run sync:class-model-static` 从 `generated/dts-class-model/` 同步，不手改，不提交）。

## 结构约束

- 页面配置主路径已经迁移到后端 `spark-ai-server/data/pages-config/`，不要再把 `public/` 当成页面配置默认存储位置。
- ClassModel 知识 JSON 的 SSOT 在 `generated/dts-class-model/`；`public/dts-class-model/` 仅为运行时 HTTP fetch 镜像。
- 只放静态资源，不放运行时业务代码。
- 如果某个资源需要参与类型检查、打包或模块引用，应优先放进 `src/`。

## 相关文档

- [../docs/guides/CONFIG_SYSTEM.md](../docs/guides/CONFIG_SYSTEM.md)
- [../spark-ai-server/README.md](../spark-ai-server/README.md)