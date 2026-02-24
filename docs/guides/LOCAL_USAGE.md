# 本地使用 @spark-view/* 包（不通过 npm）

## 概览

| 使用场景 | 推荐方式 | 特点 |
|---|---|---|
| 在本 monorepo 内开发 | `workspace:*` | 零配置，已就绪 |
| 外部独立项目（稳定引用） | `file:` 协议 | 指向本地构建产物 |
| 外部独立项目（开发调试） | `pnpm link` | 改包立即生效 |

---

## 方式一：monorepo 内部（workspace:*）

本仓库中所有 `packages/*` 已通过 `pnpm-workspace.yaml` 声明为 workspace 包，
**包之间相互引用无需任何额外配置**。

```json
// 任意 packages/* 或 src/ 下的 package.json
{
  "dependencies": {
    "@spark-view/spark-component": "workspace:*",
    "@spark-view/spark-utils":     "workspace:*",
    "@spark-view/spark-data":      "workspace:*",
    "@spark-view/spark-app":       "workspace:*",
    "@spark-view/spark-page-config": "workspace:*"
  }
}
```

pnpm 会自动将 `workspace:*` 解析为本地对应包，**无需构建产物**（开发时直接走源码）。

---

## 方式二：外部项目 — `file:` 协议

适合将本仓库的包引入另一个独立项目，**稳定引用本地构建产物**。

### 步骤

**1. 构建所有包**（每次修改包源码后需重新构建）

```powershell
cd D:\SPARK_VIEW
pnpm run build:packages
```

**2. 在外部项目的 `package.json` 中声明依赖**

```json
{
  "dependencies": {
    "@spark-view/spark-utils":       "file:D:/SPARK_VIEW/packages/spark-utils",
    "@spark-view/spark-data":        "file:D:/SPARK_VIEW/packages/spark-data",
    "@spark-view/spark-component":   "file:D:/SPARK_VIEW/packages/spark-component",
    "@spark-view/spark-app":         "file:D:/SPARK_VIEW/packages/spark-app",
    "@spark-view/spark-page-config": "file:D:/SPARK_VIEW/packages/spark-page-config"
  }
}
```

**3. 安装依赖**

```powershell
cd D:\YOUR_PROJECT
pnpm install
```

**4. 配置 TypeScript 路径**（`tsconfig.json` / `vite.config.ts`）

```json
// tsconfig.json — compilerOptions.paths
{
  "paths": {
    "@spark-view/spark-utils":       ["D:/SPARK_VIEW/packages/spark-utils/dist/index.d.ts"],
    "@spark-view/spark-data":        ["D:/SPARK_VIEW/packages/spark-data/dist/types/index.d.ts"],
    "@spark-view/spark-component":   ["D:/SPARK_VIEW/packages/spark-component/dist/index.d.ts"],
    "@spark-view/spark-app":         ["D:/SPARK_VIEW/packages/spark-app/dist/types/index.d.ts"],
    "@spark-view/spark-page-config": ["D:/SPARK_VIEW/packages/spark-page-config/dist/index.d.ts"]
  }
}
```

> **注意**：`file:` 协议安装后是复制快照，修改源码后必须重新 `build:packages` + `pnpm install` 刷新。

---

## 方式三：外部项目 — `pnpm link`（开发调试）

适合**频繁修改包源码**并希望外部项目立即感知变更的场景。

### 步骤

**1. 在每个包目录注册全局 link**

```powershell
cd D:\SPARK_VIEW\packages\spark-utils;       pnpm link --global
cd D:\SPARK_VIEW\packages\spark-data;        pnpm link --global
cd D:\SPARK_VIEW\packages\spark-component;   pnpm link --global
cd D:\SPARK_VIEW\packages\spark-app;         pnpm link --global
cd D:\SPARK_VIEW\packages\spark-page-config; pnpm link --global
```

**2. 在外部项目中消费 link**

```powershell
cd D:\YOUR_PROJECT
pnpm link --global @spark-view/spark-utils
pnpm link --global @spark-view/spark-data
pnpm link --global @spark-view/spark-component
pnpm link --global @spark-view/spark-app
pnpm link --global @spark-view/spark-page-config
```

**3. 开包监听模式（修改源码实时构建）**

打开单独终端，在 SPARK_VIEW 项目中：

```powershell
# 监听单个包（示例）
cd D:\SPARK_VIEW\packages\spark-component
npx vite build --watch
```

或在根目录对所有包并发监听（需要项目支持 `--watch` 脚本）：

```powershell
cd D:\SPARK_VIEW
pnpm --filter "./packages/**" exec vite build --watch
```

**4. 解除 link**

```powershell
# 外部项目中解除（恢复为 npm 版本）
cd D:\YOUR_PROJECT
pnpm unlink @spark-view/spark-component
pnpm install  # 重新从 npm 安装
```

---

## 选择建议

```
修改本仓库包的同时在外部项目测试效果？
  → 方式三（pnpm link + --watch）

外部项目仅需稳定使用当前版本？
  → 方式二（file: 协议）+ 偶尔 build:packages + pnpm install

只在本仓库 monorepo 内部开发？
  → 方式一（workspace:*，已默认配置好）
```
