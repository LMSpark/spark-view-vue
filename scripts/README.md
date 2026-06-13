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
  默认跳过未变更包（dist/.spark-build-stamp.json）；--force 全量重建

日常门禁 (pnpm run verify)
  typecheck → lint → verify:rules（alias 指向 packages/*/src，无需 dist）

发布/产物门禁 (pnpm run verify:dist)
  build:packages → typecheck → lint → verify:rules

ClassModel 编译 + 运行时 (generate:class-model-surface)
  内存 emit .d.ts (tsconfig.class-model-emit.json → src，虚拟键 class-model-emit/)
  → AST 投影 → generated/dts-class-model/*.json
  → 浏览器 Worker (Comlink) 按需 fetch manifest/shard
  → refreshBundle 可触发 --model 增量编译 + loader.reload()

ClassModel 全量门禁 (verify:class-model:full)
  generate:class-model-surface → verify:class-model → typecheck
  （读 packages/*/src，无需先 build:packages）
```

**关键约定**

- 根 `vite.config.ts` 通过 alias 指向 `packages/*/src`；日常 dev / `build:fe` **不需要**先 `build:packages`。
- `packages/*/dist` 仅服务 npm 发布与消费者；`publish:packages` 会先跑 `build-packages`。
- 编译期 `.d.ts` 仅在内存存在；bundle `sourcePath` 使用虚拟前缀 `class-model-emit/`；产物为 `generated/dts-class-model/**/*.json`。
- `generated/dts-class-model/` 已入库（编译 SSOT，可人工评审）；Vite 插件 dev/build 映射到 `/dts-class-model/`。
- `ensure:class-model-bundle` 在 manifest 缺失时 generate。
- ClassModel 运行时知识在 Web Worker 内按需加载；编译 refresh 见 `scripts/lib/class-model-knowledge-refresh.mjs`。
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
- `generate-dts-class-model.mjs`：ClassModel 编译（内存 emit → JSON bundle；`--model` 增量）。
- `lib/class-model-knowledge-refresh.mjs`：Node 宿主 refreshBundle 回调（触发 targeted compile）。
- ClassModel 编译期 TS API：`packages/spark-ai/src/class-model/class-model/build-index.ts`（禁止浏览器 import）。

## 放置原则

- 需要被仓库维护者显式执行的脚本放这里。
- 脚本以“可重复执行”和“命名可识别”为优先，避免出现语义不清的临时文件名。
- 一次性试验脚本如果要长期保留，应转成可维护的验证脚本；否则应删除。
- 本地调试、个人环境切换、恢复包、缓存、一次性视频/演示生成脚本不要提交到仓库。
