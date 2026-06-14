# TypeScript 官方增量编译路径研究

> **研究日期**: 2026-06-14
> **TypeScript 版本**: 6.0.3（本仓实际安装版本）
> **关联文档**: [`docs/build-pipeline-audit.md`](./build-pipeline-audit.md) 第五节「官方增量编译路径（对照）」

---

## 一、三条官方路径总览

TypeScript 提供了三条增量编译路径，粒度从粗到细、API 从高到低：

```
┌─────────────────────────────────────────────────────────┐
│  路径三：tsc -b + Project References（多项目编排级）     │
│  拓扑排序、up-to-date 检测、跨项目增量                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │  路径一：--incremental + .tsbuildinfo（单项目文件级）│ │
│  │  内容 hash 对比、受影响文件追踪、诊断缓存            │ │
│  │  ┌──────────────────────────────────────────────┐ │ │
│  │  │  路径二：BuilderProgram API（程序化文件级）    │ │ │
│  │  │  诊断缓存、增量发射、affected 迭代            │ │ │
│  │  └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

| 维度 | `--incremental` | `--build` + References | BuilderProgram API |
|------|----------------|----------------------|-------------------|
| 粒度 | 文件级 | 项目级 + 文件级 | 可精确到单文件 |
| 适用场景 | 单项目 | monorepo 多项目 | 构建工具集成 |
| 增量检测 | `.tsbuildinfo` 内容 hash | mtime + `.tsbuildinfo` | 完全自定义 |
| 依赖感知 | 传递闭包 | 项目间 + 项目内 | 可自定义 |
| Vue 支持 | 需 vue-tsc 适配 | 需 vue-tsc 适配 | 需自建 host |

---

## 二、路径一 — `--incremental` + `.tsbuildinfo`

### 2.1 概述

**引入版本**: TypeScript 3.4

核心思想：首次编译后在 outDir 生成 `.tsbuildinfo` 文件，后续编译时读取此文件，仅重新检查/发射发生变化的文件及其传递依赖。

### 2.2 tsconfig 配置

```jsonc
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": "./buildcache/.tsbuildinfo"  // 可选，自定义路径
  }
}
```

- `incremental` 默认 `false`，但 `composite: true` 时**自动开启**
- `tsBuildInfoFile` 默认 `{tsconfig名}.tsbuildinfo`，位于 outDir 或项目根
- `.tsbuildinfo` 可安全删除（退化为全量编译），应加入 `.gitignore`
- `assumeChangesOnlyAffectDirectDependencies: true` 可缩小影响范围（仅直接依赖受影响，不追踪传递闭包）

### 2.3 `.tsbuildinfo` 文件格式

**实测 TypeScript 6.0.3，JSON 格式：**

```jsonc
{
  // 1. 所有参与编译的文件路径（含 lib .d.ts），数组
  "fileNames": [
    "d:/.../lib.es5.d.ts",
    "d:/.../lib.es2015.d.ts",
    // ... ~80 个 lib .d.ts
    "./a.ts",
    "./b.ts",
    "./c.ts"
  ],

  // 2. 每个文件对应的元信息（与 fileNames 一一对应）
  "fileInfos": [
    // lib .d.ts：version(内容hash) + affectsGlobalScope + impliedFormat
    {"version":"bcd24271...", "affectsGlobalScope":true, "impliedFormat":1},
    // 无全局影响的 lib：仅 version + impliedFormat
    {"version":"3f88bedb...", "impliedFormat":1},
    // 用户源文件：version + affectsGlobalScope
    {"version":"683314ed...", "affectsGlobalScope":true},
    // 已发射过的文件：增加 signature（emit 产出指纹）
    {"version":"4298da96...", "signature":"218da610..."},
  ],

  // 3. 根文件索引（指向 fileNames 数组下标）
  "root": [83],

  // 4. 编译选项快照（用于检测配置变化）
  "options": {"outDir":"./", "skipLibCheck":true, ...},

  // 5. 每个文件的语义诊断缓存（索引或诊断数组）
  "semanticDiagnosticsPerFile": [1, 2, 83, 84, 85],

  // 6. TypeScript 版本
  "version": "6.0.3"
}
```

**有 `references` 时的额外字段（非叶子项目）：**

```jsonc
{
  // 引用图：[被引用文件索引, 引用它的文件数量]
  "referencedMap": [[84, 1]],
  // 文件 ID 列表
  "fileIdsList": [[83]],
  // 最近变化的 .d.ts（下游项目据此判断是否需要重建）
  "latestChangedDtsFile": "./main.d.ts"
}
```

**`fileInfo` 字段含义：**

| 字段 | 类型 | 含义 |
|------|------|------|
| `version` | string | 文件内容 SHA-256 hash（忽略 sourceMappingURL） |
| `signature` | string | emit 产出指纹（仅已发射文件有） |
| `affectsGlobalScope` | boolean | 是否影响全局作用域（如声明全局变量） |
| `impliedFormat` | number | 模块格式（1=ESM, 2=CJS, etc.） |

**影响 `affectsBuildInfo` 的编译选项**（变化时强制全量重建）：

`declaration`, `declarationMap`, `emitDeclarationOnly`, `sourceMap`, `inlineSourceMap`, `composite`, `incremental`, `tsBuildInfoFile`, `jsx`, `module`, `target`, `assumeChangesOnlyAffectDirectDependencies`

### 2.4 增量行为实测

**测试场景**: `a.ts ← b.ts ← c.ts` 依赖链，修改 `b.ts`：

```
Incrementally affected files after changing b.ts: [ 'b.ts', 'c.ts' ]
```

✅ `a.ts` 未变且不在 b 的传递依赖闭包内 → **跳过**
✅ TS 自动追踪传递依赖闭包，无需手动声明

### 2.5 关键限制

- **内存 emit 无法复用官方 skip**：磁盘 `outDir` + buildinfo 才能让 TS 在二次运行时跳过未变 `.d.ts` 写出；内存 `writeFile` 回调无法复用
- `compilerOptions.incremental: true` 必须配合 **`createIncrementalProgram`** 或 **`createIncrementalCompilerHost`**，普通 `createProgram` 忽略 buildinfo
- `emitResult.emitSkipped` 表示**整次 emit 被中止**（如 `noEmitOnError`、rootDir 冲突），**不是**单文件跳过

---

## 三、路径二 — BuilderProgram 程序化 API

### 3.1 概述

**引入版本**: TypeScript 2.7（BuilderProgram），3.6（增量 API）

提供最细粒度的增量控制，适合构建工具集成。

### 3.2 核心 API 签名

#### BuilderProgram（诊断缓存 + 增量发射）

```typescript
// 两种 Builder 变体
ts.createSemanticDiagnosticsBuilderProgram(
  rootNames, options, host?, oldProgram?, configFileParsingDiagnostics?, projectReferences?
): SemanticDiagnosticsBuilderProgram

ts.createEmitAndSemanticDiagnosticsBuilderProgram(
  rootNames, options, host?, oldProgram?, configFileParsingDiagnostics?, projectReferences?
): EmitAndSemanticDiagnosticsBuilderProgram
```

| API | 诊断缓存 | 增量发射 |
|-----|---------|---------|
| `createSemanticDiagnosticsBuilderProgram` | ✅ | ❌ |
| `createEmitAndSemanticDiagnosticsBuilderProgram` | ✅ | ✅ |

**关键方法：**

```typescript
interface EmitAndSemanticDiagnosticsBuilderProgram extends SemanticDiagnosticsBuilderProgram {
  // 逐个获取受影响文件的语义诊断（跳过未变化的）
  getSemanticDiagnosticsOfNextAffectedFile(
    cancellationToken?, ignoreSourceFile?
  ): AffectedFileResult<readonly Diagnostic[]> | undefined

  // 逐个发射受影响文件（跳过未变化的）
  emitNextAffectedFile(
    writeFile?, cancellationToken?, emitOnlyDtsFiles?, customTransformers?
  ): AffectedFileResult<EmitResult> | undefined
}
```

#### IncrementalProgram（`.tsbuildinfo` 集成）

```typescript
// 创建增量编译 host（自动处理 buildinfo 读写）
ts.createIncrementalCompilerHost(options, system?): CompilerHost

// 创建增量程序（封装 buildinfo 逻辑）
ts.createIncrementalProgram<T extends BuilderProgram>({
  rootNames: readonly string[];
  options: CompilerOptions;
  configFileParsingDiagnostics?: readonly Diagnostic[];
  projectReferences?: readonly ProjectReference[];
  host?: CompilerHost;
  createProgram?: CreateProgram<T>;
}): T

// 从 .tsbuildinfo 恢复旧程序（只读，用作 oldProgram 参数）
ts.readBuilderProgram(
  options: CompilerOptions,
  host: ReadBuildProgramHost  // { useCaseSensitiveFileNames, getCurrentDirectory, readFile }
): EmitAndSemanticDiagnosticsBuilderProgram | undefined
```

**使用模式：**

```typescript
// 方式 A：createIncrementalProgram（最简单，自动管理 buildinfo）
const program = ts.createIncrementalProgram({
  rootNames: ['./src/a.ts'],
  options: { incremental: true, tsBuildInfoFile: './.tsbuildinfo' }
});
program.emit();

// 方式 B：手动传递 oldBuilder（更灵活）
const host = ts.createIncrementalCompilerHost(opts);
const oldBuilder = ts.readBuilderProgram(opts, readHost);
const builder = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
  rootNames, opts, host, oldBuilder
);

// 逐个发射受影响文件
let result;
while ((result = builder.emitNextAffectedFile())) {
  // result.affected: SourceFile | Program
  // result.result: EmitResult
}
```

#### Watch API（文件监听增量）

```typescript
// 从 tsconfig 创建 watch host
ts.createWatchCompilerHost<T extends BuilderProgram>(
  configFileName: string,
  optionsToExtend?, system?, createProgram?, reportDiagnostic?, reportWatchStatus?,
  watchOptionsToExtend?, extraFileExtensions?
): WatchCompilerHostOfConfigFile<T>

// 从根文件创建 watch host
ts.createWatchCompilerHost<T extends BuilderProgram>(
  rootFiles: string[], options: CompilerOptions, system: System,
  createProgram?, reportDiagnostic?, reportWatchStatus?,
  projectReferences?, watchOptions?
): WatchCompilerHostOfFilesAndCompilerOptions<T>

// 启动 watch
ts.createWatchProgram(host): WatchOfConfigFile<T> | WatchOfFilesAndCompilerOptions<T>
```

**Watch 内部机制：**
- 基于 BuilderProgram 的增量重编译
- 文件版本通过内容 hash 检测变化（忽略 sourceMappingURL）
- 支持 `setTimeout`/`clearTimeout` 批量合并变化
- 多种 watch 类型：Config / Source / Directory / Resolution / Package

### 3.3 BuilderProgramHost

```typescript
interface BuilderProgramHost {
  // 自定义 hash 函数（替代文件内容用于变更检测）
  createHash?: (data: string) => string;
  // 默认 writeFile 回调
  writeFile?: WriteFileCallback;
}
```

---

## 四、路径三 — `tsc --build` + Project References

### 4.1 概述

**引入版本**: TypeScript 3.0（references），3.4（增量检测），3.6（API）

`tsc -b` 作为构建编排器：按拓扑序构建所有被引用项目，**跳过 up-to-date 的项目**。

### 4.2 项目结构

```text
lib/
  util.ts
  tsconfig.json    → { composite: true, declaration: true, outDir: "dist", rootDir: "." }
app/
  main.ts
  tsconfig.json    → { composite: true, declaration: true, outDir: "dist", rootDir: ".",
                       references: [{ path: "../lib" }] }
tsconfig.json      → { files: [], references: [{ path: "lib" }, { path: "app" }] }  ← solution 入口
```

### 4.3 SolutionBuilder API

```typescript
// 创建 host
const host = ts.createSolutionBuilderHost<T>(
  system?,              // 默认 ts.sys
  createProgram?,       // 自定义 builder 工厂
  reportDiagnostic?,    // 诊断回调
  reportStatus?,        // 状态回调
  reportErrorSummary?   // 错误摘要回调
);

// 创建 builder
const builder = ts.createSolutionBuilder<T>(host, rootNames: string[], defaultOptions: BuildOptions);

// 构建方法
builder.build(project?);                  // 构建所有/指定项目
builder.buildReferences(project);          // 仅构建指定项目的依赖
builder.clean(project?);                   // 清理输出
builder.cleanReferences(project?);         // 清理依赖输出

// 逐个获取失效项目（自定义编排）
let project: InvalidatedProject<T> | undefined;
while ((project = builder.getNextInvalidatedProject())) {
  project.kind;    // InvalidatedProjectKind.Build | UpdateOutputFileStamps
  project.project; // ResolvedConfigFileName
  project.done();  // 执行构建，返回 ExitStatus
  // BuildInvalidedProject 还有:
  project.getBuilderProgram();
  project.getProgram();
  project.getSourceFile(fileName);
  project.getSourceFiles();
}
```

**BuildOptions：**

```typescript
interface BuildOptions {
  dry?: boolean;           // 只显示不执行
  force?: boolean;         // 强制全量
  verbose?: boolean;       // 详细日志
  stopBuildOnErrors?: boolean;
  incremental?: boolean;
  assumeChangesOnlyAffectDirectDependencies?: boolean;
  declaration?: boolean;
  declarationMap?: boolean;
  emitDeclarationOnly?: boolean;
  sourceMap?: boolean;
  inlineSourceMap?: boolean;
  traceResolution?: boolean;
}
```

### 4.4 SolutionBuilder 实测行为

```
# 首次构建
Project 'lib/tsconfig.json' is out of date because output file does not exist → Building...
Project 'app/tsconfig.json' is out of date because output file does not exist → Building...

# 二次构建（无变化）
Project 'lib/tsconfig.json' is up to date because newest input is older than output
Project 'app/tsconfig.json' is up to date because newest input is older than output

# 修改 lib/util.ts 后
Project 'lib/tsconfig.json' is out of date because output is older than input → Building...
Project 'app/tsconfig.json' is up to date with .d.ts files from its dependencies
  → Updating output timestamps of project 'app/tsconfig.json'...
```

**关键行为：**
- 依赖项目用 `.d.ts` 而非源码（加载更快）
- 自动拓扑排序：依赖先于消费者构建
- `noEmitOnError` 隐式开启（有错误不产出）
- 支持 `--watch`（`tsc -b --watch`）
- 时间戳注意事项：git checkout 后可能需要 `--force`（git 不保证保留 mtime）

### 4.5 `composite` 强制约束

- `declaration` 默认 `true`（其他项目需要 `.d.ts`）
- `rootDir` 默认为 tsconfig 所在目录
- 所有实现文件必须被 `include` 或 `files` 匹配
- 隐式设置 `incremental: true`

### 4.6 Solution-style tsconfig 模式

```jsonc
// 顶层 solution tsconfig（仅作编排入口，不含源码）
{
  "files": [],
  "references": [
    { "path": "./src" },
    { "path": "./test" }
  ]
}
```

单一入口 `tsc -b` 即可构建全部，自动按依赖序执行。

### 4.7 Watch + SolutionBuilder

```typescript
const host = ts.createSolutionBuilderWithWatchHost(
  system, createProgram, reportDiagnostic, reportStatus, reportWatchStatus
);
const builder = ts.createSolutionBuilderWithWatch(host, rootNames, defaultOptions, baseWatchOptions?);
```

---

## 五、对本项目的适配分析

### 5.1 现状

本仓**未使用任何官方增量路径**，自建两套系统：

1. **包级指纹缓存** (`scripts/lib/package-build-cache.mjs`)：SHA-256 内容哈希，粗粒度跳过整包
2. **ClassModel mtime 快照** (`scripts/lib/class-model-incremental-build.mjs`)：文件 mtime 对比，细粒度跳过投影

### 5.2 当前 .d.ts 不落盘的根因

ClassModel 生成管线全程**内存 emit**，`.d.ts` 从不写入磁盘：

**compiler-api 后端** (`emitDeclarationsWithCompilerApiToMemory`)：
- 用 `proxyCreateProgram`（Volar Vue 代理）+ `ts.createCompilerHost` 创建程序
- `program.emit(undefined, writeFile, undefined, true /* emitOnlyDtsFiles */)`
- `writeFile` 回调拦截 `.d.ts` 到 `Map<string, string>`，**不落盘**
- `outDir: "class-model-emit"` 仅作为虚拟键前缀（`class-model-emit/packages/.../*.d.ts`）

**vue-tsc 后端** (`emitDeclarationsWithVueTscToMemory`)：
- 猴补 `node:fs.openSync/writeSync/closeSync`，用负数 fake fd 截获 `.d.ts` 写入到内存
- 执行 `require('vue-tsc').run()`，捕获 `process.exit()`
- 恢复原 fs 方法，**同样不落盘**

**`tsconfig.class-model-emit.json` 配置：**
```jsonc
{
  "$comment": "ClassModel 内存 emit 配置；仅由 scripts/generate-dts-class-model.mjs 读取，outDir 为虚拟路径前缀",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "declarationMap": false,
    "outDir": "class-model-emit",   // ← 虚拟前缀，不是真实磁盘路径
    "rootDir": "."
  }
  // 无 incremental / tsBuildInfoFile
}
```

**`class-model-emit-path.ts` 虚拟映射：**
- `CLASS_MODEL_EMIT_PREFIX = 'class-model-emit/'` — 所有内存 .d.ts 键的前缀
- `toClassModelEmitPath('packages/spark-ai/src/agent/ai-host.ts')` → `'class-model-emit/packages/spark-ai/src/agent/ai-host.d.ts'`
- `sourceFileFromEmitPath(...)` 反向映射回源文件路径
- 这些路径**仅存在于内存 Map 的 key 中**，磁盘上无对应文件

**后果：无法利用 TS 官方增量 emit**
- `.tsbuildinfo` 需要**磁盘 `outDir`** 来定位和读写，虚拟路径无法触发
- `createIncrementalProgram` / `readBuilderProgram` 依赖 buildinfo 持久化，内存 writeFile 回调无法复用 TS 内部 skip 逻辑
- L1 增量（`canSkipDeclarationEmit`）在 **emit 前**通过 mtime 比对全量跳过，但一旦有变化就必须全量 emit，无法跳过未变的单个 .d.ts

### 5.3 可优化方向

| 优先级 | 方向 | 对标官方路径 | 预期收益 | 复杂度 |
|--------|------|-------------|---------|--------|
| **P3** | L2 磁盘 buildinfo 增量 emit | 路径一 `--incremental` | 部分变更时跳过未变 `.d.ts` 写出（当前全量内存 emit） | 中 |
| **P4** | 包级 composite + references | 路径三 `tsc -b` | 各包独立增量、并行构建 | 高（需拆 tsconfig） |
| **P4** | BuilderProgram 替代 createProgram | 路径二 API | 精确 affected file 追踪，支持增量发射 | 中 |
| **P5** | Watch API 集成 ClassModel | Watch API | 文件变化时自动增量重建 ClassModel | 低 |

### 5.4 L2 buildinfo 接入方案（P3 预研）

```text
当前: createProgram → 全量内存 emit → 按 mtime 过滤投影
目标: createIncrementalProgram → 增量内存 emit（仅 affected .d.ts）→ 投影

关键改动:
1. .cache/class-model-emit/ 落盘 .d.ts + tsconfig.tsbuildinfo
2. outDir 改为真实磁盘路径 .cache/class-model-emit/
3. createIncrementalCompilerHost 替代 createCompilerHost
4. createIncrementalProgram 替代 createProgram
5. emitNextAffectedFile 逐文件发射（而非全量 emit）

落地后增量流程:
  首次: createIncrementalProgram → emit → .d.ts 落盘 + .tsbuildinfo 落盘
  增量: readBuilderProgram 读 .tsbuildinfo → 创建新 BuilderProgram
       → emitNextAffectedFile 逐文件发射（仅 affected .d.ts）
       → 投影仅处理新发射的 shard

收益估算:
  全量 emit (~70s) → 仅 emit 受影响文件（预期 ~10-30s，取决于变更范围）
  L1 已覆盖"全部未变跳过 emit"场景；L2 收益集中在"部分变更"场景

关键风险与注意事项:
- 内存 writeFile 回调无法复用 TS 内部 skip 逻辑
  → 落盘 outDir + buildinfo 才能让 TS 自己判断哪些 .d.ts 不需要重写
  → 投影阶段仍需读 .d.ts 内容，但可从磁盘读取而非内存 Map
- vue-tsc 后端适配需确认:
  - vue-tsc 是否支持 incremental host
  - 猴补 fs 模式与 buildinfo 持久化是否冲突
  - 可能需切换为 compiler-api 后端独占增量模式
- .cache/ 需加入 .gitignore（.gitignore 已有 *.tsbuildinfo 排除规则）
- Volar proxyCreateProgram 与 createIncrementalProgram 的兼容性待验证
- 落盘 .d.ts 占用空间：预计 ~5-10MB（全仓声明文件），可接受
```

### 5.5 现有增量架构对照

| 层级 | 机制 | 官方入口 | 本仓现状 |
|------|------|----------|----------|
| **L1 应用增量** | 源文件 mtime + shard 指纹，跳过投影/emit | 无（自研） | ✅ 已落地：`.dts-manifest.json` + `planIncrementalBundleBuild` |
| **L2 TS 官方增量** | `.tsbuildinfo` 记录图变更，跳过未变输出 | `incremental` + `tsBuildInfoFile`；Compiler API 须用 `ts.createIncrementalProgram` | ❌ 未接入；.d.ts 不落盘，无法持久化 buildinfo |
| **L3 TS 工程引用** | 按 package 分片，`tsc --build` 只编脏子工程 | `composite` + `references` + `tsc -b` | ❌ 单仓 `tsconfig.class-model-emit.json` 扁平 include |
| **L4 定向 emit** | 仅编译变更根文件 + 依赖闭包 | `program.emit(sourceFile)` / 缩小 `rootNames` | ✅ `--model`/`--source` + `sourceRootFiles`（compiler-api） |
| **L5 监听增量** | watch + 复用 Program | `createWatchProgram` / `createSolutionBuilderWithWatch` | ❌ 仅 dev HMR，未用于 ClassModel |

---

## 六、参考来源

- [TypeScript 3.4 Release Notes — Incremental](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html)
- [TypeScript 3.6 Release Notes — APIs for --build and --incremental](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-6.html)
- [TypeScript Project References 文档](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript TSConfig — incremental](https://www.typescriptlang.org/tsconfig#incremental)
- [TypeScript TSConfig — composite](https://www.typescriptlang.org/tsconfig#composite)
- [TypeScript Compiler API Wiki](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [TypeScript PR #31432 — Solution Builder API](https://github.com/microsoft/TypeScript/pull/31432)
- [TypeScript 源码 builder.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/builder.ts)
- [TypeScript 源码 watch.ts](https://github.com/microsoft/TypeScript/blob/main/src/compiler/watch.ts)
