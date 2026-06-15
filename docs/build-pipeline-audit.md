# SPARK AppWorks 编译管线审计

> **初版审计**: 2026-06-14  
> **终审日期**: 2026-06-14（全链路终审：所有🔴已清零，🟡仅剩 2 项，🟢 12 项均为设计取舍或低优先级）  
> **SSOT 索引**: 日常命令见 [`scripts/README.md`](../scripts/README.md)；ClassModel 架构见 [`packages/spark-ai/ARCHITECTURE.md`](../packages/spark-ai/ARCHITECTURE.md)

---

## 一、管线总览

pnpm monorepo，无 lerna/nx/turborepo，构建编排集中在 `scripts/`。

| 流水线 | 入口 | 用途 |
|--------|------|------|
| A. Dev | `pnpm run dev` | Docker MySQL → Java → Vite HMR |
| B. 前端生产 | `pnpm run build:fe` | ensure ClassModel bundle → 根 Vite build |
| C. 全量发布 | `pnpm run build` | Java JAR + 前端 |
| D. npm 包 | `pnpm run build:packages` | 拓扑排序 + 增量 stamp |
| E. 日常门禁 | `pnpm run verify` | typecheck + lint + verify:rules（**不**预构建 dist） |
| F. 产物门禁 | `pnpm run verify:dist` | build:packages + verify（发布前） |
| G. ClassModel | `pnpm run generate:class-model-surface` | 内存 emit → JSON bundle（**独立**于 D） |

```text
Dev / build:fe / verify  →  alias 指向 packages/*/src，通常不需要 dist
build:packages / verify:dist / publish  →  需要 packages/*/dist
generate:class-model-surface  →  generated/dts-class-model/（入库 SSOT，Vite 映射 /dts-class-model/）
```

---

## 二、流水线 A–D（摘要）

### A. Dev — `scripts/start-dev.mjs`

Docker MySQL (3406) → `mvn spring-boot:run` (8180) → Vite (5273+)。ClassModel 由 Vite 插件从 `generated/` 提供。

### B. 前端生产 — `scripts/build-frontend.mjs`

1. `ensure:class-model-bundle`（manifest 缺失才 generate）
2. `vite build`（插件将 `generated/dts-class-model` 拷贝到 `dist/dts-class-model/`）

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

**入口**: `scripts/generate-dts-class-model.mjs`

### 官方增量编译路径（对照）

| 层级 | 机制 | 官方入口 | 本仓现状 |
|------|------|----------|----------|
| **L1 应用增量** | 源文件 mtime + shard 指纹，跳过投影/emit | 无（自研） | ✅ 已落地：`.dts-manifest.json` + `planIncrementalBundleBuild` |
| **L2 TS 官方增量** | `.tsbuildinfo` 记录图变更，跳过未变输出 | `incremental` + `tsBuildInfoFile`；Compiler API 须用 **`ts.createIncrementalProgram`**（普通 `createProgram` 忽略 buildinfo） | ❌ 未接入；内存 emit 无持久 buildinfo |
| **L3 TS 工程引用** | 按 package 分片，`tsc --build` 只编脏子工程 | `composite` + `references` + `tsc -b` | ❌ 单仓 `tsconfig.class-model-emit.json` 扁平 include |
| **L4 定向 emit** | 仅编译变更根文件 + 依赖闭包 | `program.emit(sourceFile)` / 缩小 `rootNames` | ✅ `--model`/`--source` + `sourceRootFiles`（compiler-api） |
| **L5 监听增量** | watch + 复用 Program | `createWatchProgram` / `createSolutionBuilderWithWatch` | ❌ 仅 dev HMR，未用于 ClassModel |

**TypeScript 要点**（[Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) / [SO: incremental API](https://stackoverflow.com/questions/57554342)）：

- `compilerOptions.incremental: true` 必须配合 **`createIncrementalProgram`** 或 **`createIncrementalCompilerHost`**，否则不写 `.tsbuildinfo`。
- `emitResult.emitSkipped` 表示**整次 emit 被中止**（如 `noEmitOnError`、rootDir 冲突），**不是**单文件跳过；单文件增量依赖 buildinfo 脏集。
- 磁盘 `outDir` + buildinfo 才能让 TS 在二次运行时跳过未变 `.d.ts` 写出；内存 `writeFile` 回调无法复用官方 skip。

### 本仓三级增量策略

```text
tsconfig.class-model-emit.json
  → [L1] planIncrementalBundleBuild（emit 前，读 tsconfig 文件表 + .dts-manifest mtime）
  → 若 canSkipDeclarationEmit → 跳过内存 emit + 投影（~90s → ~1s）
  → 否则 emitDeclarationsToMemory (compiler-api / vue-tsc)
  → [L1] 仅 changed shard 走 buildDtsClassModelBundle（projectOnlySourcePaths）
  → generated/dts-class-model/manifest.json + files/**
  → Vite 插件：dev 静态映射 / build 拷贝至 dist/dts-class-model/
```

| 事实 | 说明 |
|------|------|
| 不落盘 `.d.ts` | 内存 emit 虚拟键 `class-model-emit/`；落盘 manifest/shard 索引键为源码 repo 相对路径 |
| **L1 增量（已落地）** | emit 前规划；manifest shard mtime 未变 → **跳过 declaration emit + 投影**（实测 ~70s → ~3s）；仅刷新 `.dts-manifest.json` |
| **config 漂移** | tsconfig 推导项多于 manifest 时记入 `newConfigSourcePaths`（如 `env.d.ts` / `vite-env.d.ts` 环境声明），**不阻断** `canSkipDeclarationEmit` |
| **部分变更** | 仅 changed 项进 `projectOnlySourcePaths`；Program 用依赖闭包；仍全量内存 emit（**P3：L2 磁盘 buildinfo**） |
| **`.dts-manifest.json`** | 构建辅助索引（`schemaVersion: 1` + `entries`）；记录 emit 键 → `sourceFile` / `shardFile` / `sourceModifiedAt` |
| **`--plan-only`** | 仅输出 emit 前增量计划（`changed` / `newConfig` / `removed`）后退出，用于诊断 |
| **`--full`** | 强制清空 `generated/dts-class-model/` 后全量重建 |
| **不使用 ajv** | 编译链仅依赖 `typescript` / `vue-tsc`；见下文「ajv 范围」 |
| 产出含 JSON Schema 形状 | `paramsSchema` 等由 `dts-type-schema.ts`（TypeChecker）静态投影，非运行时校验 |
| 定向重建 | `--model RootClassName` / `--source path`；refresh 见 `scripts/lib/class-model-knowledge-refresh.mjs` |
| 运行时加载 | Web Worker + `DtsClassModelBundleLoader` 按 HTTP fetch `/dts-class-model/**` |
| **单源架构** | 仅 `generated/dts-class-model/` 一处真源（**入库，可人工评审**）；无 `public/` 镜像；无 `runtime/manifest.json` 生产读路径 |

**产物文件分工**：

| 文件 | 角色 | 运行时 | CI |
|------|------|--------|-----|
| `manifest.json` | guide 目录 + `classIndex` 路由 | ✅ | `assertClassModelBundleComplete` |
| `files/**/*.d.ts.json` | 单文件 ClassModel shard（`generatedAt` = 源 mtime） | ✅ 懒加载 | shard 完整性 |
| `semantic-gaps.json` | module/model/constructor JSDoc 审计 | ❌ | `gapCount === 0` |
| `.dts-manifest.json` | 增量构建 mtime 索引 | ❌ | `class-model-incremental-build.test.ts` |

**守卫**: `scripts/ensure-class-model-bundle.mjs` — manifest 缺失时 generate，随后 `assertClassModelBundleComplete`（shard 完整性）。

**静态发布**: `tools/vite-plugin-class-model-static.ts` — dev 中间件 + build 拷贝至 `dist/`。

**门禁**: `verify:class-model:full` = generate → `verify-class-model-guide-json-schema.mjs` → `verify-class-model-semantic-gaps.mjs`（gapCount=0）→ verify:class-model（含 incremental 单测）→ typecheck。

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
| 1 | `packages/spark-json-document/vite.config.ts` | ~~ajv/jmespath 被 Rollup 内联~~ | ✔️ **已修复** |
| 2 | `packages/spark-json-document/vite.config.ts` + `package.json exports` | ~~`./schema` / `./tree` JS 入口缺失~~ | ✔️ **已修复** |
| 3 | `packages/spark-data/tsconfig.json:12` | ~~dev tsconfig 将 spark-utils 指到 dist~~ | ✔️ **已修复** |
| 30 | `artifact-urls.ts` | ~~硬编码 5273 + 模块顶层求值~~ | ✔️ **已修复** |
| 31 | `artifact-urls.ts` | ~~Node e2e fallback 不可达~~ | ✔️ **已修复** |
| 19 | `spark-component/.../JsonTreeEditor.vue` | ~~vxe-table 运行时依赖未声明~~ | ✔️ **已修复**：加入 devDeps |

**🔴 已全部清零。**

### 🟡 中严重度

| # | 位置 | 问题 | 复核 |
|---|------|------|------|
| 4 | ~~`spark-data` / `spark-app` `declarationDir`~~ | ~~仅这两包用 `declarationDir: ./dist/types`~~ | ✔️ **已修复**：与全仓一致，`.d.ts` 落在 `dist/` 根 |
| 5 | `sort-packages-by-dependency.mjs:19` | 拓扑只读 `dependencies`，不读 `peerDependencies` | ✅ 当前无 peer 依赖 workspace 包 |
| 6 | `spark-project-model/tsconfig.build.json` | ~~构建 tsconfig 自引用~~ | ✔️ **已修复** |
| 7 | `spark-project-model/vite.config.ts` | ~~自引用 alias~~ | ✔️ **已修复** |
| 8 | `spark-component` / `spark-app` `tsconfig.build.json` | ~~未映射 json-document 子路径~~ | ✔️ **已修复** |
| 17 | `spark-component/tsconfig.build.json` | ~~缺 spark-utils/internal~~ | ✔️ **已修复** |
| 18 | `spark-component/package.json` | ~~vue-router 仅 peerDeps~~ | ✔️ **已修复**：加入 devDependencies |
| ~~19~~ | ~~vxe-table~~ | ~~已升级至🔴并修复~~ | ✔️ 加入 devDeps `vxe-table` |
| 20 | `spark-project-model/tsconfig.build.json` | ~~缺 declarationMap 等~~ | ✔️ **已修复** |
| 21 | `build-packages.mjs --only` | ~~不含传递依赖~~ | ✔️ **已修复** |
| 22 | 根 `vite.config.ts` manualChunks | ~~无 spark-json-document chunk~~ | ✔️ **已修复** |
| **32** | ~~`sync-class-model-static` 全量删拷~~ | ✔️ **已移除**：改 Vite 插件直读 `generated/` |
| **37** | ~~`spark-ai/tsconfig.json`~~ | ~~开发 tsconfig 将 spark-utils + spark-json-document 解析到 dist~~ | ✔️ **已修复**：统一指向 `packages/*/src` |
| **38** | ~~`spark-app/tsconfig.json`~~ | ~~开发 tsconfig 将 spark-utils / spark-data 解析到 dist~~ | ✔️ **已修复**：统一指向 `packages/*/src` |

### 🟢 低严重度

| # | 位置 | 问题 | 复核 |
|---|------|------|------|
| 9 | `spark-json-document/vite.config.ts` | ~~单字符串 entry 风格不一致~~ | ✔️ 已与 spark-utils 对齐（多 entry + preserveModules） |
| 10 | 根 `vite.config.ts:185` | `spark-project-model` chunk 名 `'spark-config'` | ✅ |
| 11 | `spark-data/package.json` | 顶层 `"postcss": {}` | ✅ |
| 12 | `spark-utils`/`spark-data`/`spark-component`/`spark-ai`/`spark-app`/`spark-project-model` `tsconfig.json` | `target: ES2020` 覆盖根 ES2022（**6 包**，仅 spark-json-document 继承 ES2022） | ✅ |
| 13 | `spark-component/tsconfig.json:6` | `rootDir: "../.."` | ✅ |
| 14 | `spark-component/tsconfig.json:9-10` | spark-utils → src，internal → dist | ✅ |
| 15 | `package-build-cache.mjs` | CONFIG_FILES 硬编码；`builtAt` 非确定性 | ✅ 设计取舍 |
| 16 | 根 `vite.config.ts:15` | `VITE_CACHE_DIR` 未文档化 | ✅ |
| 23 | `spark-project-model/package.json` | ~~eslint legacy --ext~~ | ✔️ **已修复**：`eslint "src/**/*.ts"` |
| 24 | `spark-json-document/package.json` | ~~无 lint~~ | ✔️ **已修复**：补 lint + ESLint devDeps |
| 25 | `spark-app/package.json` | ~~lint 不含 .js~~ | ✔️ **已修复**：含 `{ts,tsx,js}` |
| 26 | `spark-app/package.json:46-49,60-61` | `vue`/`vue-router` 同时在 peer + dev Deps | ✅ 冗余（发布所需 devDeps，保留） |
| 27 | 所有 `packages/*/package.json` | ~~无 `sideEffects` 字段~~ | ✔️ **已修复**：纯 TS 包 `false`；Vue 包标注 `**/*.css` / `**/*.vue.js` |
| 28 | ~~`spark-utils` 仅此一包有 `module` 字段~~ | ~~其余 6 包仅 `exports`~~ | ✔️ **已修复**：publish 包统一 `module: ./dist/index.js` |
| 29 | `spark-project-model/vite.config.ts:28-30` | `test: {}` 放在 vite.config.ts；其他包用独立 vitest.config.ts | ✅ |
| **33** | 根 `vite.config.ts` | ~~`server.fs.allow` 可收窄~~ | ✔️ **已移除** |
| **34** | `vite-plugin-class-model-static` closeBundle | ~~不校验 shard 完整性~~ | ✔️ **已修复**：`assertClassModelBundleComplete` |
| **35** | `vite-plugin-class-model-static` cpSync | 全量拷贝 21MB | ✅ 低优先级，行为正确 |
| **40** | ~~`ensure-class-model-bundle.mjs`~~ | ~~仅 manifest 存在检查~~ | ✔️ **已修复**：generate 后调用 `assertClassModelBundleComplete` |
| **41** | `class-model-bundle-assert.test.ts` | 可选扩展 manifest 缺失用例 | 🟢 低优先级 |

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
generated/dts-class-model/          ← 编译 SSOT（入库 git，开发直接评审）
         ↓
vite-plugin-class-model-static      ← dev: HTTP /dts-class-model/**  |  build: → dist/dts-class-model/
         ↓
Worker fetch('/dts-class-model/manifest.json')
```

### 落地检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `vite-plugin-class-model-static.ts` | ✅ | dev 映射 + build 拷贝至 dist |
| `generated/dts-class-model/` 入库可评审 | ✅ | 已移除 public 镜像 |
| `ensure:class-model-bundle.mjs` | ✅ | manifest 缺失时 generate |
| `artifact-urls.ts` 运行时求值 | ✅ | `getDtsClassModelManifestUrl()` + env |
| `assertClassModelBundleComplete` | ✅ | build / ensure 前校验 manifest + shard |
| `assertClassModelGuideExecutableSchemas` | ✅ | `verify:class-model:full` 校验 jsonSchema-only 可执行 schema |
| `class-model-incremental-build` | ✅ | `.dts-manifest.json` mtime 增量；`verify:class-model` 单测 |

### 遗留问题（低优先级）

| # | 严重度 | 位置 | 问题 | 状态 |
|---|--------|------|------|------|
| **33** | 🟢 | `vite.config.ts` fs.allow | ✔️ **已移除** |
| **34** | ~~`ensure-class-model-bundle.mjs`~~ | ~~未调用 assert~~ | ✔️ **已修复**（见 #40） |
| **41** | `class-model-bundle-assert.test.ts` | ~~可选扩展 manifest 缺失用例~~ | ✔️ **已修复** |
| **42** | emit 阶段增量 | ~~内存 `.d.ts` emit 仍全仓~~ | ✔️ **L1 已落地**：`canSkipDeclarationEmit` 全未变时跳过 emit；**P3：L2 磁盘 buildinfo** |

---

## 十一、types 入口（复核表）

| 包 | types 入口 |
|---|---|
| spark-utils | `./dist/index.d.ts` |
| spark-data | `./dist/index.d.ts` |
| spark-json-document | `./dist/index.d.ts` |
| spark-project-model | `./dist/index.d.ts` |
| spark-ai | `./dist/index.d.ts` |
| spark-component | `./dist/index.d.ts` |
| spark-app | `./dist/index.d.ts` |

全仓已统一：**无 `declarationDir`**，声明与 JS 同目录 `dist/`。

---

## 十二、后续优先级建议

1. **P3** — `class-model-bundle-assert.test.ts` 扩展更多 semantic-gaps 失败样例（可选）
2. **P3** — 逐步为 attribute/method 补 JSDoc（不计入 CI 门禁，仅改善 semantic-gaps.json 信息密度）
3. **P3 — L2 官方增量 emit**：`.cache/class-model-emit/` + `incremental`/`tsBuildInfoFile` + `createIncrementalProgram`，部分变更时跳过未变 `.d.ts` 写出

---

## 附录：复核命令

```bash
node scripts/build-packages.mjs --dry-run
pnpm --filter @spark-appworks/spark-json-document run build
# 检查: dist/index.js 行数; 是否存在 dist/schema/index.js
pnpm run verify          # 无 dist
pnpm run verify:dist     # 含 build:packages
ls generated/dts-class-model/manifest.json  # SSOT（入库，可评审）
pnpm exec vitest run tests/scripts/class-model-incremental-build.test.ts  # 增量 mtime 契约
node --import tsx scripts/generate-dts-class-model.mjs --plan-only       # 诊断 changed/newConfig/removed
# 二次 generate 应出现：unchanged=N changed=0 newConfig=2 skipEmit=true（~3s，非 ~70s）
pnpm run generate:class-model-surface
```
