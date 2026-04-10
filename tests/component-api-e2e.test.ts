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
import catalogJson from '../packages/spark-ai/src/catalog/component-catalog.json'
import type { ComponentCatalog } from '../packages/spark-ai/src/catalog/types'

const COMPONENT_CATALOG = catalogJson as ComponentCatalog

const ROOT = resolve('.')
const FIELD_DIR = 'packages/spark-component/src/components/fields/data-components'
const CONTAINER_DIR = 'packages/spark-component/src/components/containers/data-components'
const TABLE_COMPONENT = `${CONTAINER_DIR}/RendererTable/RendererTable.vue`
const TREE_COMPONENT = `${CONTAINER_DIR}/RendererTree/RendererTree.vue`

const checker = getOrCreateChecker(resolve(ROOT, 'tsconfig.catalog.json'))
const diffCatalog = Object.fromEntries(
  Object.entries(COMPONENT_CATALOG.components).map(([type, entry]) => {
    const propLines = entry.props.map(prop => `${prop.name}: ${prop.description ?? ''}`)
    const emitLines = (entry.emits ?? []).map(emit => `emit ${emit.name}`)
    const text = [entry.description ?? '', entry.notes ?? '', ...propLines, ...emitLines]
      .filter(Boolean)
      .join('\n')
    return [type, text]
  }),
)

describe('End-to-end: real component extraction (VCM)', () => {
  // VCM checker 首次调用需初始化 TypeScript 语言服务，CPU 密集，全量测试时可能超过默认 5s
  it('extracts FieldText.vue correctly', { timeout: 30_000 }, () => {
    const absPath = resolve(ROOT, `${FIELD_DIR}/FieldText.vue`)
    const api = extractComponentApiVcm(checker, absPath, `${FIELD_DIR}/FieldText.vue`, 'r-text')

    expect(api).not.toBeNull()
    expect(api!.props.length).toBeGreaterThanOrEqual(4)

    // 已知 props
    const propNames = api!.props.map(p => p.name)
    expect(propNames).toContain('field')
    expect(propNames).toContain('label')
    expect(propNames).toContain('modelValue')

    // 有 update:modelValue emit
    expect(api!.emits.length).toBeGreaterThanOrEqual(1)
    const emitNames = api!.emits.map(e => e.name)
    expect(emitNames).toContain('update:modelValue')
  })

  it('extracts RendererTable.vue correctly', () => {
    const absPath = resolve(ROOT, TABLE_COMPONENT)
    const api = extractComponentApiVcm(checker, absPath, TABLE_COMPONENT, 'r-table')

    expect(api).not.toBeNull()
    // RendererTable 公开 API 已收敛到 children 提升模型，旧的扁平 action/filter props 不应再暴露
    expect(api!.props.length).toBeGreaterThanOrEqual(5)

    const propNames = api!.props.map(p => p.name)
    expect(propNames).not.toContain('filterColumns')
    expect(propNames).not.toContain('rowActions')
    expect(propNames).not.toContain('rowActionsPosition')
    expect(propNames).not.toContain('rowActionsLabel')
  })

  it('extracts RendererTree.vue correctly', () => {
    const absPath = resolve(ROOT, TREE_COMPONENT)
    const api = extractComponentApiVcm(checker, absPath, TREE_COMPONENT, 'r-tree')

    expect(api).not.toBeNull()

    // 索引签名已移除（VCM 修复）
    expect(api!.hasIndexSignature).toBe(false)
  })

  it('batch extracts multiple field components', () => {
    const fieldComponents = [
      { skillType: 'r-text', absolutePath: resolve(ROOT, `${FIELD_DIR}/FieldText.vue`), relativePath: `${FIELD_DIR}/FieldText.vue` },
      { skillType: 'r-select', absolutePath: resolve(ROOT, `${FIELD_DIR}/FieldSelect.vue`), relativePath: `${FIELD_DIR}/FieldSelect.vue` },
      { skillType: 'r-checkbox', absolutePath: resolve(ROOT, `${FIELD_DIR}/FieldCheckbox.vue`), relativePath: `${FIELD_DIR}/FieldCheckbox.vue` },
    ]

    const results = extractAllComponentApisVcm(checker, fieldComponents)

    expect(results).toHaveLength(3)
    for (const api of results) {
      expect(api.props.length).toBeGreaterThan(0)
      // 所有字段组件应该有 field / label
      const names = api.props.map(p => p.name)
      expect(names).toContain('field')
      expect(names).toContain('label')
    }
  })
})

describe('End-to-end: diff report with real catalog', () => {
  it('generates meaningful diff report', () => {
    const components = [
      { skillType: 'r-text', absolutePath: resolve(ROOT, `${FIELD_DIR}/FieldText.vue`), relativePath: `${FIELD_DIR}/FieldText.vue` },
      { skillType: 'r-select', absolutePath: resolve(ROOT, `${FIELD_DIR}/FieldSelect.vue`), relativePath: `${FIELD_DIR}/FieldSelect.vue` },
      { skillType: 'r-table', absolutePath: resolve(ROOT, TABLE_COMPONENT), relativePath: TABLE_COMPONENT },
      { skillType: 'r-tree', absolutePath: resolve(ROOT, TREE_COMPONENT), relativePath: TREE_COMPONENT },
    ]

    const apis = extractAllComponentApisVcm(checker, components)
    const report = generateDiffReport(apis, diffCatalog)
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
