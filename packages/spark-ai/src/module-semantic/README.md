# module-semantic

`@spark-view/spark-ai/module-semantic` 是 Host 与业务系统之间的语义协议层。它只做三件事：

- 描述业务模块：`ModuleKind`、`AttributeSchema`、`ActionSchema`。
- 固定 6 个 LLM 协议工具：`getAttribute`、`setAttribute`、`invokeAction`、`listChildren`、`findInstance`、`describeKind`。
- 在调用时完成路径解析、action 参数校验和运行入口委托。

它不保存业务 live state，不管理 Host 会话历史，不导入业务包。

## 核心模型

`ModuleKind` 是协议层标准 class，不再拆出额外基类或业务能力协议。运行时只接收标准 `ModuleKind` 对象；业务迁移期可以直接 `new ModuleKind({...})` 或继承它，但目标形态是由 VCM 提取属性、动作、子模块和构造装配边界，生成 `ModuleKindOptions` / factory 来替代手写 `ModuleKind`。

`ActionSchema` 是纯声明 DTO，只用于 `describeKind`、工具描述和参数校验。动作函数不写进 `ActionSchema`，统一放在 `ModuleKind.runner(ctx, actionName, args)`。

`ModuleKind` 的运行侧委托：

| 协议工具 | 参数 | 委托 |
| --- | --- | --- |
| `getAttribute` | `path, attrName` | 基类先查询 `attributes` 元数据,再读取 `ModuleKind.runner` 函数对象上的同名属性 |
| `setAttribute` | `path, attrName, value` | 基类先查询 `attributes` 元数据,再写入 `ModuleKind.runner` 函数对象上的同名属性 |
| `invokeAction` | `path, actionName, args` | `ModuleKind.runner(ctx, actionName, args)` |
| `listChildren` | `path, childKind?` | 根路径列出所有 kind；非根路径调用 `ModuleKind.list(ctx, childKind)` |
| `findInstance` | `path, childKind, query` | 根路径调用目标 kind 的 `ModuleKind.find(ctx, childKind, query)`；非根路径调用末段 kind 的 `find` |
| `describeKind` | `kind` | 返回 `ModuleKind` 元数据，不调用业务 runner |

`listChildren`、`findInstance`、`resolveChild` 都是基类统一实现的协议方法。业务层不要重写这些方法，也不要提供单独的 resolve 委托；路径校验由基类先调用 `find(ctx, childKind, { id })`，未命中时再调用 `list(ctx, childKind)` 推导。

属性语义只来自 `ModuleKind.attributes`，由 `describeKind` 暴露给 LLM；`runner` 函数对象属性只是运行时值存储，不参与语义发现。最终能力元数据应来自 VCM 或其它构建期生成链路，注册到 runtime 前必须投影成标准 `ModuleKindOptions` 并创建 `ModuleKind`。

VCM 生成能力模块元数据的 JSDoc 标识和范围见 [DM-VCM-MODULE-METADATA-SCOPE.md](DM-VCM-MODULE-METADATA-SCOPE.md)。

`ModuleKind<TListRef, TFindRef>` 允许业务收窄 `list` / `find` 返回的实例引用类型；两个泛型都必须满足 `extends ModuleInstanceRef`，协议对外仍按 `ModuleInstanceRef[]` 处理。

## 注册方式

`runtime.registerKind` 只接受一个 `ModuleKind` 对象。推荐生成链路产出 `ModuleKindOptions` / factory，业务只注入 runner/list/find 运行委托。

```ts
import {
  ModuleKind,
  ModuleSemanticRuntime,
  ok,
  type ModuleKindOptions,
  type ModuleKindRunner,
  type ModulePathContext,
} from '@spark-view/spark-ai/module-semantic'

const runtime = new ModuleSemanticRuntime()

// VCM 最终生成这一段；手写仅作为迁移期示意。
const SCHOOL_KIND_OPTIONS = {
  kind: 'school',
  name: '学校',
  description: '学校业务语义模块',
  actions: [
    {
      name: 'archive',
      description: '归档学校',
      paramsSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '归档原因' },
        },
        required: ['reason'],
        additionalProperties: false,
      },
      resultSchema: { type: 'object' },
      usageRules: ['归档前确认当前学校不再编辑。'],
      failureModes: [
        { code: 'NOT_FOUND', when: '学校不存在', fix: '先调用 findInstance 获取真实 id。' },
      ],
      example: { reason: '测试归档' },
    },
  ],
} satisfies ModuleKindOptions

function createSchoolModuleKind(): ModuleKind {
  const runner: ModuleKindRunner = (ctx, actionName, args) => runSchoolAction(ctx, actionName, args)

  return new ModuleKind({
    ...SCHOOL_KIND_OPTIONS,
    runner,
    find: (ctx) => ok([
      { id: ctx.host?.moduleInstanceId ?? 'school-1', label: '当前学校' },
    ]),
  })
}

function runSchoolAction(
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, unknown>>,
) {
  if (actionName !== 'archive') {
    return {
      ok: false,
      checks: [
        {
          level: 'error',
          code: 'UNKNOWN_ACTION',
          message: `${actionName} 未实现`,
        },
      ],
    }
  }
  return {
    ok: true,
    data: {
      schoolId: ctx.segment.id,
      reason: args['reason'],
    },
  }
}

runtime.registerKind(createSchoolModuleKind())
```

## 生成边界

VCM 生成的代码只负责描述元数据和装配标准 `ModuleKind`：

- 生成 `kind / name / description / attributes / actions / children`。
- 生成 `ModuleKindOptions`，并用 `satisfies ModuleKindOptions` 校验。
- 提取构造函数和注册工厂的依赖边界，生成 `createXxxModuleKind(delegates)` factory。
- 按 `@moduleRunner`、`@moduleListDelegate`、`@moduleFindDelegate` 标识提取 runner/list/find 委托绑定。
- 不生成业务 runner 函数体，不保存 live state，不新增 runtime 注册入口。

业务代码只提供：

- `runner(ctx, actionName, args)`：执行动作。
- `list(ctx, childKind?)`：必要时列出子实例。
- `find(ctx, childKind, query)`：必要时查找实例。

最终仍调用：

```ts
runtime.registerKind(createSchoolModuleKind())
```

## 默认行为

`ModuleKind` 自带保守默认实现：

- `runner` 返回 `ACTION_NOT_IMPLEMENTED`。
- `list` 返回空数组。
- `find` 在根路径下返回当前 Host 业务实例，实例 id 来自 `ctx.host.moduleInstanceId`。
- `getAttribute` 先按 `attributes` 校验声明和 readable，再读取 `runner` 函数对象属性；未设置时返回 `ATTRIBUTE_VALUE_NOT_FOUND`。
- `setAttribute` 先按 `attributes` 校验声明和 writable，再写入 `runner` 函数对象属性；写入失败时返回 `ATTRIBUTE_WRITE_FAILED`。

这让简单业务只需要声明 action schema 并提供 `runner`；复杂业务再按需挂接 `list`、`find`，属性状态直接存在 `runner` 函数对象上。

## LLM 调用顺序

推荐发现链路固定为：

1. `listChildren("/")` 发现可用 kind。
2. `findInstance("/", kind, {})` 获取当前业务实例。
3. `describeKind(kind)` 获取完整 action 元数据。
4. `invokeAction(path, actionName, args)` 执行业务动作。

`describeKind` 必须完整返回：

- `paramsSchema`
- `resultSchema`
- `usageRules`
- `failureModes`
- `example`

公共工具参数由协议层校验；`invokeAction.args` 由对应 action 的 `paramsSchema` 校验；业务只处理已经过协议预校验的动作参数。

## 文件结构

```text
module-semantic/
├── protocol/
│   ├── module-kind.ts       # ModuleKind / AttributeSchema / ActionSchema / 运行侧委托类型
│   ├── module-path.ts       # /kind[id]/child[id] 路径解析
│   └── operation-result.ts  # OperationResult / checks
├── internal/
│   ├── module-kind-registry.ts
│   ├── navigator.ts           # 路径遍历 + list/find/describeKind
│   ├── attribute-accessor.ts
│   ├── action-invoker.ts
│   └── protocol-tool-generator.ts
├── runtime/
│   └── module-semantic-runtime.ts
└── host/
    └── module-semantic-tool-codec.ts
```

参考实现：

- `packages/spark-page-config/src/assistant/registrations/page-design/page-design-module.ts`
- `packages/spark-page-config/src/assistant/registrations/page-design/module-semantic/node-tree-module-kind.ts`
- `packages/spark-page-config/src/assistant/registrations/leave-request/leave-request-module.ts`
