/**
 * Vitest 全局 setup —— 配置 DataView.wrapInstance 为 Vue reactive
 *
 * spark-data 本身无框架依赖，但根测试环境通过 Vue mounted 组件验证，
 * 因此需要在测试启动前配置 reactive 包装。
 */
import { reactive } from 'vue'
import { defineComponent, h } from 'vue'
import { config } from '@vue/test-utils'
import { DataView } from '@spark-view/spark-data'

DataView.wrapInstance = (dv) => reactive(dv) as DataView

const GlobalElTableStub = defineComponent({
	name: 'GlobalElTableStub',
	setup(_, { slots, attrs }) {
		return () => h('div', { class: 'el-table-global-stub', ...attrs }, slots['default']?.())
	}
})

const GlobalElTableColumnStub = defineComponent({
	name: 'GlobalElTableColumnStub',
	props: {
		label: String,
		fixed: [Boolean, String],
	},
	setup(props, { slots, attrs }) {
		return () => h('div', {
			class: 'el-table-column-global-stub',
			'data-label': props.label,
			'data-fixed': String(props.fixed ?? ''),
			...attrs,
		}, slots['default']?.({ row: {}, $index: 0 }))
	}
})

const GlobalElButtonStub = defineComponent({
	name: 'GlobalElButtonStub',
	setup(_, { slots, attrs }) {
		return () => h('button', { class: 'el-button-global-stub', ...attrs }, slots['default']?.())
	}
})

const GlobalElTagStub = defineComponent({
	name: 'GlobalElTagStub',
	setup(_, { slots, attrs }) {
		return () => h('span', { class: 'el-tag-global-stub', ...attrs }, slots['default']?.())
	}
})

const GlobalSparkComponentRendererStub = defineComponent({
	name: 'GlobalSparkComponentRendererStub',
	setup(_, { slots, attrs }) {
		return () => h('div', { class: 'spark-component-renderer-global-stub', ...attrs }, slots['default']?.())
	}
})

const stubs = config.global.stubs ?? {}
if (stubs['el-table'] === undefined) {
	stubs['el-table'] = GlobalElTableStub
}
if (stubs['el-table-column'] === undefined) {
	stubs['el-table-column'] = GlobalElTableColumnStub
}
if (stubs['el-button'] === undefined) {
	stubs['el-button'] = GlobalElButtonStub
}
if (stubs['el-tag'] === undefined) {
	stubs['el-tag'] = GlobalElTagStub
}
if (stubs['SparkComponentRenderer'] === undefined) {
	stubs['SparkComponentRenderer'] = GlobalSparkComponentRendererStub
}
if (stubs['spark-component-renderer'] === undefined) {
	stubs['spark-component-renderer'] = GlobalSparkComponentRendererStub
}
config.global.stubs = stubs

const originalGetComputedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = ((element: Element, pseudoElement?: string | null): CSSStyleDeclaration => {
	if (typeof pseudoElement === 'string' && pseudoElement.trim() !== '') {
		return originalGetComputedStyle(element)
	}
	return originalGetComputedStyle(element)
}) as typeof window.getComputedStyle
