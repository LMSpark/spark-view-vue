# 脚本目录索引

`scripts/` 存放面向仓库维护的命令行脚本，主要负责开发启动、构建、发布和迁移，不承载运行时业务逻辑。

## 目录内容

- `start-dev.mjs`：一键启动 Java 后端和前端开发环境。
- `build-all.mjs`：完整构建流水线。
- `publish-packages.mjs`：工作区包发布脚本。
- `upload-component-metadata.mjs`：上传组件元数据到后端。
- `verify-dataset-remote-load.mjs`、`verify-sse-debug-loop.*`：链路验证脚本。
- `migrate-*.mjs`：结构迁移或批量修复脚本。

## 放置原则

- 需要被仓库维护者显式执行的脚本放这里。
- 脚本以“可重复执行”和“命名可识别”为优先，避免出现语义不清的临时文件名。
- 一次性试验脚本如果要长期保留，应转成可维护的验证脚本；否则应删除。