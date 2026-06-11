# AI 生成模型规范（AI_MODEL_SPEC）

> AI 要读写的 **business class** 长什么样。目录、命名、导出见 `docs/ai/ai-code-generation-behavior.md`。

**只有一套模型。** 凡 AI 可编辑的业务态，一律 `extends SparkAIModel` + 公开字段 + 属性链寻址；**禁止**再分「项目域 / 快照域」或并行 `fromJson` 编辑栈。

---

## 1. 协议基类

凡 AI 要改数据的 class → **`extends SparkAIModel`**（`packages/spark-utils/src/ai-model.ts`）。

```typescript
export abstract class SparkAIModel {
  constructor(_options: Record<string, unknown>) { void _options }
  abstract toJson(): Record<string, unknown>
  abstract validate(): void  // 结束编辑依据；失败 throw
}
```

协议强制 **`toJson`** 与 **`validate`**：

- **`validate()`**：结束一轮编辑的前置条件；通过则无返回值，失败 `throw`。
- **`save()`** 前须能通过 `validate()`（实现上 `save` 应自动调用）。
- AI / UI：编辑中随意改字段；**认为编辑完成**时先 `validate()`，再 `save` 或交下一流程。

这是 **AI 编辑协议**，不是 DDD 领域基类。

---

## 2. 子类

```typescript
export class 某模型 extends SparkAIModel {
  constructor(options: { /* 结构化 object，不用 JSON string */ }) {
    super(options)
  }

  // 公开字段（标量 + 子模型引用）
  title: string
  items: 行模型[]
  leaf: 叶子模型 | null

  toJson(): Record<string, unknown> { /* ... */ }
  validate(): void { /* ... */ }  // 结束编辑依据
  // 按需：save()、static load()、subscribe …
}
```

### 字段

| 类型 | 例子 |
|------|------|
| 标量 | `title`、`parentId`、`dirty`、`ruleJson`（文件原文 string） |
| 子模型 | `leaf: 叶子 \| null`、`items: 行[]` — **class 实例**，不是 plain object |

- 树 = **`items[]` + `parentId`**，不用嵌套 `children` 当真源。
- 页面四文件（`rule.json` / `pagedata.json` / `script.js` / `style.css`）= **`PageConfigModel` 上的 string 字段**，不是独立的节点树 / DataSet 模型。
- AI / Vue **同一实例**，写字段或调 API；不要 draft、不要 projection DTO。
- 根模型可加过程态（`selectedId`、`dirty`）+ `subscribe`；AI 无事件，靠字段/API 读。
- **LLM 投影**：公开字段 + public 方法 + JSDoc **直接取**（见 §4）。

### 寻址（不靠 script 路径）

模型 **已具备寻址能力**：公开字段 + 子模型引用 + 集合下标，**不必**依赖 `vcm_script` 或 path 路径串作为唯一入口。

```typescript
// 标量
project.name
row.title

// 集合下标 → 子模型
project.navigationNodes[0]
project.navigationNodes[i].pageConfig

// 链式到达叶子字段（含四文件原文）
project.navigationNodes[i].pageConfig!.ruleJson
project.navigationNodes[i].pageConfig!.pageDataJson
project.navigationNodes[i].pageConfig!.script   // 字段名 script，不是 script 工具
```

| 手段 | 作用 |
|------|------|
| **`this.属性` / `this.属性[i]`** | **主寻址**；读写真源 |
| **子模型字段** | 沿引用链深入 |
| **instance API** | 辅助（查找、集合 CRUD、save）；**不替代**属性寻址 |

VCM / runtime 若提供 script 闭包，只是**可选执行壳**；**语义真源**仍是同一实例上的属性链。

### 禁止

跳过 `SparkAIModel`；每模型一个 interface；IO / UI 进 class；机械多子类。

**禁止第二套 AI 模型（快照栈）：**

| 禁止 | 说明 |
|------|------|
| `DataSet` / `DataTable` / `DataView` / `DataSetCrudTool` 作为 AI 编辑面 | 它们是运行时解析/渲染管线，不是 LLM 另开的模型层 |
| `SparkNodeTree` / `fromRuleJson` / `editNodeTree` 作为 AI 编辑面 | 节点 UI 真源是 `pageConfig.ruleJson` 字符串，不是嵌套节点 class |
| 仅 `toJson` + `static fromJson`、无 `save`/`load` 的「快照类」 | 持久化边界统一走 `save({ … })` / `load({ … })` 或父模型字段赋值后父级 `save` |
| `readXxxProjection()`、独立 snapshot DTO | 与公开字段重复的第二知识面 |
| `@moduleKind`、kind id、`vcm_*_guide({ kind })` | 只用 **className** 索引（§4） |

运行时仍可在 **模型外部** 把 `pageDataJson` parse 成 `DataSet`、把 `ruleJson` parse 成渲染树供 Vue 使用；该 parse **不得**反客为主成为 AI 的编辑入口。

---

## 3. 持久化与序列化

| 方法 | 何时有 | 规则 |
|------|--------|------|
| `toJson()` | **必有**（协议） | 纯 object；子模型递归 `toJson()`；无 `undefined` key |
| `validate()` | **必有**（协议） | 结束编辑依据；失败 `throw`；`save` 前自动调用 |
| `save()` | 有存储边界时 | 只写**本模型**；IO 在方法体内；可为 `async`；依赖经 **options 传入**，不挂公开字段 |
| `static load()` | 同上 | 恢复本模型；`new 子模型` 挂到字段上；可为 `async` |

- 父不替子 save；IO 依赖经 **options 传入**。具体操作流程写在对应模型 **class / 方法 JSDoc**（如 `PageConfigModel`）。
- **`static fromJson()` 不是 AI 模型标准入口**；遗留代码中的 `fromJson` 仅作迁移/内部工具，新模型 **不要** 再靠它充当 load 替代品。

---

## 4. 标准模型 ↔ LLM 知识体系

模型 **class** 是语义真源；VCM 编译产物是 LLM 可读索引；`vcm_script` 是同一实例上的执行壳。三者同构。

**禁止 kind 体系：** 不用 `@moduleKind`、不用 kebab-case kind id、不用与 **className** 平行的第二套索引。知识体系只认 **`SparkAIModel` 子类的 class 名** + **public 字段 TS 类型**。

### 4.1 两层分工

| 层 | 真源 | 作用 |
|----|------|------|
| **模型形态** | `SparkAIModel` 子类源码 | 字段、寻址、validate/save；与 Vue 共实例 |
| **知识编译** | `config/vcm/registry.json` + TS 类型解析 | 把字段类型图投影为 metadata → ClassModel → guide |

进入 LLM 知识库：root **class** 须在 registry 的 `source.files` 扫描面内；子 model 由字段类型引用，须在扫描面内可解析。

**子模型是谁** = 字段类型 `T extends SparkAIModel`（或 `T[]` 的元素类型）。**className 即索引**，无别名层。

```text
SparkAIModel 子类（public 字段 / 方法 / JSDoc）
  → generate:module-metadata（registry：source.files + roots[].className）
  → metadata（按 className 索引各 model class）
  → projectClassModelForGuide（root 起沿子模型字段类型可达的 class 集合；见 §4.2.3）
  → vcm_query / vcm_*_guide（参数 className，非 kind）
  → vcm_script（this = Host 注入的根 model 实例）
```

> 实现收敛中：部分 JSON/工具参数仍含遗留字段名 `kind`；规范目标为 **仅 className**，与源码 class 名一致。

### 4.2 机械对应表

| 标准模型（源码） | 知识索引 | guide / 执行 |
|------------------|----------|--------------|
| `public` 标量字段 | 字段名 + schema | `this.field` / 赋值 |
| `public` 字段 `T` / `T[]`，`T extends SparkAIModel` | 字段名 + **元素/值类型 className** | `this.field` / `this.field[i].…` |
| `public` 方法 | 方法名 + paramsSchema | `await this.save(…)`（辅助） |
| class / 方法 JSDoc | guide 正文 | 操作流程只读 JSDoc |
| `@vcmIgnore` | — | LLM 不可见 |

### 4.2.1 子模型：字段类型即绑定

```typescript
navigationNodes: NavigationRowModel[]
pageConfig: PageConfigModel | null
title: string
```

| 源码 | 知识体系 |
|------|----------|
| `field: T`，`T extends SparkAIModel` | 字段 `field` → 子 model **`T.name`**（如 `PageConfigModel`） |
| `field: T[]` | 同上；`[i]` 只在 script |
| 标量 | 无子 class |

**可达 class** = 从 root class 出发，沿「类型为 SparkAIModel 子类的 public 字段」能走到的 **className 集合**（与 §2 属性链同构）。

编译器：字段类型 `extends SparkAIModel` 才建立子 model 链接（`requireSparkAIModel: true`）。action `resultApis` 遗留 `@moduleKind` 路径待删。

### 4.2.2 registry 与 class 图

| 概念 | 含义 |
|------|------|
| **className** | `ProjectRootModel` 等；**唯一** model 索引 |
| **root** | registry `roots[].className`；遍历起点 |
| **metadata 表** | root 沿字段类型可达的各 SparkAIModel 子 class 的字段/方法/JSDoc |
| **actions** | 不参与字段类型链扩展 |

registry 只声明：**从哪个 root class 编译**、**哪些 `.ts` 在扫描面内**。不逐字段登记别名。

`pageConfig: PageConfigModel | null` → 知识含义：字段 `pageConfig`，类型 **`PageConfigModel`**。

### 4.2.3 可达 class（沿字段类型链）

1. 队列初始：`roots[].className`（如 `ProjectRootModel`）。
2. 弹出当前 class，记入已可达。
3. 枚举 public 字段：类型（nullable/数组解包后）为 SparkAIModel 子 class → 该 **className** 入队。
4. 至队列空。actions / openXxx **不建边**。

```text
Step 0  [ProjectRootModel]     已可达 { ProjectRootModel }
Step 1  navigationNodes: NavigationRowModel[]  → NavigationRowModel
Step 2  已可达 { ProjectRootModel, NavigationRowModel }
        pageConfig: PageConfigModel | null       → PageConfigModel
Step 3  已可达 { …, PageConfigModel }
        ruleJson: string                         → 结束
```

- **`vcm_query`**：列出上述可达 **className**。
- **`vcm_model_guide({ className: 'PageConfigModel' })`**：仅当该 class 在可达集合内。

| 字段类型链 | script |
|------------|--------|
| `navigationNodes: NavigationRowModel[]` | `this.navigationNodes[i]` |
| `pageConfig: PageConfigModel` | `row.pageConfig` |
| `ruleJson: string` | `row.pageConfig.ruleJson = '…'` |

**违规：** 字段类型链上出现 `ConfigPageNode` → `SparkNodeTree` / `DataSetCrudTool` 等 **不在标准栈里的 model class**（§4.4）。

### 4.3 合规知识图（唯一栈）

```text
ProjectRootModel                    ← registry root
  navigationNodes: NavigationRowModel[]
  …

NavigationRowModel                  ← 由 navigationNodes 元素类型关联
  pageConfig: PageConfigModel | null

PageConfigModel                     ← 由 pageConfig 字段类型关联
  ruleJson, pageDataJson, script, style
```

```javascript
const row = this.navigationNodes[i]
row.pageConfig.ruleJson = '[ … ]'
await row.pageConfig.validate()
await row.pageConfig.save({ api: … })
```

合规：guide 只覆盖 **`ProjectRootModel` → `NavigationRowModel` → `PageConfigModel`** 字段类型链；不出现并列 `SparkNodeTree` / `DataSet` 等 model class。

### 4.4 违规形态（一律改）

| 违规 | 标准 |
|------|------|
| `@moduleKind` / kind id / `vcm_*_guide({ kind })` | 只用 **className** |
| 字段链外并列 model class（快照栈） | 仅三层 SparkAIModel 栈 |
| 主路径 action 替代写字段 | 字段 + 辅助 validate/save |
| `readXxxProjection` | 读 public 字段 |
| `flatRows: TNode[]` 且元素非栈内 class | `navigationNodes: NavigationRowModel[]` |

parse 渲染（`ruleJson` → 树）在 model **外**，不注册为 model class。

### 4.5 工具（执行壳）

| 工具 | 作用 |
|------|------|
| `vcm_query` | 可达 **className** 列表（§4.2.3） |
| `vcm_model_guide` | `{ className }` → 该 class 字段 + actions |
| `vcm_attribute_guide` | `{ className, attributeName }` |
| `vcm_action_guide` | 辅助方法 schema |
| `vcm_script` | `this` = 根 model；语句 = §2 属性链 |

### 4.6 分层

```text
AI      →  guide(className) + script 写字段
模型    →  SparkAIModel 子 class + 公开字段
知识编译 →  registry + metadata（className 索引）
IO      →  save/load 内部
UI      →  subscribe；parse 四文件（非 model class）
```

---

## 5. 参考例子（唯一栈）

三层即全部 AI 可编辑面；**无**并列快照域。

```text
项目根（ProjectRootModel）
  projectId, name, tenantId          标量
  navigationNodes: 行[]               子模型集合（扁平行，不是 children 树）
  selectedNodeId, dirty, revision     过程态（根上）
  + find/add/update/remove 导航       API（辅助）
  + subscribe                         UI 刷新

行（NavigationRowModel）
  id, parentId, projectId, tenantId, title, description, nodeKind   标量
  pageConfig: 页配置 | null            可选子模型

页配置（PageConfigModel）— 叶子；四文件 = string 字段
  pageId, ruleJson, pageDataJson, script, style   标量（磁盘原文）
  save({ api }) / load({ pageId, loader })         操作流程见类 JSDoc
```

**从例子归纳：**

| 点 | 模型 | 知识体系（§4） |
|----|------|----------------|
| 协议 | 各层 `extends SparkAIModel` | 可达 set = 字段类型链上的 **className** |
| 字段 | `T extends SparkAIModel` | guide 用 className；子 model 由类型关联 |
| 页面内容 | `PageConfigModel.ruleJson` 等 | 仅 `PageConfigModel`；无并列 model class |
| 寻址 | 属性链 | script 同构 |
| 不要 | 快照栈、projection | **禁止 kind / @moduleKind**、禁止主路径 action 替字段 |

实现：`packages/spark-project-model/src/domain-model/`（子模型绑定见字段类型；进 LLM 须 root 进 registry `source.files`）。

---

## 6. 相关文档

- 代码组织与命名：`docs/ai/ai-code-generation-behavior.md`
- 知识编译（registry、audit、gates）：`docs/ai/VCM_NATIVE_CLASS_SPEC.md`
- ClassModel 投影：`packages/spark-ai/src/vcm-native/class-model/model-projection.ts`
- 协议基类：`packages/spark-utils/src/ai-model.ts`
