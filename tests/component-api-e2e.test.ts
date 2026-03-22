/**
 * 端到端验证：对真实组件文件运行 API 提取 + 差距分析
 *
 * 读取项目中的实际 Vue 组件，验证提取引擎在真实代码上的表现。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { extractComponentApi, extractAllComponentApis } from '../packages/vite-plugin-spark-catalog/src/index'
import { generateDiffReport, formatDiffReport } from '../tools/api-diff-report'
import { COMPONENT_PROPS_CATALOG } from '../packages/spark-ai/src/component-props-catalog'

const ROOT = resolve('.')
const FIELDS_DIR = 'packages/spark-component/src/renderer/fields'
const CONTAINERS_DIR = 'packages/spark-component/src/renderer/containers'

function readVue(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8')
}

describe('End-to-end: real component extraction', () => {
  it('extracts FieldText.vue correctly', () => {
    const source = readVue(`${FIELDS_DIR}/FieldText.vue`)
    const api = extractComponentApi(source, `${FIELDS_DIR}/FieldText.vue`, 'r-text')

    expect(api).not.toBeNull()
    expect(api!.props.length).toBeGreaterThanOrEqual(4)

    // 已知 props
    const propNames = api!.props.map(p => p.name)
    expect(propNames).toContain('config')
    expect(propNames).toContain('field')
    expect(propNames).toContain('label')
    expect(propNames).toContain('modelValue')

    // 所有 props 都是可选的（FieldText 没有 required props）
    for (const prop of api!.props) {
      expect(prop.required).toBe(false)
    }

    // 有 update:modelValue emit
    expect(api!.emits.length).toBeGreaterThanOrEqual(1)
    const firstEmit = api!.emits[0]
    expect(firstEmit).toBeDefined()
    expect(firstEmit?.name).toBe('update:modelValue')
  })

  it('extracts RendererTable.vue correctly', () => {
    const source = readVue(`${CONTAINERS_DIR}/RendererTable.vue`)
    const api = extractComponentApi(source, `${CONTAINERS_DIR}/RendererTable.vue`, 'r-table')

    expect(api).not.toBeNull()
    // RendererTable 有很多 props（>20）
    expect(api!.props.length).toBeGreaterThanOrEqual(20)

    // 已知 capabilities
    expect(api!.capabilities.consumes).toContain('PAGE_DATASET')
    expect(api!.capabilities.consumes).toContain('PAGE_SERVICE')
    expect(api!.capabilities.provides).toContain('DATA_SOURCE')
    expect(api!.capabilities.provides).toContain('FIELD_CONTEXT')

    // 有 withDefaults
    const toolbarPosition = api!.props.find(p => p.name === 'toolbarPosition')
    expect(toolbarPosition?.default).toBe("'top'")
  })

  it('extracts RendererTree.vue correctly', () => {
    const source = readVue(`${CONTAINERS_DIR}/RendererTree.vue`)
    const api = extractComponentApi(source, `${CONTAINERS_DIR}/RendererTree.vue`, 'r-tree')

    expect(api).not.toBeNull()

    // 有索引签名
    expect(api!.hasIndexSignature).toBe(true)

    // 已知 capabilities
    expect(api!.capabilities.consumes).toContain('PAGE_DATASET')
    expect(api!.capabilities.provides).toContain('DATA_SOURCE')
    expect(api!.capabilities.provides).toContain('FIELD_CONTEXT')
    expect(api!.capabilities.provides).toContain('CONTEXT_DATA')
  })

  it('batch extracts multiple field components', () => {
    const fieldComponents = [
      { type: 'r-text', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldText.vue`), relativePath: `${FIELDS_DIR}/FieldText.vue` },
      { type: 'r-select', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldSelect.vue`), relativePath: `${FIELDS_DIR}/FieldSelect.vue` },
      { type: 'r-checkbox', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldCheckbox.vue`), relativePath: `${FIELDS_DIR}/FieldCheckbox.vue` },
    ]

    const results = extractAllComponentApis(fieldComponents)

    expect(results).toHaveLength(3)
    for (const api of results) {
      expect(api.props.length).toBeGreaterThan(0)
      // 所有字段组件应该有 field / label / config
      const names = api.props.map(p => p.name)
      expect(names).toContain('field')
      expect(names).toContain('label')
    }
  })
})

describe('End-to-end: diff report with real catalog', () => {
  it('generates meaningful diff report', () => {
    const components = [
      { type: 'r-text', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldText.vue`), relativePath: `${FIELDS_DIR}/FieldText.vue` },
      { type: 'r-select', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldSelect.vue`), relativePath: `${FIELDS_DIR}/FieldSelect.vue` },
      { type: 'r-table', absolutePath: resolve(ROOT, `${CONTAINERS_DIR}/RendererTable.vue`), relativePath: `${CONTAINERS_DIR}/RendererTable.vue` },
      { type: 'r-tree', absolutePath: resolve(ROOT, `${CONTAINERS_DIR}/RendererTree.vue`), relativePath: `${CONTAINERS_DIR}/RendererTree.vue` },
    ]

    const apis = extractAllComponentApis(components)
    const report = generateDiffReport(apis, COMPONENT_PROPS_CATALOG)
    const output = formatDiffReport(report)

    // 应该有报告输出
    expect(output).toContain('Component API Coverage Report')

    // 提取的 API 应该 > 0
    expect(report.componentsWithApi).toBeGreaterThan(0)

    // 检查特定组件
    const rTable = report.components.find(c => c.type === 'r-table')
    expect(rTable).toBeDefined()
    expect(rTable!.hasExtractedApi).toBe(true)
    expect(rTable!.hasCatalogEntry).toBe(true)
  })
})
