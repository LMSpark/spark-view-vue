# 脚本目录索引

`scripts/` 存放面向仓库维护的命令行脚本，主要负责开发启动、构建、发布和迁移，不承载运行时业务逻辑。

## 目录内容

- `start-dev.mjs`：一键启动项目 Docker MySQL、Java 后端和前端开发环境。
- `build-all.mjs`：完整构建流水线（Java JAR + Vite 前端）。
- `publish-packages.mjs`：工作区包发布脚本。
- `claude-model.ps1`：Claude Code 后端模型环境切换、备份和冒烟验证脚本；默认只影响当前进程，显式传入 `-Persist` 才写入用户环境变量。
- `setup-claude-deepseek.ps1`：历史 DeepSeek 接入脚本；新配置优先使用 `claude-model.ps1`。
- `migrate-navigation-sub-page.mjs`：legacy `sub-page` 行审计/迁移（Flyway V8；自动 fallback docker compose exec mysql）。
- `verify-model-convergence-offline.mjs`：模型收敛离线验收测试集。

## 放置原则

- 需要被仓库维护者显式执行的脚本放这里。
- 脚本以“可重复执行”和“命名可识别”为优先，避免出现语义不清的临时文件名。
- 一次性试验脚本如果要长期保留，应转成可维护的验证脚本；否则应删除。
