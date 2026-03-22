/**
 * SFC Component API Extraction Engine — 单元测试
 *
 * 使用内联 Vue SFC 字符串模拟真实组件模式，验证提取引擎的正确性。
 */

import { describe, it, expect } from 'vitest'
import { extractComponentApi } from '../packages/vite-plugin-spark-catalog/src/index'
import type { ComponentApiDescriptor } from '../packages/vite-plugin-spark-catalog/src/index'

/* ==========================================================================
 * 辅助
 * ========================================================================== */

function sfc(script: string): string {
  return `<script setup lang="ts">\n${script}\n</script>\n<template><div /></template>\n`
}

function extract(script: string, type = 'test-comp'): ComponentApiDescriptor | null {
  return extractComponentApi(sfc(script), 'test.vue', type)
}

/* ==========================================================================
 * Props 提取
 * ========================================================================== */

describe('Props extraction', () => {
  it('extracts simple interface Props', () => {
    const result = extract(`
interface Props {
  field?: string
  label: string
  width?: number
}
const props = defineProps<Props>()
`)
    expect(result).not.toBeNull()
    expect(result!.props).toHaveLength(3)
    expect(result!.props[0]).toMatchObject({ name: 'field', type: 'string', required: false })
    expect(result!.props[1]).toMatchObject({ name: 'label', type: 'string', required: true })
    expect(result!.props[2]).toMatchObject({ name: 'width', type: 'number', required: false })
  })

  it('extracts JSDoc descriptions from Props members', () => {
    const result = extract(`
interface Props {
  /** SPARK 配置驱动 */
  config?: any
  /** DataKey 格式：tableName@field */
  dataKey?: string
}
const props = defineProps<Props>()
`)
  const configProp = result!.props[0]
  const dataKeyProp = result!.props[1]
  expect(configProp).toBeDefined()
  expect(dataKeyProp).toBeDefined()
  expect(configProp?.description).toBe('SPARK 配置驱动')
  expect(dataKeyProp?.description).toBe('DataKey 格式：tableName@field')
  })

  it('extracts complex types as string', () => {
    const result = extract(`
interface Props {
  align?: 'left' | 'center' | 'right'
  data?: TreeNode[]
  onClick?: (data: TreeNode, node: ElTreeNode) => void
}
const props = defineProps<Props>()
`)
  const alignProp = result!.props[0]
  const dataProp = result!.props[1]
  const onClickProp = result!.props[2]
  expect(alignProp).toBeDefined()
  expect(dataProp).toBeDefined()
  expect(onClickProp).toBeDefined()
  expect(alignProp?.type).toBe("'left' | 'center' | 'right'")
  expect(dataProp?.type).toBe('TreeNode[]')
  expect(onClickProp?.type).toBe('(data: TreeNode, node: ElTreeNode) => void')
  })

  it('detects index signature in Props', () => {
    const result = extract(`
interface Props {
  config?: any
  [key: string]: unknown
}
const props = defineProps<Props>()
`)
    expect(result!.hasIndexSignature).toBe(true)
  })

  it('detects no index signature when absent', () => {
    const result = extract(`
interface Props {
  label?: string
}
const props = defineProps<Props>()
`)
    expect(result!.hasIndexSignature).toBe(false)
  })

  it('extracts inline defineProps type literal', () => {
    const result = extract(`
const props = defineProps<{
  name: string
  age?: number
}>()
`)
    expect(result!.props).toHaveLength(2)
    expect(result!.props[0]).toMatchObject({ name: 'name', type: 'string', required: true })
    expect(result!.props[1]).toMatchObject({ name: 'age', type: 'number', required: false })
  })
})

/* ==========================================================================
 * withDefaults 提取
 * ========================================================================== */

describe('withDefaults extraction', () => {
  it('applies simple defaults', () => {
    const result = extract(`
interface Props {
  label?: string
  size?: number
  visible?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  label: '默认',
  size: 12,
  visible: false,
})
`)
    expect(result!.props[0]).toMatchObject({ name: 'label', default: "'默认'" })
    expect(result!.props[1]).toMatchObject({ name: 'size', default: '12' })
    expect(result!.props[2]).toMatchObject({ name: 'visible', default: 'false' })
  })

  it('applies arrow function defaults', () => {
    const result = extract(`
interface Props {
  items?: string[]
  options?: Record<string, unknown>
}
const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  options: () => ({}),
})
`)
    const itemsProp = result!.props[0]
    const optionsProp = result!.props[1]
    expect(itemsProp).toBeDefined()
    expect(optionsProp).toBeDefined()
    expect(itemsProp?.default).toBe('() => []')
    expect(optionsProp?.default).toBe('() => ({})')
  })

  it('does not set defaults for props without default', () => {
    const result = extract(`
interface Props {
  field?: string
  label?: string
}
const props = withDefaults(defineProps<Props>(), {
  label: '标签',
})
`)
    const fieldProp = result!.props[0]
    const labelProp = result!.props[1]
    expect(fieldProp).toBeDefined()
    expect(labelProp).toBeDefined()
    expect(fieldProp?.default).toBeUndefined()
    expect(labelProp?.default).toBe("'标签'")
  })
})

/* ==========================================================================
 * Emits 提取
 * ========================================================================== */

describe('Emits extraction', () => {
  it('extracts tuple-style emits', () => {
    const result = extract(`
interface Props {}
const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
`)
    expect(result!.emits).toHaveLength(1)
    expect(result!.emits[0]).toMatchObject({
      name: 'update:modelValue',
      payload: [{ name: 'value', type: 'string' }],
    })
  })

  it('extracts call-signature-style emits', () => {
    const result = extract(`
interface Props {}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'change', checked: boolean): void
  (e: 'input', value: string): void
}>()
`)
    expect(result!.emits).toHaveLength(2)
    expect(result!.emits[0]).toMatchObject({
      name: 'change',
      payload: [{ name: 'checked', type: 'boolean' }],
    })
    expect(result!.emits[1]).toMatchObject({
      name: 'input',
      payload: [{ name: 'value', type: 'string' }],
    })
  })

  it('extracts multi-payload emits', () => {
    const result = extract(`
interface Props {}
const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string, oldValue: string]
}>()
`)
    const updateEmit = result!.emits[0]
    expect(updateEmit).toBeDefined()
    expect(updateEmit?.payload).toHaveLength(2)
    expect(updateEmit?.payload[0]).toMatchObject({ name: 'value', type: 'string' })
    expect(updateEmit?.payload[1]).toMatchObject({ name: 'oldValue', type: 'string' })
  })

  it('returns empty emits when no defineEmits', () => {
    const result = extract(`
interface Props { field?: string }
const props = defineProps<Props>()
`)
    expect(result!.emits).toHaveLength(0)
  })
})

/* ==========================================================================
 * Capabilities 提取
 * ========================================================================== */

describe('Capabilities extraction', () => {
  it('extracts consume calls', () => {
    const result = extract(`
interface Props { config?: any }
const props = defineProps<Props>()
const { consume, provide: sparkProvide } = useSparkComponent(props.config)
const pageDataSet = consume(PAGE_DATASET)
const pageService = consume(PAGE_SERVICE)
`)
    expect(result!.capabilities.consumes).toContain('PAGE_DATASET')
    expect(result!.capabilities.consumes).toContain('PAGE_SERVICE')
  })

  it('extracts sparkProvide calls', () => {
    const result = extract(`
interface Props { config?: any }
const props = defineProps<Props>()
const { provide: sparkProvide } = useSparkComponent(props.config)
sparkProvide(DATA_SOURCE, someView)
sparkProvide(FIELD_CONTEXT, 'table')
sparkProvide(TABLE_API, tableApi)
`)
    expect(result!.capabilities.provides).toContain('DATA_SOURCE')
    expect(result!.capabilities.provides).toContain('FIELD_CONTEXT')
    expect(result!.capabilities.provides).toContain('TABLE_API')
  })

  it('deduplicates capability keys', () => {
    const result = extract(`
interface Props { config?: any }
const props = defineProps<Props>()
const { consume, provide: sparkProvide } = useSparkComponent(props.config)
sparkProvide(DATA_SOURCE, view1)
const fn = (v: any) => sparkProvide(DATA_SOURCE, v)
`)
    expect(result!.capabilities.provides.filter(k => k === 'DATA_SOURCE')).toHaveLength(1)
  })

  it('extracts nested provide inside callbacks', () => {
    const result = extract(`
interface Props { config?: any }
const props = defineProps<Props>()
const { consume, provide: sparkProvide } = useSparkComponent(props.config)
const pageDataSet = consume(PAGE_DATASET)
useContainerDataSource({
  provideDataSource: view => sparkProvide(DATA_SOURCE, view),
})
sparkProvide(FIELD_CONTEXT, 'tree')
`)
    expect(result!.capabilities.consumes).toContain('PAGE_DATASET')
    expect(result!.capabilities.provides).toContain('DATA_SOURCE')
    expect(result!.capabilities.provides).toContain('FIELD_CONTEXT')
  })

  it('ignores non-capability provide (Vue provide with string keys)', () => {
    const result = extract(`
interface Props {}
const props = defineProps<Props>()
provide('some-string-key', value)
`)
    // provide with string literal is Vue provide, not SPARK
    expect(result!.capabilities.provides).toHaveLength(0)
  })
})

/* ==========================================================================
 * 完整组件模式（模拟真实组件）
 * ========================================================================== */

describe('Real component patterns', () => {
  it('FieldText pattern: simple props + emits', () => {
    const result = extract(`
import type { SparkNode } from '../_pkg'

interface Props {
  config?: SparkNode
  field?: string
  label?: string
  width?: number
  sparkChildren?: SparkNode[]
  modelValue?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
`, 'r-text')

    expect(result!.type).toBe('r-text')
    expect(result!.props).toHaveLength(6)
    expect(result!.props.find(p => p.name === 'config')?.type).toBe('SparkNode')
    expect(result!.props.find(p => p.name === 'modelValue')?.required).toBe(false)
    expect(result!.emits).toHaveLength(1)
  const firstEmit = result!.emits[0]
  expect(firstEmit).toBeDefined()
  expect(firstEmit?.name).toBe('update:modelValue')
    expect(result!.capabilities.consumes).toHaveLength(0)
    expect(result!.capabilities.provides).toHaveLength(0)
  })

  it('FieldSelect pattern: withDefaults', () => {
    const result = extract(`
interface Props {
  config?: any
  field?: string
  label?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
  modelValue?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
})
const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()
`, 'r-select')

    expect(result!.type).toBe('r-select')
    expect(result!.props.find(p => p.name === 'placeholder')?.default).toBe("'请选择'")
    expect(result!.props.find(p => p.name === 'clearable')?.default).toBe('true')
    expect(result!.props.find(p => p.name === 'filterable')?.default).toBe('false')
  const firstEmit = result!.emits[0]
  expect(firstEmit).toBeDefined()
  expect(firstEmit?.payload[0]).toBeDefined()
  expect(firstEmit?.payload[0]?.type).toBe('string | number')
  })

  it('RendererTable pattern: consume + provide', () => {
    const result = extract(`
interface Props {
  config?: any
  dataKey?: string
  sparkChildren?: any[]
  toolbar?: any[]
  toolbarPosition?: string
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
})

const { context, consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-table' }
)
const pageDataSet = consume(PAGE_DATASET)
const pageService = consume(PAGE_SERVICE)
const pageComponentRegistry = consume(PAGE_COMPONENT_REGISTRY)
const moduleContextCapability = consume(MODULE_CONTEXT)

sparkProvide(DATA_SOURCE, tableApi)
sparkProvide(TABLE_API, tableApi)
sparkProvide(FIELD_CONTEXT, 'table')
`, 'r-table')

    expect(result!.capabilities.consumes).toEqual(
      expect.arrayContaining(['PAGE_DATASET', 'PAGE_SERVICE', 'PAGE_COMPONENT_REGISTRY', 'MODULE_CONTEXT'])
    )
    expect(result!.capabilities.provides).toEqual(
      expect.arrayContaining(['DATA_SOURCE', 'TABLE_API', 'FIELD_CONTEXT'])
    )
  })

  it('RendererTree pattern: index signature + nested provide', () => {
    const result = extract(`
interface Props {
  config?: any
  dataKey?: string
  sparkChildren?: any[]
  data?: TreeNode[]
  dataSource?: any
  onNodeClick?: (data: TreeNode, node: ElTreeNode) => void
  [key: string]: unknown
}

const props = defineProps<Props>()
const { consume, provide: sparkProvide } = useSparkComponent(
  props.config ?? { type: 'r-tree' }
)
const pageDataSet = consume(PAGE_DATASET)

useContainerDataSource({
  provideDataSource: source => sparkProvide(DATA_SOURCE, source),
})
sparkProvide(FIELD_CONTEXT, 'tree')
sparkProvide(CONTEXT_DATA, {})
`, 'r-tree')

    expect(result!.hasIndexSignature).toBe(true)
    expect(result!.capabilities.consumes).toContain('PAGE_DATASET')
    expect(result!.capabilities.provides).toEqual(
      expect.arrayContaining(['DATA_SOURCE', 'FIELD_CONTEXT', 'CONTEXT_DATA'])
    )
    expect(result!.props.find(p => p.name === 'onNodeClick')?.type).toContain('TreeNode')
  })
})

/* ==========================================================================
 * 边界情况
 * ========================================================================== */

describe('Edge cases', () => {
  it('returns null for SFC without <script setup>', () => {
    const result = extractComponentApi(
      '<template><div /></template>\n<script>\nexport default {}\n</script>',
      'test.vue',
      'test',
    )
    expect(result).toBeNull()
  })

  it('handles empty Props interface', () => {
    const result = extract(`
interface Props {}
const props = defineProps<Props>()
`)
    expect(result!.props).toHaveLength(0)
    expect(result!.hasIndexSignature).toBe(false)
  })

  it('handles SFC with only template (no script)', () => {
    const result = extractComponentApi(
      '<template><div>hello</div></template>',
      'test.vue',
      'test',
    )
    expect(result).toBeNull()
  })

  it('assigns component type and filePath', () => {
    const result = extract(`
interface Props { field?: string }
const props = defineProps<Props>()
`, 'my-component')
    expect(result!.type).toBe('my-component')
    expect(result!.filePath).toBe('test.vue')
  })
})
