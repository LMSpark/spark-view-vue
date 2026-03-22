/**
 * 端到端验证：对真实组件文件运行 API 提取 + 差距分析
 *
 * 使用 vue-component-meta (VCM) 提取真实 Vue 组件，验证提取引擎在真实代码上的表现。
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import {
  getOrCreateChecker,
  extractComponentApiVcm,
  extractAllComponentApisVcm,
  generateDiffReport,
  formatDiffReport,
} from '../packages/vite-plugin-spark-catalog/src/index'
import { COMPONENT_PROPS_CATALOG } from '../packages/spark-ai/src/component-props-catalog'

const ROOT = resolve('.')
const FIELDS_DIR = 'packages/spark-component/src/renderer/fields'
const CONTAINERS_DIR = 'packages/spark-component/src/renderer/containers'

const checker = getOrCreateChecker(resolve(ROOT, 'tsconfig.catalog.json'))

describe('End-to-end: real component extraction (VCM)', () => {
  // VCM checker 首次调用需初始化 TypeScript 语言服务，CPU 密集，全量测试时可能超过默认 5s
  it('extracts FieldText.vue correctly', { timeout: 30_000 }, () => {
    const absPath = resolve(ROOT, `${FIELDS_DIR}/FieldText.vue`)
    const api = extractComponentApiVcm(checker, absPath, `${FIELDS_DIR}/FieldText.vue`, 'r-text')

    expect(api).not.toBeNull()
    expect(api!.props.length).toBeGreaterThanOrEqual(4)

    // 已知 props
    const propNames = api!.props.map(p => p.name)
    expect(propNames).toContain('config')
    expect(propNames).toContain('field')
    expect(propNames).toContain('label')
    expect(propNames).toContain('modelValue')

    // 有 update:modelValue emit
    expect(api!.emits.length).toBeGreaterThanOrEqual(1)
    const emitNames = api!.emits.map(e => e.name)
    expect(emitNames).toContain('update:modelValue')
  })

  it('extracts RendererTable.vue correctly', () => {
    const absPath = resolve(ROOT, `${CONTAINERS_DIR}/RendererTable.vue`)
    const api = extractComponentApiVcm(checker, absPath, `${CONTAINERS_DIR}/RendererTable.vue`, 'r-table')

    expect(api).not.toBeNull()
    // RendererTable 有很多 props（>20）
    expect(api!.props.length).toBeGreaterThanOrEqual(20)

    // 已知 capabilities（从源码 AST 提取）
    expect(api!.capabilities.consumes).toContain('PAGE_DATASET')
    expect(api!.capabilities.consumes).toContain('PAGE_SERVICE')
    expect(api!.capabilities.provides).toContain('DATA_SOURCE')
    expect(api!.capabilities.provides).toContain('FIELD_CONTEXT')

    // 有 withDefaults — VCM 也能提取默认值
    const toolbarPosition = api!.props.find(p => p.name === 'toolbarPosition')
    expect(toolbarPosition).toBeDefined()
    expect(toolbarPosition!.default).toBeDefined()
  })

  it('extracts RendererTree.vue correctly', () => {
    const absPath = resolve(ROOT, `${CONTAINERS_DIR}/RendererTree.vue`)
    const api = extractComponentApiVcm(checker, absPath, `${CONTAINERS_DIR}/RendererTree.vue`, 'r-tree')

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
      { skillType: 'r-text', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldText.vue`), relativePath: `${FIELDS_DIR}/FieldText.vue` },
      { skillType: 'r-select', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldSelect.vue`), relativePath: `${FIELDS_DIR}/FieldSelect.vue` },
      { skillType: 'r-checkbox', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldCheckbox.vue`), relativePath: `${FIELDS_DIR}/FieldCheckbox.vue` },
    ]

    const results = extractAllComponentApisVcm(checker, fieldComponents)

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
      { skillType: 'r-text', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldText.vue`), relativePath: `${FIELDS_DIR}/FieldText.vue` },
      { skillType: 'r-select', absolutePath: resolve(ROOT, `${FIELDS_DIR}/FieldSelect.vue`), relativePath: `${FIELDS_DIR}/FieldSelect.vue` },
      { skillType: 'r-table', absolutePath: resolve(ROOT, `${CONTAINERS_DIR}/RendererTable.vue`), relativePath: `${CONTAINERS_DIR}/RendererTable.vue` },
      { skillType: 'r-tree', absolutePath: resolve(ROOT, `${CONTAINERS_DIR}/RendererTree.vue`), relativePath: `${CONTAINERS_DIR}/RendererTree.vue` },
    ]

    const apis = extractAllComponentApisVcm(checker, components)
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
