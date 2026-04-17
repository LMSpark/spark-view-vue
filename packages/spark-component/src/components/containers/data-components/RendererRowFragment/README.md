# RendererRowFragment Chain

这组文件专门收口“行片段 / 行作用域”这一条渲染链，避免语义层、宿主层、作用域层、叶子层散落在不同目录。

当前分层：

1. `RendererRowFragment.vue`
公开语义壳，对外代表 `r-row-fragment`。

2. `RendererHostScope.vue`
host + row 作用域层，负责注入宿主语义与 `DATA_ROW`，并透明递归子节点。

补充：

- `RendererRowFragment.types.ts` 是这条链的公共语义契约。
- 如果后续接 `r-list` / `r-tree` / gantt，优先在 `RendererRowFragment.vue` 内扩展宿主投影逻辑，不要把宿主语义混入字段组件。
- `RendererHostScope.vue` 保持“薄壳”职责：只处理 host 与 row 作用域，不解释业务元属性。

## 最简单用例

目标：在一个 `r-row-fragment` 里放两个最小子字段。

1. 字段 1：图标
2. 字段 2：超链接

最小数据行：

```json
{
	"id": 1,
	"icon": "ri-user-line",
	"href": "https://example.com/users/1",
	"label": "Alice profile"
}
```

最小片段配置：

```ts
{
	type: 'r-row-fragment',
	props: {
		title: '入口',
		width: 220,
		fields: [
			{ type: 'row-fragment-icon-probe' },
			{ type: 'row-fragment-link-probe' },
		],
	},
}
```

如果只写公开语义，可以把它理解成：

```ts
{
	type: 'r-row-fragment',
	props: {
		title: '入口',
		width: 220,
		fields: ['图标', '超链接'],
	},
}
```

但当前运行时真正消费的是字段节点描述，所以落地配置仍然要写成上面的 `SparkNode[]`。

这个例子的意义：

- `RendererRowFragment.vue` 负责把它投影成 table 列。
- `RendererHostScope.vue` 负责给两个子字段提供同一个 `DATA_ROW`。
- `row-fragment-icon-probe` 只读 `row.icon`。
- `row-fragment-link-probe` 只读 `row.href` 和 `row.label`。
- `props.children` 作为片段包含的字段节点列表。

对应的可执行回归测试在：

- `tests/renderer-table.datasource.test.ts`

这就是 row-fragment 的最小成立单元：

- 一个宿主列
- 一个共享的 `DATA_ROW`
- 多个并列的行内语义子字段

业务落地时，可以把这两个 probe 替换成真正组件，例如：

- 图标：`r-icon`
- 超链接：业务链接组件，或 `r-link` 配合业务侧 props 装配