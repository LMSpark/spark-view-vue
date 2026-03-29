# SPARK 权限体系梳理

> 本文档基于当前源码与测试用例整理，描述 SPARK 现阶段的权限模型、运行链路、宿主渲染差异与边界约束。

## 1. 设计目标

SPARK 的权限体系**目标模型**是“后端统一验证，前端按快照渲染”，核心目标不是在前端做二次鉴权，而是把服务端已经计算好的权限结果稳定地映射到 UI。

目标架构遵循以下原则：

1. 权限由后端统一计算并下发，前端不基于角色名、用户 ID 或本地规则再做一套判定。
2. 字段权限按读写双通道解释：读通道只管能不能看、怎么看；写通道只管能不能改。
3. 脱敏值由后端直接返回，前端不再做手机号、身份证、邮箱等本地二次脱敏。
4. 缺少权限快照时默认收紧，而不是默认放行。
5. 后端输出数据时会自动携带全部真实主键列；前端可以隐藏主键展示，但不能破坏身份识别与回写链路。

当前接入状态（2026-03-29）：

1. 前端字段权限与动作权限的解析/渲染链已经存在，并已被 `spark-component` 消费。
2. `packages/spark-data` 中已经存在一组前端数据层权限 API，例如 `PermissionChecker`、`PermissionFilter`、`PermissionResolver`；它们是 TypeScript 库接口，不是后端 HTTP 服务。
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

### 5.1 `PermissionChecker`

文件：`packages/spark-component/src/permission/PermissionChecker.ts`

职责：

1. 提供最基础的模型级、行级、字段级权限判断。
2. 只做“判断”，不关心宿主如何渲染。
3. `getFieldDisplayValue()` 只透传服务端已经处理好的值，不做本地脱敏。

当前关键规则：

| 方法 | 规则 |
|------|------|
| `canCreate()` | `allowCreate === true` 才允许 |
| `canImport()` | `allowImport === true` 才允许 |
| `canExport()` | `allowExport === true` 才允许 |
| `canDelete()` | `allowDelete === true` 才允许 |
| `canCreateChild()` | `allowCreateChild === true` 才允许 |
| `canEdit()` | 由字段权限推导；`editableFields.length > 0` 才允许 |
| `isFieldEditable()` | 字段名必须在 `editableFields` 中 |
| `getFieldVisibility()` | `hiddenFields` 优先于 `maskedFields` |

### 5.2 `FieldRenderHelper`

文件：`packages/spark-component/src/permission/FieldRenderHelper.ts`

职责：

1. 基于字段配置和权限快照计算字段状态。
2. 把“读通道”和“写通道”整理成统一的 `IFieldRenderState`。

核心产物：

```ts
interface IFieldRenderState {
  field: string
  visibility: FieldVisibility
  readable: boolean
  editable: boolean
  displayValue: string | undefined
  shouldRender: boolean
}
```

说明：

1. `readable` 表示字段在读通道下是否允许显示。
2. `editable` 表示字段在写通道下是否允许编辑。
3. `shouldRender` 当前只表示“默认读通道下可展示”，真正的宿主差异由上层组件决定。

### 5.3 `PermissionResolver`

文件：`packages/spark-component/src/permission/PermissionResolver.ts`

职责：

1. 统一动作权限判断入口：`isPermittedAction()`。
2. 统一字段权限状态入口：`resolveFieldPermissionState()`。
3. 统一字段显示值入口：`formatPermissionAwareFieldValue()`。

这是权限体系里最重要的“聚合层”，上层组件与容器不需要自己重新拼一遍权限规则。

### 5.4 `PermissionFilter`

文件：`packages/spark-component/src/permission/PermissionFilter.ts`

职责：

1. 批量筛选可删除行、可编辑行。
2. 按展示需求过滤字段。

当前 `filterDisplayableFields()` 的规则是：

1. `_` 前缀元字段保留。
2. `hidden` 字段移除。
3. `masked` 字段保留服务端原样返回值。

**注意**：它是“展示层过滤工具”，不是安全边界，也不是回写前的数据清洗器。

### 5.5 `useFieldPermission`

文件：`packages/spark-component/src/components/fields/context/useFieldPermission.ts`

职责：

1. 把组件层权限模块的结果桥接到字段组件。
2. 根据宿主类型决定字段在当前上下文下是否应渲染。
3. 处理表单场景下“可编辑但不可回显”的特殊逻辑。

关键逻辑：

1. `shouldRenderCurrentField`
   - `r-form`：`state.readable || state.editable`
   - 其他宿主：`state.readable`
2. `shouldSuppressReadableValueInWritableForm`
   - 当宿主是 `r-form`
   - 且字段 `editable === true`
   - 且 `visibility !== visible`
   - 则表单控件初始值强制清空，不回显读通道值

这正是密码修改、敏感字段变更场景的关键实现。

### 5.6 `FieldContextRenderer`

文件：`packages/spark-component/src/components/fields/non-data-components/FieldContextRenderer.vue`

职责：

1. 根据宿主类型统一承载字段渲染。
2. 使用 `shouldRenderCurrentField` 区分不同宿主的可见策略。

宿主行为：

| 宿主 | 渲染规则 |
|------|----------|
| `r-table` | 按单元格读通道决定是否显示值 |
| `r-form` | 只要 readable 或 editable 即渲染控件 |
| `r-tree` | 按读通道决定是否显示节点文本 |
| `r-detail` / `r-list` | 按读通道决定是否显示整个展示块 |

这也是“隐藏字段时，detail/block 场景要连 caption 一起移除”的落点。

### 5.7 `action-permission`

文件：`packages/spark-component/src/components/containers/action-permission.ts`

职责：

1. 统一容器动作的权限判定。
2. 明确区分模型级动作和行级动作，避免误把一个动作同时要求两层权限。

当前分工：

| 动作 | 权限层级 |
|------|----------|
| `create` | 模型级 |
| `import` | 模型级 |
| `export` | 模型级 |
| `edit` | 行级，但由 `editableFields` 推导 |
| `delete` | 行级 |
| `create-child` | 同时涉及模型级和行级 |

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

### 6.2 字段权限链路

```text
row._perm + field
  -> PermissionChecker.getFieldVisibility()
  -> FieldRenderHelper.computeFieldState()
  -> PermissionResolver.resolveFieldPermissionState()
  -> useFieldPermission
  -> FieldContextRenderer
  -> 具体字段组件 / detail block / table cell
```

### 6.3 动作权限链路

```text
_modelPerm / row._perm + permAction
  -> PermissionResolver.isPermittedAction()
  -> action-permission.ts
  -> 容器 toolbar / row actions / tree node actions
```

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

## 9. 主键契约与权限体系的关系

权限体系虽然关注展示和编辑，但仍必须遵守主键契约。

### 9.1 后端输出契约

后端任何输出记录都会自动带回全部真实主键列。

前端必须假定：

1. 真实主键列始终存在。
2. 即便主键字段不展示，也不能在身份识别、当前行切换、CRUD 回写、级联匹配等链路中裁掉。

### 9.2 DataView 的复合主键方案

复合主键已经由 DataView 统一解决：

1. 多列真实主键自动合成为 `row._pk`。
2. 内部主键操作统一使用标量 `PkValue`。
3. 前端不要自行拼接复合主键字符串。

应该依赖：

1. `view.primaryKey`
2. `row._pk`
3. 主键委托 / DataView 主键能力

不应该做：

1. 自己在组件里用 `tenantId + '_' + itemId` 拼主键。
2. 把真实主键字段当成普通展示字段过滤掉后，再尝试做更新或删除。

---

## 10. 当前测试覆盖

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

## 11. 常见误区与禁止事项

### 11.1 不要在前端重新实现脱敏规则

错误：

1. 根据字段名判断手机号并自行打星号。
2. 根据邮箱规则在前端截断用户名。

正确：

1. 服务端直接返回已脱敏值。
2. 前端只按 `maskedFields` 决定这是“脱敏展示态”。

### 11.2 不要把 hidden 理解成“绝对不渲染任何宿主”

错误理解：

1. `hidden` 就一定不能出现在表单里。

正确理解：

1. `hidden` 只代表读通道不可见。
2. 如果同时 `editable`，`r-form` 仍可渲染写入控件。

### 11.3 不要把权限过滤器当成安全边界

`PermissionFilter` 是前端展示层辅助工具，不是安全审计边界。

真正的安全边界仍然在服务端。

### 11.4 不要自行拼装复合主键

复合主键已经由 DataView 统一归一为 `_pk`。

如果前端再次自己拼一套主键：

1. 容易与服务端真实主键字段脱节。
2. 容易和 DataView 当前行、删除、更新、级联链路冲突。

---

## 12. 相关源码入口

数据层：

1. `packages/spark-data/src/types.ts`
2. `packages/spark-data/src/crud-service.ts`

组件层：

1. `packages/spark-component/src/permission/PermissionChecker.ts`
2. `packages/spark-component/src/permission/PermissionResolver.ts`
3. `packages/spark-component/src/permission/FieldRenderHelper.ts`
4. `packages/spark-component/src/permission/PermissionFilter.ts`
5. `packages/spark-component/src/components/fields/context/useFieldPermission.ts`
6. `packages/spark-component/src/components/fields/non-data-components/FieldContextRenderer.vue`
7. `packages/spark-component/src/components/containers/action-permission.ts`

测试：

1. `tests/permission-checker.test.ts`
2. `tests/permission-resolver.test.ts`
3. `tests/permission-filter.test.ts`
4. `tests/renderer-field-advanced.test.ts`
5. `tests/renderer-table.datasource.test.ts`

---

## 13. 一句话总结

SPARK 当前权限体系的本质是：

**服务端给出权限快照与最终展示值，前端按读写双通道把这些结果稳定映射到字段、动作和宿主渲染上；主键身份语义继续由 DataView 统一维护。**