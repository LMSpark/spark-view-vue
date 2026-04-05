# DevSystem 版本管理设计文档

> **状态**：Implemented  
> **日期**：2026-04-05  
> **目标**：记录已实现的文件级手动版本管理架构

---

## 1. 术语定义

| 概念 | 英文 | 层级 | 存储 | 生命周期 |
|------|------|------|------|----------|
| **本地快照** | Local Snapshot | 前端 | `localStorage`（ring buffer） | 浏览器级别，切设备即丢失 |
| **后端版本** | File Version | 后端 | 磁盘 `{version}__{filename}` + H2 DB 元数据 | 持久化，团队共享 |

**关键区分**：
- **快照 ≠ 版本**：快照 = 纯前端 localStorage undo/redo 检查点；版本 = 后端持久化的单文件内容归档
- **保存 ≠ 升版**：保存（PUT）只写磁盘工作文件，不自动创建版本；升版由用户手动触发
- **4 个文件各自为政**：每个文件（rule.json / pagedata.json / script.js / style.css）独立版本号，互不影响
- **恢复快照 ≠ 恢复版本**：恢复快照仅改变编辑器文本（需手动保存）；恢复后端版本用版本内容覆盖工作文件

---

## 2. 当前架构全景

### 2.1 数据流图

```
┌─────────────── 前端（浏览器） ───────────────┐
│                                               │
│  editFiles[4]  ←→  文本编辑器                  │
│       ↓ 编辑                                   │
│  commitLocalPageDataHistory()   ← 5s 间隔防抖   │
│       ↓                                        │
│  localStorage                                  │
│  (ring buffer, max 20/100 entries)             │
│       ↕                                        │
│  pageDataHistory[]  ← undo/redo 导航           │
│                                               │
│  ──── 保存（PUT）────                           │
│  savePageFile()                                │
│       ↓ HTTP PUT（写入单文件到磁盘）             │
│                                               │
│  ──── 手动升版（POST）────                      │
│  createFileVersion()                           │
│       ↓ HTTP POST（创建版本快照）                │
└───────────────────────────────────────────────┘
                    ↓
┌─────────────── 后端（Java + H2） ─────────────┐
│                                               │
│  writeFile()                                   │
│       ↓                                        │
│  1. 写入当前文件到磁盘（覆盖工作文件）           │
│  2. sseService.broadcast(pageId, filename)     │
│  3. 返回 { ok }（无版本号）                     │
│                                               │
│  createFileVersion()                           │
│       ↓                                        │
│  1. 读取当前工作文件内容                         │
│  2. maxVersion + 1 → 新版本号                   │
│  3. 写入 {version}__{filename} 到磁盘           │
│  4. 写入 file_version 记录到 H2 DB             │
│  5. 返回 { version, isCurrent, createdAt }     │
│                                               │
└───────────────────────────────────────────────┘
```

### 2.2 前端状态变量

| 变量 | 类型 | 说明 |
|------|------|------|
| `editFiles` | `reactive<Record<string, string>>` | 4 个文件的当前编辑文本 |
| `savedFiles` | `reactive<Record<string, string>>` | 上次成功保存的文本（用于 dirty 比对） |
| `fileDirty` | `reactive<Record<string, boolean>>` | 按文件维度的脏标记 |
| `pageDataHistory` | `ref<DataSetHistoryEntry[]>` | pagedata.json 本地快照列表（来自 localStorage） |
| `pageDataHistoryBaseIndex` | `ref<number>` | 回退时记录分支点 |
| `pageDataHistoryDraft` | `ref<string \| null>` | 回退时暂存当前草稿 |
| `pageDataBackendVersion` | `ref<number \| null>` | 当前后端版本号（UI 展示 "后端版 vN"） |
| `fileTextHistory[file]` | `reactive<Record<PageFileName, string[]>>` | rule.json / script.js / style.css 本地快照 |
| `fileTextHistoryCursor[file]` | `reactive<Record<PageFileName, number>>` | 各文件当前 undo 光标 |
| `fileTextHistoryDraft[file]` | `reactive<Record<PageFileName, string \| null>>` | 回退时暂存草稿 |

**常量**：

| 常量 | 值 | 说明 |
|------|---|------|
| `PAGE_DATA_SNAPSHOT_LIMIT` | 20 | pagedata.json 最大本地快照数 |
| `FILE_TEXT_SNAPSHOT_LIMIT` | 100 | 其他文件最大本地快照数 |
| `LOCAL_SNAPSHOT_MIN_INTERVAL_MS` | 5000 | 两次快照最小间隔（ms） |

### 2.2.1 快照与 Undo/Redo（纯前端）

快照是本地 undo/redo 的**唯一数据源**，纯前端机制，后端完全不感知。4 个文件的 undo/redo **逻辑完全一致**：

```
编辑 → 满足 5s 防抖 → commit 快照（文本） → 追加到 localStorage 时间线
                                                    ↕
                                              Undo / Redo 导航
```

每个文件独立维护一条快照时间线，互不干扰。

#### 实现参数

| 参数 | pagedata.json | rule.json / script.js / style.css |
|------|--------------|-----------------------------------|
| 容量上限 | 20 条 | 100 条/文件 |
| 存储 | localStorage（ring buffer） | localStorage |
| 比对前规范化 | `canonicalizePageDataJson`（消除 JSON 格式差异） | 原始文本直接比对 |

> pagedata.json 额外做规范化是因为同一份数据的 JSON 序列化可能格式不同（字段顺序、缩进），规范化后比对可避免产生无意义快照。

#### 导航状态机（4 个文件逻辑一致）

```
时间线：  [#1]  [#2]  [#3]  [#4]  ← pageDataHistory[]（index 0 = 最新）
                              ↑
                         baseIndex = 0（初始指向最新条目）
```

**关键状态变量**：

| 变量 | 作用 |
|------|------|
| `pageDataHistory[]` | 快照列表（index 0 = 最新，ring buffer） |
| `pageDataHistoryBaseIndex` | 当前"锚点"——上次 commit 或 undo/redo 落脚的 history index |
| `pageDataHistoryDraft` | 当用户从未保存的编辑文本 undo 时，暂存该文本（redo 可返回） |

**Undo 流程** (`goPageDataHistoryBack`)：

```
编辑器当前文本 = "用户正在编辑的内容（不在 history 中）"
                                          ↑ 当前位置
  [#1]  [#2]  [#3]  [#4]

Step 1: activeIndex = 在 history 中查找当前文本的匹配 → -1（不匹配任何条目）
Step 2: 当前文本不在 history → 暂存到 pageDataHistoryDraft
Step 3: baseIndex 移到目标条目（最近的 #4 / index 0）
Step 4: 编辑器文本替换为 #4 的内容
```

```
继续 Undo：编辑器当前 = #4 的内容
                             ↑
  [#1]  [#2]  [#3]  [#4]

Step 1: activeIndex = 0（匹配 #4）
Step 2: 已在 history 中，不更新 draft
Step 3: baseIndex 移到 index 1（#3）
Step 4: 编辑器文本替换为 #3 的内容
```

**Redo 流程** (`goPageDataHistoryForward`)：

```
编辑器当前 = #3 的内容，draft 中暂存着"用户正在编辑的内容"
            ↑
  [#1]  [#2]  [#3]  [#4]

情况 A: activeIndex < baseIndex → 前进到 activeIndex + 1 的 history 条目
情况 B: activeIndex == baseIndex && draft 存在 → 恢复 draft 文本（回到编辑状态）
情况 C: 已在最新且无 draft → 不可 redo
```

**核心规则**：
1. **Undo/Redo 只改变编辑器文本，不触发保存**——用户看到 `fileDirty = true`，需手动保存
2. **Draft 保护机制**——从未提交的编辑文本 undo 后，redo 能精确返回该文本
3. **4 个文件机制完全相同**，仅状态变量名不同（pagedata 用 `baseIndex` + `draft`，其他文件用 `cursor` + `draft`）

### 2.2.2 版本（前端触发，后端管理）

版本是持久化的全套页面文件归档，前端触发保存 → 后端升版。

```
前端"保存"
  ↓ HTTP PUT/POST（发送 4 个文件中有变更的）
后端 writeFile() / writeBatch()
  ├─ 1. 写入文件到磁盘（始终覆盖当前版文件，如 {pageId}/rule.json）
  ├─ 2. currentVersion + 1
  ├─ 3. archivePageVersion → 读磁盘全部 4 文件 → 写入 __versions/{N}.json
  ├─ 4. 更新 __page-meta.json
  └─ 5. SSE 广播
  ↓
返回 { ok, currentVersion }
  ↓
前端更新 pageDataBackendVersion（UI 展示 "后端版 vN"）
```

**关键特征**：
- **磁盘始终是当前版**——修改直接覆盖 `{pageId}/rule.json` 等文件，不写临时文件
- **归档是全量快照**——`__versions/{N}.json` 包含该版本全部 4 文件完整内容
- **版本号单调递增**——后端分配，前端只读展示
- **恢复版本 = 创建新版**——从 v2 恢复 v1 → 产生 v3（标记 `restoredFromVersion: 1`），v1 原文不变

#### 快照 Commit 条件

```
commitLocalPageDataHistory(canonicalPageData, summary)
  ├─ 检查 1: canonicalText 不为空
  ├─ 检查 2: 与最新快照内容不同（规范化后比对）
  ├─ 检查 3: 距上次快照 ≥ 5000ms
  └─ 通过 → 写入 localStorage, refreshPageDataHistory()

commitFileTextHistory(name, text)          // rule.json / script.js / style.css
  ├─ 检查 1: name ≠ 'pagedata.json'（pagedata 走上面的管道）
  ├─ 检查 2: 与当前 cursor 位置内容不同
  ├─ 检查 3: 距上次快照 ≥ 5000ms
  └─ 通过 → 截断 cursor 后面的条目（分支丢弃），追加新条目
```

> **注意**：保存操作（`savePageFiles`）**不** commit 快照——它只做 `refreshPageDataHistory()`（重新从 localStorage 读取列表）。这是测试锁定的行为。

### 2.3 后端数据模型

**FileVersionEntity（H2 `file_version` 表）**：

```java
@Entity
@Table(name = "file_version",
       uniqueConstraints = @UniqueConstraint(
           columnNames = {"tenant_id", "project_id", "page_id", "filename", "version"}))
public class FileVersionEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String tenantId;
    private String projectId;
    private String pageId;
    private String filename;     // rule.json / pagedata.json / script.js / style.css
    private int version;         // 从 1 开始单调递增（每文件独立）
    private boolean isCurrent;   // 最新版标记
    private String modifiedBy;   // 修改人（可选）
    private Instant createdAt;   // @PrePersist 自动设置
}
```

**磁盘布局**：

```
data/pages-config/{tenantId}/{projectId}/
├── routes.json                          # 路由配置（无版本管理）
├── {pageId}/
│   ├── rule.json                        # 工作文件（v0，当前编辑内容）
│   ├── pagedata.json
│   ├── script.js
│   ├── style.css
│   ├── 1__rule.json                     # v1 版本快照
│   ├── 2__rule.json                     # v2 版本快照
│   ├── 1__pagedata.json                 # v1（与 rule.json 的 v1 无关联）
│   └── ...
```

- **v0** = 工作文件（裸文件名，无版本前缀），始终是当前编辑内容
- **v1+** = `{version}__{filename}`（扁平命名，与工作文件同目录）
- **每个文件独立版本序列**——`rule.json` 可能有 v1~v5，同时 `pagedata.json` 只有 v1~v2

### 2.4 后端 REST API

| Method | Path | 说明 |
|--------|------|------|
| `PUT` | `/{pageId}/{filename}` | 写入工作文件（只写磁盘，不升版） |
| `GET` | `/{pageId}/{filename}` | 读取工作文件 |
| `POST` | `/{pageId}/{filename}/__versions` | 创建版本快照（读取当前工作文件 → 归档） |
| `GET` | `/{pageId}/{filename}/__versions` | 查询某文件的版本列表（倒序） |
| `GET` | `/{pageId}/__versions` | 查询页面全部文件的版本列表 |
| `GET` | `/{pageId}/{filename}/__versions/{v}` | 读取指定版本内容 |
| `POST` | `/{pageId}/{filename}/__versions/{v}/__restore` | 恢复 → 用版本内容覆盖工作文件 |
| `DELETE` | `/{pageId}/{filename}/__versions/{v}` | 删除版本（禁止删除 isCurrent） |
| `POST` | `/{pageId}/{filename}/__versions/__prune` | 保留最近 N 个版本（body: `{ keepCount }` |

> 所有路径均支持 `/api/tenants/{t}/projects/{p}/pages-config/` 和 `/api/pages-config/` 两种前缀。

### 2.5 版本号规则

```
版本号 = 每文件独立的单调递增整数，从 1 开始
    手动创建版本 → maxVersion(该文件) + 1
    恢复版本 → 用版本内容覆盖工作文件（不创建新版本号）
    写入文件（PUT）→ 不递增（只写磁盘）
    创建页面 → 无版本（v0 = 空白脚手架）
```

| 操作 | 版本变化 |
|------|----------|
| 创建页面 | 无版本（工作文件就是全部） |
| PUT 写入文件 | 不变（只写磁盘） |
| POST 创建版本 | N → N+1（该文件） |
| 恢复版本 | 不变（覆盖工作文件） |
| 删除版本 | isCurrent 重新指派或清空 |
| 修剪版本 | 保留最近 N 个，删除旧版 |

### 2.6 后端测试覆盖（14 个测试）

| 测试 | 覆盖场景 |
|------|----------|
| `createPage_createsDirectoryAndFiles` | 创建页面脚手架 |
| `writeFile_createsFileOnDisk` | PUT 写入不升版 |
| `readFile_returnsContent` | 读取工作文件内容 |
| `createFileVersion_returnsVersion1` | 首次创建版本 → v1 |
| `createFileVersion_incrementsVersion` | 连续创建 → v1, v2 |
| `readFileVersionContent_returnsArchivedContent` | 读取版本快照内容 |
| `restoreFileVersion_overwritesWorkingFile` | 恢复版本覆盖工作文件 |
| `deleteFileVersion_removesFromDbAndDisk` | 删除版本 |
| `deleteFileVersion_rejectsCurrent` | 禁止删除当前版本 |
| `pruneFileVersions_keepsLatestN` | 修剪保留最近 N 个 |
| `listPageFileVersions_returnsAllFiles` | 查询页面全部文件版本 |
| `syncStaticRoutes_writesRoutesJson` | 同步路由配置 |
| `checkPagesHealth_reportsStatus` | 健康检查 |
| `deletePage_removesDirectoryAndDbRecords` | 删除页面+DB清理 |

---

## 3. 设计决策记录

### D1: 文件级独立版本（而非页面级整体版本）

**决策**：每个文件（rule.json / pagedata.json / script.js / style.css）独立管理版本号，互不关联。

**理由**：
- 4 个文件编辑频率差异大（pagedata.json 频繁改动，style.css 很少改）
- 页面级整体版本导致改一个文件升全部文件的版本，产生大量无意义归档
- 文件级版本更符合"配置即代码"的语义——每个配置文件是独立的关注点

### D2: 手动升版（而非保存时自动升版）

**决策**：PUT 写入只覆盖磁盘工作文件，不自动创建版本。版本由用户通过 POST 显式创建。

**理由**：
- 自动升版在频繁保存场景下产生大量噪音版本
- 手动升版让用户在有意义的检查点创建版本（如"完成表单布局"、"修复计算列"）
- 减少磁盘 I/O 和 DB 写入

### D3: H2 DB（元数据）+ 文件系统（内容）

**决策**：版本元数据（版本号、isCurrent、创建时间）存 H2 嵌入式数据库；版本内容存磁盘文件。

**理由**：
- 元数据查询需要排序、过滤、聚合——DB 天然支持
- 文件内容可能很大——存 DB 会增加数据库体积和备份成本
- H2 嵌入式无需额外运维，`ddl-auto: update` 自动建表
- 文件内容 git-tracked，版本快照可选择性 gitignore

### D4: 扁平磁盘命名 `{version}__{filename}`

**决策**：版本快照与工作文件同目录，用 `{version}__{filename}` 命名。

**理由**：
- 无需创建 `__versions/` 子目录
- 文件系统一目了然，调试友好
- `__` 双下划线不会与任何合法文件名冲突

### D5: 恢复版本 = 覆盖工作文件（而非创建新版本号）

**决策**：恢复操作用版本内容覆盖工作文件，不自动创建新版本。

**理由**：
- 用户恢复后可能还要继续编辑，不需要立即产生一个新版本
- 如果恢复后满意，用户可以手动创建版本留存
- 避免"恢复→自动升版→再恢复→再升版"的版本膨胀

---

## 4. 前后端职责边界

| 职责 | 前端 | 后端 |
|------|------|------|
| 版本号分配 | ❌ 只读展示 | ✅ maxVersion + 1 |
| 版本创建时机 | ✅ 用户手动触发 | ✅ 接收请求创建 |
| 版本列表 | 调用 API 展示 | ✅ DB 查询 |
| 版本恢复 | 调用 API + 刷新编辑器 | ✅ 覆盖工作文件 |
| 版本删除/修剪 | 调用 API + 确认 | ✅ 删除文件 + DB 记录 |
| 文件保存 | HTTP PUT | ✅ 写磁盘 + SSE 广播 |
| 本地快照管理 | ✅ 完整控制 | ❌ 不感知 |
| Undo/Redo | ✅ 本地快照导航 | ❌ |

---

## 5. 迁移说明

### 从旧架构迁移

旧架构使用以下已废弃的概念：

| 旧概念 | 状态 | 替代方案 |
|--------|------|----------|
| `__page-meta.json` | **已删除** | H2 DB `file_version` 表 |
| `__project-meta.json` | **已删除** | 无（routes.json 无版本管理） |
| `__versions/{v}.json` | **已删除** | `{version}__{filename}` 扁平命名 |
| `writeBatch()` / `__batch` | **已删除** | 逐文件 `PUT` |
| `archivePageVersion()` | **已删除** | `createFileVersion()` 按文件归档 |
| `X-Expected-Version` 乐观锁 | **已删除** | 未来按需重新设计 |
| `currentVersion`（页面级） | **已删除** | 每文件独立 `isCurrent` |
| `restoredFromVersion` 标记 | **已删除** | 恢复 = 覆盖工作文件，无额外标记 |

### 数据迁移

旧架构的 `__page-meta.json`、`__project-meta.json`、`__versions/` 目录在升级后不再使用。可手动清理或保留（不影响新架构运行）。H2 数据库 `ddl-auto: update` 会自动创建 `file_version` 表。
