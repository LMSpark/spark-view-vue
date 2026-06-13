# 脚本目录索引

`scripts/` 存放面向仓库维护的命令行脚本，主要负责开发启动、构建、发布和迁移，不承载运行时业务逻辑。

## 编译流水线（分层）

```text
开发 (pnpm run dev)
  start-dev.mjs → Docker MySQL → Java spring-boot:run → Vite dev (alias → packages/*/src)

前端生产 (pnpm run build:fe)
  ensure:class-model-bundle → vite build (根应用；不预构建 packages dist)

完整发布 (pnpm run build)
  build-all.mjs → mvn package (Java JAR) + build-frontend.mjs

npm 包 (pnpm run build:packages)
  build-packages.mjs → 按依赖拓扑串行构建 packages/* (vite JS + tsc/vue-tsc .d.ts)

ClassModel 全量 (verify:class-model:full)
  build-packages (utils→…→project-model) → generate:class-model-surface:delete-dts
  → build-packages (spark-ai) → verify:class-model → typecheck
```

**关键约定**

- 根 `vite.config.ts` 通过 alias 指向 `packages/*/src`；日常 dev / `build:fe` **不需要**先 `build:packages`。
- `packages/*/dist` 仅服务 npm 发布与消费者；`publish:packages` 会先跑 `build-packages`。
- `generated/dts-class-model/` 已入库；`ensure:class-model-bundle` 仅在 manifest 缺失时生成。
- Java 改动后必须重启 `pnpm run dev`；纯前端走 Vite HMR。

## 目录内容

- `build-shared.mjs`：JAVA_HOME 探测、`runCommand`、路径常量（build / dev 共用）。
- `build-all.mjs`：Java JAR + 前端生产构建。
- `build-frontend.mjs`：根 Vite 生产构建。
- `build-packages.mjs`：workspace 包拓扑构建（`--only pkg1,pkg2` / `--dry-run`）。
- `start-dev.mjs`：Docker MySQL + Java + Vite 开发栈。
- `publish-packages.mjs`：构建并发布 `@spark-appworks/*`。
- `migrate-navigation-sub-page.mjs`：legacy `sub-page` 行审计/迁移（Flyway V8）。
- `migrate-pages-config-cleanup.mjs`：已删 pageId 的 MySQL 清理（Flyway V9）。
- `verify-model-convergence-offline.mjs`：模型收敛离线验收。
- ClassModel 编译期入口：`packages/spark-ai/src/class-model/class-model/build-index.ts`（禁止浏览器 import）。

## 放置原则

- 需要被仓库维护者显式执行的脚本放这里。
- 脚本以“可重复执行”和“命名可识别”为优先，避免出现语义不清的临时文件名。
- 一次性试验脚本如果要长期保留，应转成可维护的验证脚本；否则应删除。
- 本地调试、个人环境切换、恢复包、缓存、一次性视频/演示生成脚本不要提交到仓库。
