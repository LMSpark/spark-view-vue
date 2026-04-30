/**
 * 端到端验证：对真实组件文件运行 API 提取
 *
 * 使用 vue-component-meta (VCM) 提取真实 Vue 组件，验证提取引擎在真实代码上的表现。
 */

import { describe, it, expect } from 'vitest'
import { resolve } from 'path'
import {
  getOrCreateChecker,
  extractComponentApiVcm,
  extractAllComponentApisVcm,
} from '../packages/vite-plugin-spark-catalog/src/index'

const ROOT = resolve('.')
const FIELD_DIR = 'packages/spark-component/src/components/fields/data-components'
const checker = getOrCreateChecker(resolve(ROOT, 'tsconfig.catalog.json'))

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

    // 字段组件统一对外暴露 update:modelValue
    expect(api!.emits.length).toBeGreaterThanOrEqual(1)
    const emitNames = api!.emits.map(e => e.name)
    expect(emitNames).toContain('update:modelValue')
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

  it('supports includeGlobalProps option', () => {
    const absPath = resolve(ROOT, `${FIELD_DIR}/FieldText.vue`)

    const apiDefault = extractComponentApiVcm(checker, absPath, `${FIELD_DIR}/FieldText.vue`, 'r-text')
    const apiWithGlobal = extractComponentApiVcm(
      checker,
      absPath,
      `${FIELD_DIR}/FieldText.vue`,
      'r-text',
      { includeGlobalProps: true },
    )

    expect(apiDefault).not.toBeNull()
    expect(apiWithGlobal).not.toBeNull()

    const defaultPropNames = apiDefault!.props.map(p => p.name)
    const withGlobalPropNames = apiWithGlobal!.props.map(p => p.name)

    expect(defaultPropNames).not.toContain('class')
    expect(withGlobalPropNames).toContain('class')
    expect(withGlobalPropNames).toContain('style')
  })

  it('supports VCM checker options parameter', { timeout: 30_000 }, () => {
    const tsconfigPath = resolve(ROOT, 'tsconfig.catalog.json')
    const checkerWithRawType = getOrCreateChecker(tsconfigPath, {
      rawType: true,
      schema: true,
      noDeclarations: true,
    })
    const checkerWithRawTypeAgain = getOrCreateChecker(tsconfigPath, {
      rawType: true,
      schema: true,
      noDeclarations: true,
    })

    expect(checkerWithRawTypeAgain).toBe(checkerWithRawType)
    expect(checkerWithRawType).not.toBe(checker)

    const absPath = resolve(ROOT, `${FIELD_DIR}/FieldText.vue`)
    const api = extractComponentApiVcm(checkerWithRawType, absPath, `${FIELD_DIR}/FieldText.vue`, 'r-text')
    expect(api).not.toBeNull()
    expect(api!.props.length).toBeGreaterThan(0)
  })
})
