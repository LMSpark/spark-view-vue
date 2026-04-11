# RendererRowFragment Chain

这组文件专门收口“行片段 / 行作用域”这一条渲染链，避免语义层、宿主层、作用域层、叶子层散落在不同目录。

当前分层：

1. `RendererRowFragment.vue`
公开语义壳，对外代表 `r-row-fragment`。

2. `RendererRowFragmentHost.vue`
宿主投影层，负责把行片段投影到具体宿主；当前已接 `r-table -> el-table-column`。

3. `RendererDataScope.vue`
数据作用域层，只负责提供 `DATA_ROW`，不解释宿主元属性。

4. `RendererDataHost.vue`
叶子递归层，只负责把子节点重新交回 `SparkComponentRenderer`。

补充：

- `RendererRowFragment.types.ts` 是这条链的公共语义契约。
- 如果后续接 `r-list` / `r-tree` / gantt，优先改 `RendererRowFragmentHost.vue`，不要回退去污染 `RendererDataScope.vue`。
- `RendererDataScope.vue` 对齐的是 `RendererActions.vue` 的“薄壳”思路；`RendererDataHost.vue` 对齐的是 `RendererActionStrip.vue` 的“叶子递归”思路。

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

- `RendererRowFragmentHost.vue` 负责把它投影成 table 列。
- `RendererDataScope.vue` 负责给两个子字段提供同一个 `DATA_ROW`。
- `row-fragment-icon-probe` 只读 `row.icon`。
- `row-fragment-link-probe` 只读 `row.href` 和 `row.label`。
- 对外公开面优先看 `props.fields`；`children` 只是兼容回退入口，不再是推荐写法。

对应的可执行回归测试在：

- `tests/renderer-table.datasource.test.ts`

这就是 row-fragment 的最小成立单元：

- 一个宿主列
- 一个共享的 `DATA_ROW`
- 多个并列的行内语义子字段

业务落地时，可以把这两个 probe 替换成真正组件，例如：

- 图标：`r-icon`
- 超链接：业务链接组件，或 `r-link` 配合业务侧 props 装配