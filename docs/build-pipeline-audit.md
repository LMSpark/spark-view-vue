# SPARK AppWorks 编译管线审计

> **初版审计**: 2026-06-14  
> **复核日期**: 2026-06-14（含 #1–#3 修复验证 + public 迁移审核）  
> **SSOT 索引**: 日常命令见 [`scripts/README.md`](../scripts/README.md)；ClassModel 架构见 [`packages/spark-ai/ARCHITECTURE.md`](../packages/spark-ai/ARCHITECTURE.md)

---

## 一、管线总览

pnpm monorepo，无 lerna/nx/turborepo，构建编排集中在 `scripts/`。

| 流水线 | 入口 | 用途 |
|--------|------|------|
| A. Dev | `pnpm run dev` | Docker MySQL → Java → Vite HMR |
| B. 前端生产 | `pnpm run build:fe` | ensure ClassModel bundle → sync public → 根 Vite build |
| C. 全量发布 | `pnpm run build` | Java JAR + 前端 |
| D. npm 包 | `pnpm run build:packages` | 拓扑排序 + 增量 stamp |
| E. 日常门禁 | `pnpm run verify` | typecheck + lint + verify:rules（**不**预构建 dist） |
| F. 产物门禁 | `pnpm run verify:dist` | build:packages + verify（发布前） |
| G. ClassModel | `pnpm run generate:class-model-surface` | 内存 emit → JSON bundle → sync public（**独立**于 D） |

```text
Dev / build:fe / verify  →  alias 指向 packages/*/src，通常不需要 dist
build:packages / verify:dist / publish  →  需要 packages/*/dist
generate:class-model-surface  →  generated/dts-class-model/ → sync → public/dts-class-model/
```

---

## 二、流水线 A–D（摘要）

### A. Dev — `scripts/start-dev.mjs`

Docker MySQL (3406) → `mvn spring-boot:run` (8180) → sync ClassModel → Vite (5273+)。根 `vite.config.ts` alias 指向各包 `src/`。

### B. 前端生产 — `scripts/build-frontend.mjs`

1. `ensure:class-model-bundle`（manifest 缺失才 generate → sync）
2. `vite build`

### C. 全量 — `scripts/build-all.mjs`

`mvn package` + `build-frontend.mjs`。`--skip-fe` / `SKIP_JAVA` / `SKIP_FE` 可跳过阶段。

### D. 包构建 — `scripts/build-packages.mjs`

```
resolvePackagesInBuildOrder()
→ 跳过无 build script 的包（vite-plugin-spark-catalog）
→ 每包: fingerprint → isPackageBuildFresh → skip 或 pnpm run build → writeBuildStamp
```

**复核后的拓扑顺序**（2026-06-14 `node scripts/build-packages.mjs --dry-run`）：

```text
spark-utils
  → spark-json-document
  → spark-ai
  → spark-data
  → spark-project-model
  → spark-component
  → spark-app
（跳过: vite-plugin-spark-catalog）
```

单包 build 模式：`clean && vite build && tsc/vue-tsc -p tsconfig.build.json`。

---

## 三、双路径解析

| 场景 | `@spark-appworks/*` 解析到 |
|------|---------------------------|
| Dev / 根 Vite / Vitest / `tsconfig.typecheck.json` | `packages/*/src` |
| 包 `tsconfig.build.json` | 上游 `packages/*/dist`（.d.ts） |

---

## 四、增量构建 — `scripts/lib/package-build-cache.mjs`

- Stamp：`dist/.spark-build-stamp.json` → `{ fingerprint, builtAt }`
- 指纹：package.json + tsconfig.build.json + vite.config.* + `src/**` + workspace 依赖指纹
- Skip 时只更新**内存** `dependencyFingerprints`，不写 stamp（设计正确）

---

## 五、DTS ClassModel 生成（流水线 G）

**入口**: `scripts/generate-dts-class-model.mjs`（约 998 行）

```text
tsconfig.class-model-emit.json
  → emitDeclarationsToMemory (compiler-api 默认 / vue-tsc 可选)
  → buildDtsClassModelBundle (TS AST 投影)
  → generated/dts-class-model/manifest.json + files/** + runtime/**
  → sync → public/dts-class-model/（Vite 静态发布）
```

| 事实 | 说明 |
|------|------|
| 不落盘 `.d.ts` | 默认全程内存 emit；bundle 内虚拟键前缀 `class-model-emit/` |
| **不使用 ajv** | 编译链仅依赖 `typescript` / `vue-tsc`；见下文「ajv 范围」 |
| 产出含 JSON Schema 形状 | `paramsSchema` 等由 `dts-type-schema.ts`（TypeChecker）静态投影，非运行时校验 |
| 定向重建 | `--model RootClassName`；refresh 见 `scripts/lib/class-model-knowledge-refresh.mjs` |
| 运行时加载 | Web Worker + `DtsClassModelBundleLoader` 按 HTTP fetch `/dts-class-model/**` |
| **双源架构** | SSOT 在 `generated/`（入库）；`public/` 为运行时镜像（gitignore） |

**守卫**: `scripts/ensure-class-model-bundle.mjs` — manifest 存在则跳过 generate，之后执行 sync。

**sync**: `scripts/lib/sync-class-model-static.mjs` — 全量 `rmSync + cpSync` 从 `generated/` 到 `public/dts-class-model/`。

**门禁**: `verify:class-model:full` = generate + verify:class-model + typecheck（无需 `build:packages`）。

---

## 六、ajv 范围（易混淆点）

| 阶段 | 是否使用 ajv | 说明 |
|------|-------------|------|
| `generate:class-model-surface` | **否** | 生成知识 JSON，不校验 payload |
| `build:packages` → spark-json-document | **间接（已修复）** | 2026-06-14 起 external 对齐 spark-utils；ajv/jmespath 不再内联 |
| Agent 运行时 | **是** | `JsonSchemaValidator`（`schema-validator.ts`）校验 tool/工单入参 |

初版审计在 #1 提到 ajv，指的是 **npm 包打包策略**，不是 ClassModel 编译。两者已在本文分区说明。

---

## 七、发布 — `scripts/publish-packages.mjs`

先 `build-packages`，再按拓扑 `pnpm publish`（须用 pnpm 以替换 `workspace:*`）。

---

## 八、异常标注（复核后）

图例：✅ 复核确认 · ⚠️ 初版有误已修正 · 🔴 高 · 🟡 中 · 🟢 低 · ✔️ 已修复 · 🆕 本轮新增

### 🔴 高严重度

| # | 位置 | 问题 | 复核 |
|---|------|------|------|
| 1 | `packages/spark-json-document/vite.config.ts` | ~~ajv/jmespath 被 Rollup 内联~~ | ✔️ **已修复**：`preserveModules` + 标准 external；`dist/index.js` 约 20 行，无 ajv 字符串 |
| 2 | `packages/spark-json-document/vite.config.ts` + `package.json exports` | ~~`./schema` / `./tree` JS 入口缺失~~ | ✔️ **已修复**：多 entry 产出 `dist/schema/index.js`、`dist/tree/index.js` |
| 3 | `packages/spark-data/tsconfig.json:12` | ~~dev tsconfig 将 spark-utils 指到 dist~~ | ✔️ **已修复**：改为 `../spark-utils/src/index.ts` |
| **30** | `src/class-model-artifacts/artifact-urls.ts:11` | `DEFAULT_DEV_ORIGIN = 'http://127.0.0.1:5273'` 硬编码端口 | 🆕 `start-dev.mjs` 支持动态端口（5273 被占时自动 +1），但 fallback 写死 5273。若 Vite 实际跑在 5274，Worker fetch 会打 5273 导致静默失败 |
| **31** | `src/class-model-artifacts/artifact-urls.ts:20` | `dtsClassModelManifestUrl` 模块顶层立即求值 | 🆕 Node e2e 中 `location` 不存在，fallback 到硬编码 origin。若测试不启动 Vite dev server，URL 永远不可达。旧方案 `new URL('../../generated/...', import.meta.url)` 在 Node 中可解析文件路径 |

### 🟡 中严重度

| # | 位置 | 问题 | 复核 |
|---|------|------|------|
| 4 | `spark-data` / `spark-app` `tsconfig.build.json` | 仅这两包用 `declarationDir: ./dist/types`，其余包 `.d.ts` 在 `dist/` 根 | ✅ 下游 paths 被迫分叉 |
| 5 | `sort-packages-by-dependency.mjs:19` | 拓扑只读 `dependencies`，不读 `peerDependencies` | ✅ 当前无 peer 依赖 workspace 包 |
| 6 | `spark-project-model/tsconfig.build.json:13` | 构建 tsconfig 自引用 `./src/index.ts` | ✅ |
| 7 | `spark-project-model/vite.config.ts:7` | 自引用 alias | ✅ |
| 8 | `spark-component` / `spark-app` `tsconfig.build.json` | 未映射 `spark-json-document/schema|tree` 子路径（`spark-ai` 已映射） | ✅ |
| 17 | `spark-component/tsconfig.build.json` | 缺少 `@spark-appworks/spark-utils/internal` path 映射；但 `src/page/actions/executor-helpers.ts:30` import 该子路径 | ✅ tsc 声明 emit 解析失败，.d.ts 含 `any` |
| 18 | `spark-component/package.json:53-57` | `vue-router` 仅在 `peerDependencies`，未列入 `devDependencies`；`vue` 两者皆有 | ✅ CI 独立 install 时 vue-router 类型可能缺失 |
| 19 | `spark-component/src/.../JsonTreeEditor.vue:199` | `import type ... from 'vxe-table'` 但 package.json 未声明 `vxe-table` 依赖 | ✅ type-only 不致运行时错误，但消费者类型解析失败 |
| 20 | `spark-project-model/tsconfig.build.json` | 缺 `declarationMap`/`sourceMap`/`noEmitOnError`/`removeComments`/`composite`（其余 6 包均有） | ✅ 缺 `noEmitOnError` 最危险——类型错误时仍 emit .d.ts |
| 21 | `build-packages.mjs --only` 选项 | `--only spark-ai` 不含传递依赖；若 spark-utils dist 过期，tsc 构建失败 | ✅ 应取依赖闭包 |
| 22 | 根 `vite.config.ts` manualChunks | `spark-json-document` 无专属 chunk 规则；被 Rollup 分入首个引用 chunk | ✅ 可能制造虚假循环依赖 |
| **32** | `scripts/lib/sync-class-model-static.mjs:27-29` | `rmSync + cpSync` 全量删拷 1322 文件/21MB | 🆕 功能正确但非增量；频繁 regenerate + sync 时低效。CI 影响小，可后续优化 |

### 🟢 低严重度

| # | 位置 | 问题 | 复核 |
|---|------|------|------|
| 9 | `spark-json-document/vite.config.ts` | ~~单字符串 entry 风格不一致~~ | ✔️ 已与 spark-utils 对齐（多 entry + preserveModules） |
| 10 | 根 `vite.config.ts:185` | `spark-project-model` chunk 名 `'spark-config'` | ✅ |
| 11 | `spark-data/package.json` | 顶层 `"postcss": {}` | ✅ |
| 12 | `spark-utils` / `spark-data` / `spark-component` `tsconfig.json` | `target: ES2020` 覆盖根 ES2022 | ✅ spark-component **有** L21 target（初版 #14 自纠有误，已恢复） |
| 13 | `spark-component/tsconfig.json:6` | `rootDir: "../.."` | ✅ |
| 14 | `spark-component/tsconfig.json:9-10` | spark-utils → src，internal → dist | ✅ |
| 15 | `package-build-cache.mjs` | CONFIG_FILES 硬编码；`builtAt` 非确定性 | ✅ 设计取舍 |
| 16 | 根 `vite.config.ts:15` | `VITE_CACHE_DIR` 未文档化 | ✅ |
| 23 | `spark-project-model/package.json:22` | `eslint src --ext .ts` 使用 legacy `--ext` flag，flat config 下被忽略 | ✅ |
| 24 | `spark-json-document/package.json` | 无 `lint`/`lint:fix` script，无 ESLint devDep | ✅ 完全未 lint |
| 25 | `spark-app/package.json:43` | lint glob `{ts,tsx}` 不含 `.js`；其他 3 包含 | ✅ |
| 26 | `spark-app/package.json:46-49,60-61` | `vue`/`vue-router` 同时在 peer + dev Deps | ✅ 冗余 |
| 27 | 所有 `packages/*/package.json` | 无 `sideEffects` 字段 | ✅ 错失 tree-shaking |
| 28 | `spark-utils` 仅此一包有 `module` 字段 | 其余 6 包仅 `exports`；legacy bundler 消费不一致 | ✅ |
| 29 | `spark-project-model/vite.config.ts:28-30` | `test: {}` 放在 vite.config.ts；其他包用独立 vitest.config.ts | ✅ |
| **33** | 根 `vite.config.ts:44-45` | `server.fs.allow: ['..', '../../src']` 在 public 迁移后可收窄 | 🆕 ClassModel JSON 已走 `public/`，`'..'` 中仅剩 `generated/` 可能需要；如确认无其他依赖可移除 |

### ⚠️ 初版误报（已排除）

| 原 # | 结论 |
|------|------|
| build-all `execSync` 缺 `shell: true` | **误报**。`execSync` 在 Windows 默认经 cmd；`spawn` 才需 `shell: true` |
| build-packages skip 写 stamp | **误报**。skip 只写内存 fingerprint |
| 拓扑顺序 spark-data 在 spark-json-document 前 | **误报**。实际 json-document → spark-ai → spark-data |

---

## 九、#1 技术说明（spark-json-document 打包 ajv）— 历史记录

> **状态**：2026-06-14 已按 spark-utils 模式修复，本节保留初版根因说明。

旧 `external: /^@spark-appworks\//` 仅外部化 workspace 包。`import ... from 'ajv'` 不匹配 → Rollup 整包内联（初版 `dist/index.js` 6884 行）。

**现行做法**（`packages/spark-json-document/vite.config.ts`）：

```ts
external: (id) => !id.startsWith('.') && !id.startsWith('\0') && !isAbsolute(id)
// + preserveModules + schema/index、tree/index 多 entry
```

---

## 十、ClassModel public 迁移审核（2026-06-14 落地）

### 架构

```text
generated/dts-class-model/          ← 编译 SSOT（入库 git，1322 文件/21MB）
         │
    sync-class-model-static.mjs     ← 全量 rmSync + cpSync
         ↓
public/dts-class-model/             ← 运行时镜像（.gitignore 排除）
         ↓
Vite public/ → dist/dts-class-model/  ← 生产构建原样拷贝
         ↓
Worker fetch('/dts-class-model/manifest.json')  ← HTTP 绝对路径
```

### 落地检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `sync-class-model-static.mjs` 实现 | ✅ | 全量 rm + cp，功能正确 |
| `ensure-class-model-bundle.mjs` 集成 sync | ✅ | generate 后自动 sync |
| `generate-dts-class-model.mjs` 末尾 sync | ✅ | generate 完成后调用 sync |
| `start-dev.mjs` 启动前 sync | ✅ | Vite 启动前确保 public/ 有最新镜像 |
| `build-frontend.mjs` 注释更新 | ✅ | 说明 ensure 已含 sync |
| `.gitignore` 排除 `public/dts-class-model/` | ✅ | 镜像不入库 |
| `public/README.md` 文档更新 | ✅ | 说明 dts-class-model/ 为编译镜像 |
| `artifact-urls.ts` 改为绝对路径 | ✅ | `/dts-class-model/manifest.json` |
| `--from-disk` / `--delete-declarations` 清理 | ✅ | 已从 generate 脚本移除 |
| `build:check` 脚本链路 | ✅ | generate 末尾含 sync |

### 🆕 遗留问题

| # | 严重度 | 位置 | 问题 | 修复建议 |
|---|--------|------|------|----------|
| **30** | 🔴 | `artifact-urls.ts:11` | `DEFAULT_DEV_ORIGIN` 硬编码 `127.0.0.1:5273` | 从 `process.env.VITE_PORT` 读取，或由 `start-dev.mjs` 注入环境变量 |
| **31** | 🔴 | `artifact-urls.ts:20` | 模块顶层求值 `dtsClassModelManifestUrl` | 改为函数调用，由调用方在 Worker init 时传入 origin；或延迟求值 |
| **32** | 🟡 | `sync-class-model-static.mjs:27-29` | 全量删拷 21MB | 后续可改为增量同步（mtime 比对）；当前低优先级 |
| **33** | 🟢 | `vite.config.ts:44-45` | `fs.allow` 可收窄 | 确认 `'..'` 无其他用途后移除；不阻塞 |

---

## 十一、declarationDir 连锁（复核表）

| 包 | declarationDir | types 入口 |
|---|---|---|
| spark-utils | — | `./dist/index.d.ts` |
| spark-data | `./dist/types` | `./dist/types/index.d.ts` |
| spark-json-document | — | `./dist/index.d.ts` |
| spark-project-model | — | `./dist/index.d.ts` |
| spark-ai | — | `./dist/index.d.ts` |
| spark-component | — | `./dist/index.d.ts` |
| spark-app | `./dist/types` | `./dist/types/index.d.ts` |

---

## 十二、后续优先级建议

1. **P0** — 修复 `artifact-urls.ts` 硬编码端口 + 顶层求值（#30 #31）
2. **P1** — 评估 declarationDir 是否收敛到 `dist/`（#4）
3. **P2** — 补齐 component/app 对 json-document 子路径的 build paths（#8）+ spark-component `spark-utils/internal` 映射（#17）
4. **P3** — spark-project-model 自引用 paths/alias（#6 #7）
5. **P4** — spark-project-model tsconfig.build.json 补齐缺失字段（#20）
6. **P5** — `--only` 取依赖闭包（#21）、manualChunks 补 spark-json-document（#22）
7. **P6** — lint 统一（#23 #24 #25）、sideEffects（#27）

---

## 附录：复核命令

```bash
node scripts/build-packages.mjs --dry-run
pnpm --filter @spark-appworks/spark-json-document run build
# 检查: dist/index.js 行数; 是否存在 dist/schema/index.js
pnpm run verify          # 无 dist
pnpm run verify:dist     # 含 build:packages
ls public/dts-class-model/manifest.json  # sync 镜像存在
```
