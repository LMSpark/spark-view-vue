# @spark-view/vite-plugin-spark-catalog

构建期使用的 Vite 插件工作区，用来从组件源码提取结构化元数据，并生成 AI 运行时和提示词所需的目录产物。

## 负责内容

- 基于 VCM 的组件 props 元数据提取
- 结构化组件目录生成
- 扁平文本目录兼容转换
- 构建期提示词拼装输入整理

## 使用定位

- 这是内部工作区包，不是业务页面直接依赖的运行时模块。
- 当组件 API、提示词目录或组件元数据生成逻辑需要调整时，优先从这里入手。

## CLI 环境变量

通过 `packages/vite-plugin-spark-catalog/src/cli.ts` 执行目录生成时，可用以下环境变量覆盖默认行为：

- `SPARK_CATALOG_INCLUDE_GLOBAL_PROPS`：`true/false`，是否保留 VCM 全局 props
- `SPARK_CATALOG_VCM_RAW_TYPE`：`true/false`，透传 VCM `rawType`
- `SPARK_CATALOG_VCM_SCHEMA`：`true/false`，透传 VCM `schema`
- `SPARK_CATALOG_VCM_NO_DECLARATIONS`：`true/false`，透传 VCM `noDeclarations`

未设置时保持现有默认值。

## VCM JSDoc 标识规范

组件 catalog 的语义 SSOT 写在源码 JSDoc，生成器只搬运这些标识并补通用兜底。新增组件或 props 时遵循下面的最小规范：

- VCM 注释首先服务 LLM 和配置后台，不是普通代码说明。新增组件、公开 props、emits、枚举值或结构化子节点时，必须在“首次声明处”写 JSDoc：SFC 的 `<script setup>` 后首个 JSDoc 块、Props 类型字段声明、`defineEmits` 对应事件声明。不要在第二次引用、注册表、生成器或文档旁路里补语义。
- 首次出现的 JSDoc 必须包含自然语言语义和结构化 tag。组件级语义写入 `@description`；prop、emit、枚举等字段级语义先写一段 summary，再写 tag。自然语言写“用途 + 绑定来源 + 关键约束/优先级”，禁止强大、极致、一站式等广告化文案；tag 写机器可提取的过滤、默认值、示例和枚举约束。
- tag 一行一个，值保持单行；不要发明未被生成器识别的新 tag 来承载约束。复杂说明用 summary 或 `@notes`，可校验值用 `@default`、`@example`、`@enumValue`、`@param` 等既有 tag。
- 检测入口：`pnpm run verify:vcm-comments` 会检查首个 JSDoc 位置、必需 `@skill/@description`、未识别 tag、广告化/待补充文案、`@default/@example` JSON literal、`@enumValue` 格式；根级 `pnpm run verify:rules` 已包含该检测。
- 组件级 JSDoc 放在 `<script setup>` 后的首个 JSDoc 块，至少包含 `@skill <type>` 和 `@description <text>`。
- 组件 Props 类型是强约束，不是约定俗成：统一命名为 `R{ComponentPascalName}Props`，并与组件 type 一一对应：`r-table -> RTableProps`、`r-filter -> RFilterProps`。生成器只根据已注册组件建立 `RFilterProps -> r-filter` 索引；如果使用 `RendererXxxProps` 指向已注册组件会 fail-fast。
- `@description`：组件级说明写“用途 + 适用场景 + 核心能力”；prop 级 summary 写“用途 + 绑定语义 + 何时使用”。
- `@category container|field|group|meta|feature`：仅当目录路径推断不准确时使用。
- `@catalogIgnore`：完全忽略该 SFC，不写入 `component-catalog.json`；用于 demo、路由占位、开发工具和不应被 catalog 看到的桥接组件。
- `@catalogInternal`：写入技术目录，但生成 `internal: true`、`configurable: false`；用于运行时内部组件、应用壳层组件、只能被代码组合而不能由 LLM 生成到页面配置的组件。
- `@configurable false`：保留在目录中但标记不可配置；适合不是 internal、但暂时不允许页面配置直接使用的组件。
- `@binding <text>`：声明组件绑定模式，例如 `DataView: dataViewKey + dataMember + dataField`；用于让 LLM 区分自治绑定、容器透传和纯展示组件。
- `@provides <key> - <text>` / `@consumes <key> - <text>`：声明能力提供/消费关系，key 使用项目中的 capability 名称，不写 Vue provide/inject 概念。
- `@notes <text>`：补充 LLM 必须遵守但不适合放入默认值或示例的约束；可多条，优先写前置条件、互斥关系、危险操作提示和优先级。
- 第一段 summary：一句话说明用途、绑定语义、何时使用；中英混合短句即可。
- 共享 `type` 的 JSDoc 会成为 `schemaNodes.root.description`；复杂 props 请优先给类型本身写说明，再给字段写 property JSDoc。
- `@default <json>`：配置默认值 annotation。必须写 JSON literal，例如 `true`、`0`、`"small"`、`[]`、`{}`；真实运行默认值优先写在 `withDefaults`。
- `@example <json>`：LLM 可直接照抄的配置示例。必须是 JSON literal；同一字段可写多个 `@example`。
- `@param <name> <text>`：事件 payload 参数说明，仅用于 `defineEmits` call signature 或 tuple property；tuple property 可以写成 `change: [value: string]` 或 `'update:modelValue': [value: string]`。
- `@enumValue <value> <title>: <text>`：业务枚举值说明。只用于需要解释业务动作的枚举；普通 UI 枚举由生成器自动补通用说明。
- `@internal`：不进入 catalog 的 props 或内部实现字段。

LLM 约束必须尽量落到最小可生成单位：

- 组件是否可被生成：写在组件级 `@catalogInternal`、`@configurable false` 或 `@catalogIgnore`。
- 绑定链路和数据来源：写在组件级 summary、`@binding`，以及相关 prop 的 summary/`@example`。
- prop 默认行为：写 `@default`，不要只在运行时代码里让 LLM 猜。
- prop 合法示例：写 `@example`，特别是 `dataViewKey`、结构化子节点、action 配置、options 数据源。
- 枚举业务含义：写 `@enumValue`，说明会不会修改数据、作用于 currentRow/selectedRows/scope row 还是静态展示。
- 事件 payload：写事件 summary 和 `@param`，参数名必须和 tuple/call signature 中的名字一致。

推荐写法：

```ts
/**
 * 声明式动作按钮；绑定 DataView 动作时由 action 决定 mutation 目标，template 只决定视觉预设。
 * @skill r-button
 * @description 声明式动作按钮，支持 action CRUD 动作、template 样式预设和显式 props 合并；适合 toolbar、table 操作列和表单提交区。
 * @binding DataView action: dataViewKey + currentRow/selectedRows/scope row
 * @notes mutation 类 action 必须能定位目标 DataView；展示类 action 不修改数据。
 */
type RButtonProps = {
  /**
   * Button action; 绑定数据视图动作，通常用于 toolbar 或 table 操作列。
   * @default "refresh"
   * @example "refresh"
   * @enumValue refresh 刷新数据：重新加载目标数据视图的数据。
   */
  action?: ButtonAction

  /**
   * Structured toolbar node; 用于声明按钮所在工具栏，生成器会按 RToolbarProps 推导到 #/$defs/r-toolbar。
   * @example {"type":"r-toolbar","props":{}}
   */
  toolbar?: RToolbarProps
}

const emit = defineEmits<{
  /**
   * Value changed; 同步字段值到父级。
   * @param value Next field value.
   */
  'update:modelValue': [value: string]

  /**
   * Option selected; 用户选择候选项。
   * @param option Selected option item.
   */
  select: [option: OptionItem]
}>()
```

注意：不要在生成器里写业务含义；业务动作、枚举语义、特殊绑定规则都必须来自源码 JSDoc。

内部组件写法：

```ts
/**
 * @skill ai-chat-shell
 * @catalogInternal
 * @description AI 聊天壳层，仅由 AiChatWidget 托管，不允许作为页面配置组件直接生成。
 */
```

忽略组件写法：

```ts
/**
 * @catalogIgnore
 * @description 开发演示页或路由占位，不进入 component catalog。
 */
```

## 后端数据库存储建议

`component-catalog.json` 当前按“组件主表 + 属性/事件明细表 + schema 自引用表”设计，后端可以直接拆表持久化，不需要再解析旧的 `schemaPool` 或编号引用。

平台约束 `constraints` 也按说明化结构存储：每个字段都是 `{ value, description, examples }`。`value` 给校验器直接消费，`description/examples` 给 LLM 和后台配置页面解释规则，避免裸正则、裸数组让模型猜含义。

建议表结构：

- `component_catalog_builds`
  - `id`：catalog 构建批次 id。
  - `version`：catalog schema 版本，例如 `4.0.0`。
  - `build_time`：生成时间。
  - `component_count`：本批次组件数量。
  - `raw_json`：可选，保留完整 JSON 便于审计和回滚。

- `component_catalog_components`
  - `build_id`：关联构建批次。
  - `type`：组件 type，主业务键，如 `r-table`。
  - `category`：`container | field | group | meta | feature`。
  - `description`：组件级 LLM 摘要。
  - `internal`：是否内部组件。
  - `configurable`：是否允许 LLM/页面配置直接使用。
  - `source_file`：可选，源码相对路径，仅用于诊断。
  - 推荐唯一键：`(build_id, type)`。

- `component_catalog_props`
  - `build_id`、`component_type`。
  - `name`、`type_text`、`required`、`default_text`、`description`。
  - `examples_json`：JSON array。
  - `schema_node_id`：指向 `component_catalog_schema_nodes.id`。
  - `component_ref`：结构化子组件引用，如 `r-toolbar`。
  - 推荐唯一键：`(build_id, component_type, name)`。

- `component_catalog_emits`
  - `build_id`、`component_type`。
  - `name`、`type_text`、`description`。
  - `schema_node_id`：事件 payload tuple 的根 schema node。
  - 推荐唯一键：`(build_id, component_type, name)`。

- `component_catalog_schema_nodes`
  - `build_id`。
  - `id`：节点主键；根节点 id 等于 TypeScript type 或事件 payload key。
  - `root_id`：所属 schema 根节点，便于按 schema 分区查询。
  - `parent_id`：父节点 id，根节点为空。
  - `relation`：`root | property | items | prefixItem | oneOf | anyOf`。
  - `name`：property 或 prefixItem 参数名。
  - `index`：数组/tuple/union 分支顺序。
  - `required`：object property 是否必填。
  - `ref_id`：同表引用，表示该节点复用另一棵 schema 根。
  - `json_type`：标准 JSON Schema type，可为字符串或数组。
  - `title`、`description`。
  - `enum_json`、`const_json`、`default_json`、`examples_json`。
  - 推荐唯一键：`(build_id, id)`。
  - 推荐索引：`(build_id, root_id)`、`(build_id, parent_id)`、`(build_id, ref_id)`。

- `component_catalog_binding_descriptors`
  - `build_id`、`component_type`。
  - `binding_delegate`、`self_resolving`、`data_container`、`field_provider`、`has_options`、`value_type`。
  - `description`：LLM 可读绑定语义说明。
  - `examples_json`：最小绑定配置示例数组。
  - 也可以整体存为 `descriptor_json`，因为该表主要用于能力过滤。

- `component_catalog_constraints`
  - `build_id`。
  - `name`：约束名，例如 `dataViewKeyPattern`、`validTypePrefixes`。
  - `value_json`：约束真实值。
  - `description`：LLM 可读说明。
  - `examples_json`：合法示例数组。
  - 推荐唯一键：`(build_id, name)`。

递归查询规则：

1. 从组件开始：按 `component_type` 读取 component，再读取 props/emits。
2. 从 prop/emit 的 `schema_node_id` 进入 `schema_nodes`。
3. 使用递归 CTE 按 `parent_id` 展开整棵 schema。
4. 遇到 `ref_id` 时，再用同一个 `build_id + ref_id` 递归展开被引用的根节点。
5. `relation=property` 使用 `name` 作为对象字段名；`relation=prefixItem/items/oneOf/anyOf` 使用 `index` 保持顺序。

PostgreSQL 查询示例：

```sql
WITH RECURSIVE schema_tree AS (
  SELECT n.*
  FROM component_catalog_schema_nodes n
  WHERE n.build_id = $1
    AND n.id = $2

  UNION ALL

  SELECT child.*
  FROM component_catalog_schema_nodes child
  JOIN schema_tree parent
    ON child.build_id = parent.build_id
   AND child.parent_id = parent.id

  UNION ALL

  SELECT ref.*
  FROM component_catalog_schema_nodes ref
  JOIN schema_tree node
    ON ref.build_id = node.build_id
   AND ref.id = node.ref_id
)
SELECT *
FROM schema_tree
ORDER BY root_id, parent_id NULLS FIRST, relation, index NULLS FIRST, name NULLS FIRST;
```

落库约束：

- 不落旧字段：`registry`、`schemaPool`、`schemaRef`、`schemaRefs`、`$defs`、`$id`、`x-ts-*`、`schema_*`、`prop_*`、`emit_*`。
- `components.type` 是目录主索引；分类列表由 `components.category` 动态派生。
- `undefined` 不作为类型值持久化；可选语义只看 prop `required=false` 或 schema property `required=false`。
- `internal=true` 或 `configurable=false` 的组件可存入技术库，但 LLM-facing 查询必须过滤。
- `examples_json` 是给 LLM 的填写样例；`default_json/default_text` 只是默认值 annotation，不代表业务值必须省略。

## 相关位置

- `src/index.ts`：插件主入口
- `src/json-catalog-generator.ts`：结构化目录生成
- `src/extract-component-api-vcm.ts`：VCM/JSDoc 提取

## 相关文档

- [../../docs/ai/spark-ai-complete-guide.md](../../docs/ai/spark-ai-complete-guide.md)
