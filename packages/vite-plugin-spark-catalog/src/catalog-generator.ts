/**
 * Props 目录 TS 文件生成器
 *
 * 从 json-catalog-generator 生成的 ComponentCatalog（VCM 驱动）
 * 派生出 component-props-catalog.ts，供 spark-ai 包消费。
 *
 * 所有组件 API 数据来自 vue-component-meta 提取的结构化目录，
 * 扁平文本 COMPONENT_PROPS_CATALOG 通过 prompt-generator 的
 * generateLegacyCatalogRecord() 从结构化数据降格生成。
 *
 * @module catalog-generator
 */

import { writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { COMPONENT_CATEGORIES } from './supplement'
import { createLogger } from './utils'
import type { ComponentCatalog } from './component-catalog-schema'
import { generateLegacyCatalogRecord } from './prompt-generator'

const logger = createLogger('spark-catalog')

/* --------------------------------------------------------------------------
 * 类型
 * ----------------------------------------------------------------------- */

export interface CatalogGeneratorOptions {
  /** 输出文件路径（相对于 root），默认 packages/spark-ai/src/component-props-catalog.ts */
  outputPath?: string
  /** 启用详细日志 */
  verbose?: boolean
}

/* --------------------------------------------------------------------------
 * 生成器
 * ----------------------------------------------------------------------- */

/**
 * 从结构化 ComponentCatalog 生成 component-props-catalog.ts 并写入指定路径。
 *
 * @param root       - 项目根目录
 * @param options    - 输出选项
 * @param jsonCatalog - generateJsonCatalog() 返回的结构化目录（SSoT）
 */
export function generatePropsCatalog(
  root: string,
  options: CatalogGeneratorOptions = {},
  jsonCatalog: ComponentCatalog,
): void {
  const {
    outputPath = 'packages/spark-ai/src/component-props-catalog.ts',
    verbose = false,
  } = options

  // 从结构化目录生成扁平文本（与 prompt-generator 共享同一逻辑）
  const legacyRecord = generateLegacyCatalogRecord(jsonCatalog)

  const sortedKeys = Object.keys(legacyRecord).sort()
  if (verbose) {
    logger.info(`📋 结构化目录包含 ${sortedKeys.length} 个组件条目`)
  }

  const catalogLines = sortedKeys.map(key => {
    const value = (legacyRecord[key] ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
    return `  ${JSON.stringify(key)}: \`${value}\``
  })

  // 生成组件注册表（按分类归组）
  const containers: string[] = []
  const fields: string[] = []
  const groups: string[] = []

  for (const key of sortedKeys) {
    const cat = COMPONENT_CATEGORIES[key]
    if (cat === 'meta') continue
    if (cat === 'container') containers.push(key)
    else if (cat === 'group') groups.push(key)
    else if (key.startsWith('r-')) fields.push(key)
  }

  const output = `/**
 * SPARK 组件 Props 目录
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 数据来源：vue-component-meta 类型提取 + supplement.ts 手工补充
 *
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：${new Date().toISOString()}
 * 条目数量：${sortedKeys.length}
 */
import type { ComponentCatalog } from './catalog-types'

/**
 * 结构化组件目录（SSoT）
 *
 * 由 json-catalog-generator 构建，包含完整的 Props 类型、Emits、能力链、平台约束等。
 * design-session / design-prompt 优先从此对象查询，扁平 COMPONENT_PROPS_CATALOG 保留向后兼容。
 */
export const COMPONENT_CATALOG: ComponentCatalog = ${JSON.stringify(jsonCatalog, null, 2)}

export const COMPONENT_PROPS_CATALOG: Record<string, string> = {
${catalogLines.join(',\n')},
}

/**
 * 组件注册表（按分类），供 design-prompt.ts 生成组件注册表 section。
 */
export const COMPONENT_REGISTRY = {
  containers: ${JSON.stringify(containers)} as const,
  fields: ${JSON.stringify(fields)} as const,
  groups: ${JSON.stringify(groups)} as const,
} as const
`

  const absoluteOutputPath = resolve(root, outputPath)
  try {
    writeFileSync(absoluteOutputPath, output, 'utf-8')
    logger.info(`📋 Props 目录已生成: ${relative(root, absoluteOutputPath)} (${sortedKeys.length} 条目)`)
  } catch (e) {
    logger.warn('⚠️ Props 目录生成失败（非致命）:', e)
  }
}
