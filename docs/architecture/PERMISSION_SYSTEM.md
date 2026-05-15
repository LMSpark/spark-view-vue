# SPARK 权限体系梳理

> 本文档基于当前源码与测试用例整理，描述 SPARK 现阶段的权限模型、运行链路、宿主渲染差异与边界约束。

## 1. 设计目标

SPARK 的权限体系**目标模型**是“后端统一验证，前端按快照渲染”，核心目标不是在前端做二次鉴权，而是把服务端已经计算好的权限结果稳定地映射到 UI。

目标架构遵循以下原则：

1. 权限由后端统一计算并下发，前端不基于角色名、用户 ID 或本地规则再做一套判定。
2. 字段权限按读写双通道解释：读通道只管能不能看、怎么看；写通道只管能不能改。
3. 脱敏值由后端直接返回，前端不再做手机号、身份证、邮箱等本地二次脱敏。
4. 缺少权限快照时默认收紧，而不是默认放行。

当前接入状态（2026-03-29）：

1. 前端字段权限与动作权限的解析/渲染链已经存在，并已被 `spark-component` 消费。
2. 权限渲染与解析 API 现已集中在 `packages/spark-component/src/permission/`；`spark-data` 只保留权限快照类型、权限字段常量和 CRUD 请求期的 token 透传能力。
3. 后端**尚未统一继承**这套权限体系，当前不存在一个已落地的独立“权限服务 API”，也未在通用业务响应里系统性注入 `_perm` / `_modelPerm`。
4. 因此当前运行效果取决于具体数据源是否显式提供权限快照；demo/mock 页可以演示完整权限渲染，但不能等同于后端已经全量接入。

---

## 2. 权限数据模型

权限快照定义位于 `packages/spark-data/src/types.ts`。

这里描述的是**前端消费约定**与目标快照结构，不代表当前后端已经在所有真实接口中统一返回这些字段。

### 2.1 行级权限：`IInstancePermission`

行级权限存放在 `row._perm`：

```ts
interface IInstancePermission {
  allowCreateChild?: boolean
  allowDelete?: boolean
  editableFields?: string[]
  hiddenFields?: string[]
  maskedFields?: string[]
  permissionToken?: string
}
```

说明：`edit` 没有单独的 `allowEdit` 布尔位；当前记录是否允许编辑，统一由 `editableFields` 是否存在、以及目标字段是否命中该列表来推导。

字段含义：

| 字段 | 含义 |
|------|------|
| `allowCreateChild` | 当前记录下是否允许新增子记录 |
| `allowDelete` | 当前记录是否允许删除 |
| `editableFields` | 当前记录中允许编辑的字段列表 |
| `hiddenFields` | 当前记录中完全不可见的字段列表 |
| `maskedFields` | 当前记录中可见但脱敏展示的字段列表 |
| `permissionToken` | 回写给服务端做合法性校验的令牌 |

### 2.2 表级权限：`IModelPermission`

表级权限存放在 `dataSource._modelPerm`：

```ts
interface IModelPermission {
  allowCreate?: boolean
  allowImport?: boolean
  allowExport?: boolean
  permissionToken?: string
}
```

字段含义：

| 字段 | 含义 |
|------|------|
| `allowCreate` | 当前表是否允许新增 |
| `allowImport` | 当前表是否允许导入 |
| `allowExport` | 当前表是否允许导出 |
| `permissionToken` | 回写给服务端做合法性校验的令牌 |

### 2.3 字段读通道枚举：`FieldVisibility`

```ts
enum FieldVisibility {
  Visible = 'visible',
  Masked = 'masked',
  Hidden = 'hidden'
}
```

这三个状态只表达“读通道”结果，不表达能否编辑。

---

## 3. 读写双通道模型

权限体系的关键不是“一个字段只有一个权限状态”，而是“读”和“写”分别计算。

### 3.1 读通道

读通道只回答两个问题：

1. 字段是否可以被展示。
2. 如果能展示，展示的是原值还是后端已经处理过的脱敏值。

读通道状态：

| 状态 | 含义 | 前端行为 |
|------|------|----------|
| `visible` | 完全可见 | 直接展示服务端返回值 |
| `masked` | 部分可见 | 展示服务端返回的脱敏值 |
| `hidden` | 完全不可见 | 不展示读通道内容 |

### 3.2 写通道

写通道只回答一个问题：字段当前是否允许编辑。

写通道状态：

| 状态 | 含义 | 前端行为 |
|------|------|----------|
| `editable` | 可编辑 | 渲染可写控件 |
| `readonly` | 不可编辑 | 渲染禁用控件或只读展示 |

### 3.3 读写解耦的特殊场景

以下组合都是合法的：

| 读通道 | 写通道 | 典型场景 | 说明 |
|--------|--------|----------|------|
| `visible` | `editable` | 普通表单编辑 | 正常显示并允许修改 |
| `visible` | `readonly` | 可看不可改 | 正常显示但不可编辑 |
| `masked` | `editable` | 修改手机号、修改敏感信息 | 可以改，但不能把脱敏值当成输入初值 |
| `hidden` | `editable` | 修改密码、重置密钥 | 可以改，但不能显示读通道值 |
| `hidden` | `readonly` | 完全不可见 | 控件与展示块都应移除 |

**关键约束**：

1. 读通道不能推导写通道。
2. 写通道也不能反推读通道。
3. `(masked || hidden) && editable` 是合法组合，前端必须支持。

---

## 4. 默认语义（缺少权限快照时）

当前实现明确采用“默认收紧”的策略。

### 4.1 模型级动作默认拒绝

当 `_modelPerm` 缺失时：

| 动作 | 默认结果 |
|------|----------|
| `create` | 拒绝 |
| `import` | 拒绝 |
| `export` | 拒绝 |

### 4.2 行级动作默认拒绝

当 `_perm` 缺失时：

| 动作 | 默认结果 |
|------|----------|
| `edit` | 拒绝 |
| `delete` | 拒绝 |
| `create-child` | 拒绝 |

其中 `edit` 的语义需要单独强调：

1. `edit` 不是独立的行级布尔权限。
2. `edit` 是否成立，取决于当前记录的 `editableFields`。
3. 若 `editableFields` 缺失或为空，则 `edit` 默认拒绝。

### 4.3 字段默认“可见但只读”

当 `_perm` 缺失时：

| 字段行为 | 默认结果 |
|----------|----------|
| 读通道 | `visible` |
| 写通道 | `readonly` |

这意味着：

1. 字段仍然可以展示。
2. 但如果没有显式 `editableFields`，前端不能把它当作可写字段。

---

## 5. 模块职责拆分

权限相关实现主要集中在下表：

| 模块 | 位置 | 作用 | 关键点 |
|------|------|------|--------|
| `PermissionChecker` | `packages/spark-component/src/permission/PermissionChecker.ts` | 最基础的模型级、行级、字段级判断 | `create/import/export` 需要显式 `true`；`edit` 由 `editableFields` 推导；`hiddenFields` 优先于 `maskedFields` |
| `FieldRenderHelper` | `packages/spark-component/src/permission/FieldRenderHelper.ts` | 计算字段级 `IFieldRenderState` | 把字段状态整理为 `readable / editable / visibility / shouldRender` |
| `PermissionResolver` | `packages/spark-component/src/permission/PermissionResolver.ts` | 对外统一入口 | 暴露 `isPermittedAction()`、`resolveFieldPermissionState()`、`formatPermissionAwareFieldValue()` |
| `PermissionFilter` | `packages/spark-component/src/permission/PermissionFilter.ts` | 展示层批量过滤 | `hidden` 字段移除、`masked` 原样保留；它不是安全边界 |
| `useFieldPermission` | `packages/spark-component/src/components/fields/context/useFieldPermission.ts` | 把权限结果桥接到字段组件 | `r-form` 下 `readable || editable` 即可渲染；`editable + masked/hidden` 时清空初始值 |
| `FieldContextRenderer` | `packages/spark-component/src/components/fields/non-data-components/FieldContextRenderer.vue` | 按宿主落地渲染 | `r-form`、`r-table`、`r-detail`、`r-list`、`r-tree` 的可见策略在这里分流 |
| `action-permission` | `packages/spark-component/src/components/containers/action-permission.ts` | 容器动作过滤 | `create/import/export` 走模型级，`edit/delete` 走行级，`create-child` 语义上涉及双层 |

关系可以概括为：`PermissionChecker` 提供基础判断，`PermissionResolver` / `PermissionFilter` 提供统一入口，`useFieldPermission`、`FieldContextRenderer`、`action-permission` 把结果落到具体 UI。

---

## 6. 运行时链路

### 6.1 目标链路（后端统一接入后）

下图描述的是后端统一继承权限体系后的目标运行链路；当前仓库中的前端部分已具备消费能力，但后端尚未全量接入：

```text
后端响应
  -> 数据行携带 row._perm
  -> DataView / IDataSource 携带 _modelPerm
  -> PermissionResolver / FieldRenderHelper 统一计算字段与动作状态
  -> useFieldPermission / action-permission 分别桥接到字段与容器
  -> FieldContextRenderer / 容器动作区按宿主规则渲染 UI
```

### 6.2 零代码字段权限链路

当数据行携带 `_perm`（`editableFields` / `hiddenFields` / `maskedFields`）时，内置字段组件（`r-text`、`r-number`、`r-select` 等）**自动**根据权限快照控制可见/可编辑/脱敏，无需在 `script.js` 或 `onBeforeRender` 中写任何判断代码。

完整自动流程：

```text
后端/业务脚本写入 row._perm
  ↓
DataView（IDataSource）持有行数据
  ↓
容器组件（r-table / r-form / r-detail）provide(DATA_SOURCE, dataView)
  ↓
字段组件 consume(DATA_SOURCE) → 取到当前行 currentRow
  ↓
useFieldPermission（自动调用链）
  ├─ PermissionChecker.getFieldVisibility(field, row)
  │    → hiddenFields 命中 → Hidden
  │    → maskedFields 命中 → Masked
  │    → 否则 → Visible
  ├─ PermissionChecker.isFieldEditable(field, row)
  │    → editableFields 包含 field → true
  │    → 否则 → false（默认收紧）
  └─ 综合判定：
       shouldRenderCurrentField
         r-form: readable || editable（密码修改场景可渲染）
         其他宿主: readable
       fieldValue
         r-form 且 editable 且 masked/hidden: 清空初始值（不回显脱敏值）
  ↓
FieldContextRenderer / 具体字段组件按宿主规则渲染
```

**零代码配置示例**：

只要 `pagedata.json` 中的数据行包含 `_perm`，rule.json 中的 `r-form` / `r-table` 字段组件就自动生效：

```jsonc
// pagedata.json（或业务脚本写入 DataView 的数据）
{
  "id": 1, "name": "张三", "phone": "138****1234", "department": "销售部",
  "_perm": {
    "editableFields": ["name", "phone"],   // name、phone 可编辑
    "hiddenFields": ["department"],         // department 隐藏
    "maskedFields": ["phone"]              // phone 脱敏展示
  }
}
```

```jsonc
// rule.json — 无需任何权限判断代码
{
  "type": "r-form",
  "props": { "viewKey": "Users@default" },
  "children": [
    { "type": "r-text", "field": "name",       "props": { "label": "姓名" } },
    { "type": "r-text", "field": "phone",      "props": { "label": "手机" } },
    { "type": "r-text", "field": "department", "props": { "label": "部门" } }
  ]
}
```

效果：
- `name` → 可见 + 可编辑
- `phone` → 脱敏展示（`r-table`/`r-detail` 中显示 `138****1234`）；`r-form` 中可编辑，但初始值清空
- `department` → `r-form` 中不渲染；`r-table` 中单元格内容不显示

### 6.3 零代码动作权限链路（permAction）

除了字段权限，**动作权限**（新增/删除/编辑/导入/导出）也有完整的零代码链。核心机制是 `permAction` 属性。

#### 6.3.1 `permAction` 声明式权限过滤

在 `rule.json` 中为 `builtin-action` 节点声明 `permAction`，容器自动根据 `_modelPerm` / `row._perm` 决定动作的显示/隐藏：

```jsonc
// rule.json
{
  "type": "r-table",
  "props": { "viewKey": "Users@default" },
  "children": [
    // ── 工具栏：模型级动作 ──
    {
      "type": "r-toolbar", "props": { "position": "top" },
      "children": [
        {
          "type": "builtin-action",
          "props": {
            "builtinAction": "append-row", "label": "新增",
            "permAction": "create"          // ← _modelPerm.allowCreate 控制
          }
        }
      ]
    },
    // ── 行操作：行级动作 ──
    {
      "type": "r-toolbar",
      "children": [
        {
          "type": "builtin-action",
          "props": {
            "builtinAction": "prompt-edit", "label": "编辑",
            "permAction": "edit"            // ← row._perm.editableFields 控制
          }
        },
        {
          "type": "builtin-action",
          "props": {
            "builtinAction": "delete-row", "label": "删除",
            "permAction": "delete"          // ← row._perm.allowDelete 控制
          }
        }
      ]
    }
  ]
}
```

**不写 `permAction` 时**，动作不受权限过滤，始终显示（如 `refresh` 按钮无需权限控制）。

#### 6.3.2 容器权限管道完整流程

容器组件（`r-table` / `r-form` / `r-tree`）内部通过 `useContainerActions` 对每个动作节点执行以下管道：

```text
动作节点（SparkNode）
  ↓
① 仅 builtin-action：resolveNodeBeforeRender()
   │ 执行 onBeforeRender 回调（若有），可返回 visible/disabled 补丁
   │ 返回不可见 → 直接过滤，后续步骤跳过
   ↓
② isActionDisplayed(action)
   │ 检查 action.display !== false
   ↓
③ isModelActionAllowed(action, modelPerm)
   │ 读取 permAction → 属于模型级（create/import/export/create-child）？
   │ → isPermittedAction(permAction, { modelPermission }) 检查
   │ → 非模型级动作直接通过
   ↓
④ isRowActionAllowed(action, row)
   │ 读取 permAction → 属于行级（edit/delete/create-child）？
   │ → isPermittedAction(permAction, { row }) 检查
   │ → 非行级动作直接通过
   ↓
⑤ 通过全部检查 → 注入 scoped props（row/index）→ 渲染动作按钮
```

**关键细节**：

1. `onBeforeRender` 回调**仅对 `builtin-action` 类型节点执行**，非内置动作跳过步骤 ①。
2. `create-child` **同时属于模型级和行级**，步骤 ③④ 都会检查。
3. `modelPermission` 来源于 `useContainerDataSource` 中 `resolvedDataSource._modelPerm`。

#### 6.3.3 `permAction` 可用值与分派规则

| `permAction` 值 | 权限层级 | 检查逻辑 | 所需快照 |
|------------------|----------|----------|----------|
| `"create"` | 模型级 | `_modelPerm.allowCreate === true` | `_modelPerm` |
| `"import"` | 模型级 | `_modelPerm.allowImport === true` | `_modelPerm` |
| `"export"` | 模型级 | `_modelPerm.allowExport === true` | `_modelPerm` |
| `"edit"` | 行级 | `row._perm.editableFields.length > 0` | `row._perm` |
| `"delete"` | 行级 | `row._perm.allowDelete === true` | `row._perm` |
| `"create-child"` | 双层 | `canCreate(modelPerm) AND canCreateChild(row)` | 两者 |
| 其他字符串 | — | 不过滤，始终通过 | — |
| 不写 / `undefined` | — | 不过滤，始终通过 | — |

**`isPermittedAction` 的 context 语义**：

`isPermittedAction(action, context)` 使用 `Object.prototype.hasOwnProperty` 检测 context 对象是否拥有 `modelPermission` / `row` 属性。这意味着：

```ts
// context 没有 modelPermission 属性 → 模型级检查跳过（默认 true）
isPermittedAction('create-child', { row })

// context 拥有 modelPermission 属性，值为 undefined → 进入 canCreate(undefined) → false
isPermittedAction('create-child', { modelPermission: undefined, row })
```

容器管道中 `isModelActionAllowed` 只传 `{ modelPermission }`，`isRowActionAllowed` 只传 `{ row }`，各自只验证自己负责的层级。

### 6.4 渲染前属性拦截：`onBeforeRender`

`onBeforeRender` 的落点很直接：**显隐、禁用等控制本质上都是组件 `props` 的值**。在 SparkComponentRenderer 渲染任意 SparkNode 之前，`onBeforeRender` 根据运行时上下文（包括后端返回的权限数据）计算这些 `props`，再把结果合并回节点。

它的本质是：**后端返回权限快照 → 前端在 `onBeforeRender` 中调用 permission API 做同步计算 → 直接设置 `props.visible`、`props.disabled` 等值控制渲染结果**。

适用于所有已注册的 SparkNode 组件：数据容器、按钮、布局组件、字段组件，以及显式注册到 SPARK registry 的扩展组件——只要经 `SparkComponentRenderer` 渲染的 SparkNode 均可声明。

#### 6.4.1 两条执行路径

| 路径 | 执行者 | 适用范围 | 额外行为 |
|------|--------|---------|----------|
| **通用路径** | `SparkComponentRenderer` | **所有** SparkNode | 计算 `propsPatch`，把 `visible` / `disabled` 等字段合入节点 props |
| **容器增强路径** | `useContainerActions` | 仅 `builtin-action` 节点 | 逐行作用域解析 + `disabled` 自动镜像为 `buttonDisabled` |

- **通用路径**：每个 SparkNode 渲染时，SparkComponentRenderer 内部以 `computed` 调用 `resolveNodeBeforeRender()`，无条件执行。`onBeforeRender` 自身不会透传到目标组件（已列入 `FILTERED_PROP_KEYS`）。
- **容器增强路径**：数据容器（r-table / r-tree）在组装行操作列表时，额外对 `builtin-action` 执行一次 `resolveNodeBeforeRender()`，注入当前行的 `row` / `index` / `dataSource` / `modelPermission`。

> **两条路径不冲突**：对 `builtin-action`，容器增强路径先执行（步骤 ①），之后再走 `permAction` 三重检查（步骤 ②③④）。通用路径在 SparkComponentRenderer 层面另外执行一次，但已通过 `$beforeRenderResolved` 幂等标记避免重复执行。

#### 6.4.2 适用场景

`onBeforeRender` 不只是"permAction 不够用时的补充"，它本质上就是一个**运行时 props 计算器**：

| 场景 | 示例 |
|------|------|
| **布局组件权限控制** | 整个 `el-card` / `el-tabs-pane` 根据权限快照隐藏 |
| **按钮业务条件禁用** | 订单状态为"已完成"时禁用"编辑"按钮 |
| **第三方字段组件桥接** | 非内置字段组件需手动读取 `_perm` 设置 `disabled` |

**与零代码链的关系**：

- 数据容器标准按钮（`builtin-action` + `permAction`）→ 零代码自动过滤，**无需** `onBeforeRender`
- 内置字段组件（`r-text`、`r-number` 等）→ 零代码自动消费 `_perm`，**无需** `onBeforeRender`
- 以上覆盖不了的场景 → 用 `onBeforeRender` 读取后端权限数据，直接设置 `props.visible` / `props.disabled` 等属性值

#### 6.4.3 `permission` API 获取方式

TypeScript 中直接 import；`script.js` 沙箱中已直接注入 `permission` 命名空间，无需 import。

`onBeforeRender` 最常用的只有下面几组 API：

| API | 用途 |
|-----|------|
| `isPermittedAction(action, { modelPermission?, row? })` | 统一动作权限判断 |
| `checkPermission.canCreate(modelPerm)` | 模型级新建判断 |
| `checkPermission.canDelete(row)` | 行级删除判断 |
| `checkPermission.canEdit(row)` | 行级编辑判断 |
| `checkPermission.isFieldVisible(field, row)` | 字段是否可见 |
| `checkPermission.isFieldEditable(field, row)` | 字段是否可编辑 |
| `resolveFieldPermissionState(field, row)` | 一次拿到字段的 readable / editable / visibility |

示例：

```javascript
return {
  visible: permission.checkPermission.canCreate(ctx.modelPermission),
  disabled: !permission.checkPermission.canEdit(ctx.row ?? null)
}
```

`canImport` / `canExport` 可直接用 `isPermittedAction('import', { modelPermission })`、`isPermittedAction('export', { modelPermission })`。

#### 6.4.4 运行约束

定义于 `packages/spark-component/src/components/support/beforeRender.ts`。

1. handler 写在 `node.props.onBeforeRender` 上。
2. **必须同步返回**；`Promise` / `async` 会被忽略并警告。
3. `rule.json` 中写字符串函数名，`normalizeOnProps()` 自动包装为对 `script.js` 同名函数的调用。
4. 对所有组件类型生效（通用路径）；在容器动作管道中，`builtin-action` 额外走增强路径。

`BeforeRenderContext` 可用字段：

| 字段 | 类型 | 含义 |
|------|------|------|
| `id` | `string \| undefined` | 当前节点 id |
| `type` | `string` | 当前节点类型 |
| `props` | `Record<string, unknown>` | 当前节点业务 props（已去掉 `onBeforeRender` 自身） |
| `children` | `SparkNodeChildren` | 当前节点 children |
| `row` | `IDataRow \| null` | 当前行作用域（通用路径来自父能力链，增强路径来自容器逐行作用域） |
| `data` | `unknown` | 作用域数据，优先取 `scopedProps['data']`，否则退回 `row` |
| `index` | `number` | 行索引或作用域索引 |
| `dataSource` | `IDataSource \| null` | 当前节点可见的数据源（DataView） |
| `modelPermission` | `IModelPermission \| undefined` | `dataSource._modelPerm` |

#### 6.4.5 返回值语义

| 返回值 | 实际行为 |
|--------|----------|
| `false` | 节点不渲染（写入 `{ visible: false }` 到 propsPatch） |
| `true` | 节点渲染（写入 `{ visible: true }` 到 propsPatch） |
| 对象 | 直接当作 props 补丁；其中 `visible`（或备选 `display`）控制显隐，`disabled` 等字段按普通 props 合并 |

**注意**：返回 `true` 会显式写入 `{ visible: true }`——若节点原本 `visible: false`，返回 `true` 会覆盖为可见。

返回对象时，可以把它理解为“本次渲染前要覆写到节点上的 props”。例如返回 `{ visible: false }` 表示隐藏，返回 `{ disabled: true }` 表示禁用，返回 `{ visible: true, disabled: true }` 表示显示但禁用。

#### 6.4.6 示例：字段分组容器根据字段权限控制显隐

多个字段放在同一个布局容器（`div` / `el-card` / `el-col`）中，当容器内所有字段都不可见时，整个容器应隐藏：

```json
{
  "type": "el-card",
  "props": {
    "header": "财务信息",
    "onBeforeRender": "resolveFinanceBlockVisible"
  },
  "children": [
    { "type": "r-number", "props": { "field": "salary", "label": "薪资" } },
    { "type": "r-number", "props": { "field": "bonus", "label": "奖金" } },
    { "type": "r-text",   "props": { "field": "bankAccount", "label": "银行账号" } }
  ]
}
```

```javascript
// 容器内字段列表——与 rule.json children 保持一致
const _financeFields = ['salary', 'bonus', 'bankAccount']

function resolveFinanceBlockVisible(ctx) {
  if (!ctx.row) return { visible: true }  // 无行数据时默认显示（等待数据加载）

  // 只要有任一字段对当前行可见，容器就显示
  const anyVisible = _financeFields.some(f =>
    permission.checkPermission.isFieldVisible(f, ctx.row)
  )
  return { visible: anyVisible }
}
```

> **关键点**：这里控制的是容器自己的 `props.visible`。当返回 `{ visible: false }` 时，整个容器及其子树都不渲染。子字段组件（`r-number` / `r-text`）自身仍有 `useFieldPermission` 零代码机制——即使容器可见，各字段仍按各自 `_perm` 独立控制编辑/脱敏/隐藏。两层互不冲突：容器层做"整组显隐"，字段层做"单字段精控"。

更简单的场景——整个管理面板只对有创建权限的用户可见：

```json
{
  "type": "el-card",
  "props": {
    "header": "高级管理",
    "onBeforeRender": "resolveAdminPanelVisible"
  },
  "children": [...]
}
```

```javascript
function resolveAdminPanelVisible(ctx) {
  return {
    visible: permission.checkPermission.canCreate(ctx.modelPermission)
  }
}
```

#### 6.4.7 示例：按钮根据业务条件禁用

`permAction: "delete"` 只检查 `row._perm.allowDelete`。如果需要附加业务条件（如"订单状态为已完成时不允许删除"），则叠加 `onBeforeRender`：

```json
{
  "type": "builtin-action",
  "props": {
    "builtinAction": "delete-row",
    "label": "删除",
    "permAction": "delete",
    "onBeforeRender": "resolveDeleteState"
  }
}
```

```javascript
function resolveDeleteState(ctx) {
  // permAction 已处理 _perm.allowDelete；此处只写业务条件
  return {
    disabled: ctx.row?.status === 'completed'
  }
}
```

> **`permAction` 和 `onBeforeRender` 可以共存**。`permAction` 负责权限过滤，`onBeforeRender` 负责把业务计算结果写回动作节点的 `props`。容器管道先执行 `onBeforeRender`（步骤 ①），再执行 `permAction` 检查（步骤 ③④）。两者是 AND 关系——任一拒绝则动作不可用。

#### 6.4.8 示例：第三方组件字段权限桥接

内置字段组件已自动走 `useFieldPermission`，无需手写。但第三方或自定义包装组件需手动桥接：

```json
{
  "type": "VendorField",
  "props": {
    "field": "phone",
    "onBeforeRender": "resolvePhoneFieldState"
  }
}
```

```javascript
function resolvePhoneFieldState(ctx) {
  const field = typeof ctx.props?.field === 'string' ? ctx.props.field : ''
  if (!field) return { visible: true }

  const state = permission.resolveFieldPermissionState(field, ctx.row ?? null)
  if (!state) return { visible: true }
  if (!state.readable && !state.editable) return { visible: false }

  return {
    visible: true,
    disabled: !state.editable
  }
}
```

#### 6.4.9 原则

1. 权限是后端控制、前端渲染——`onBeforeRender` 读取后端已产出的 `_perm` / `_modelPerm`，通过 API 计算后直接回写节点 `props`，不做另一套权限系统。
2. 不应该发 HTTP 请求，不应该依赖异步结果。
3. 数据容器标准按钮已有零代码 `permAction`，内置字段组件已有零代码 `useFieldPermission`——覆盖范围内无需写 `onBeforeRender`。
4. 超出零代码覆盖的场景（布局隐显、业务条件禁用、第三方组件桥接）才需要 `onBeforeRender`。

### 6.5 相关 HTTP 约定

与权限直接相关的 HTTP 约定只有两条：

1. 身份接口只提供“当前用户是谁”的上下文，不等于字段或动作权限快照。
2. 前端发起写请求时，可把权限 token 透传到请求头。

当前 `CrudService` 的约定是：

| 来源 | 请求头 |
|------|--------|
| `modelPermission.permissionToken` | `X-Permission-Token` |
| `instancePermission.permissionToken` | `X-Instance-Permission-Token` |

边界要点：

1. `_perm` / `_modelPerm` 应留在响应数据里供前端渲染，不应原样回写到请求体。
2. 请求侧真正用于校验的是 permission token 请求头。
3. 当前仓库里后端尚未统一落地这套校验链，因此这里描述的是前端消费约定与目标接口契约。

---

## 7. 各宿主下的具体行为

### 7.1 `r-form`

`r-form` 是唯一允许 `(masked || hidden) && editable` 继续渲染输入控件的宿主。

行为矩阵：

| 读通道 | 写通道 | 结果 |
|--------|--------|------|
| `visible` | `editable` | 渲染表单项，控件带真实可编辑值 |
| `visible` | `readonly` | 渲染表单项，控件禁用 |
| `masked` | `editable` | 渲染表单项，但控件初始值清空 |
| `hidden` | `editable` | 渲染表单项，但控件初始值清空 |
| `hidden` | `readonly` | 不渲染表单项 |

### 7.2 `r-detail` / `r-list`

detail/list 只看读通道：

1. `visible` / `masked`：展示整块内容。
2. `hidden`：整块移除，包含 label/caption 与 value。

### 7.3 `r-table`

表格单元格只按读通道展示：

1. `hidden`：单元格内容不渲染。
2. `masked`：显示服务端返回的脱敏值。
3. 行动作权限与字段权限是两条链，互不混用。

### 7.4 `r-tree`

树节点文本同样只按读通道展示；节点动作由 `permAction` 走单独的动作权限链。

---

## 8. 特殊场景说明

### 8.1 修改密码 / 敏感字段改值

推荐返回：

```ts
{
  password: '',
  _perm: {
    hiddenFields: ['password'],
    editableFields: ['password']
  }
}
```

即使后端返回了原值，前端在 `r-form` 里也会抑制回显，不会把隐藏读通道内容再次填入输入框。

### 8.2 脱敏字段修改

推荐返回：

```ts
{
  phone: '138****1234',
  _perm: {
    maskedFields: ['phone'],
    editableFields: ['phone']
  }
}
```

行为：

1. 在 detail/table/list/tree 中显示 `138****1234`。
2. 在 form 中允许修改，但不会把 `138****1234` 当作输入框初始值。

### 8.3 空值不等于隐藏

空字符串、`null`、缺字段本身都不代表 hidden。

只有当 `hiddenFields` 显式包含该字段时，字段才进入 hidden 状态。

---

## 9. 当前测试覆盖

权限体系的核心行为已有回归测试锁定：

| 测试文件 | 覆盖内容 |
|----------|----------|
| `tests/permission-checker.test.ts` | 默认只读、模型级/行级显式授权 |
| `tests/permission-resolver.test.ts` | 读写双通道、动作权限统一入口、hidden/masked+editable |
| `tests/permission-filter.test.ts` | hidden 字段移除、masked 值透传 |
| `tests/renderer-field-advanced.test.ts` | form/detail/table 级字段渲染差异，尤其是隐藏字段与敏感字段编辑场景 |
| `tests/renderer-table.datasource.test.ts` | 容器动作权限：toolbar、row action、tree node action |

这些测试共同保证：

1. 缺少权限快照不会默认放行。
2. 前端不会再做本地二次脱敏。
3. `hidden + editable` 与 `masked + editable` 在 `r-form` 中可以工作。
4. detail/block 隐藏时不会残留 caption。

---

## 10. 常见误区与禁止事项

### 10.1 不要在前端重新实现脱敏规则

错误：

1. 根据字段名判断手机号并自行打星号。
2. 根据邮箱规则在前端截断用户名。

正确：

1. 服务端直接返回已脱敏值。
2. 前端只按 `maskedFields` 决定这是“脱敏展示态”。

### 10.2 不要把 hidden 理解成“绝对不渲染任何宿主”

错误理解：

1. `hidden` 就一定不能出现在表单里。

正确理解：

1. `hidden` 只代表读通道不可见。
2. 如果同时 `editable`，`r-form` 仍可渲染写入控件。

### 10.3 不要把权限过滤器当成安全边界

`PermissionFilter` 是前端展示层辅助工具，不是安全审计边界。

真正的安全边界仍然在服务端。

---

## 11. 相关源码入口

1. `packages/spark-data/src/types.ts`
2. `packages/spark-data/src/crud-service.ts`
3. `packages/spark-component/src/permission/PermissionChecker.ts`
4. `packages/spark-component/src/permission/PermissionResolver.ts`
5. `packages/spark-component/src/permission/FieldRenderHelper.ts`
6. `packages/spark-component/src/permission/PermissionFilter.ts`
7. `packages/spark-component/src/components/fields/context/useFieldPermission.ts`
8. `packages/spark-component/src/components/fields/non-data-components/FieldContextRenderer.vue`
9. `packages/spark-component/src/components/containers/action-permission.ts`
10. `packages/spark-component/src/components/support/beforeRender.ts`
11. `tests/permission-checker.test.ts`
12. `tests/permission-resolver.test.ts`
13. `tests/permission-filter.test.ts`
14. `tests/renderer-field-advanced.test.ts`
15. `tests/renderer-table.datasource.test.ts`

---

## 12. 一句话总结

SPARK 当前权限体系的本质是：

**服务端给出权限快照与最终展示值，前端按读写双通道把这些结果稳定映射到字段、动作和宿主渲染上。**
