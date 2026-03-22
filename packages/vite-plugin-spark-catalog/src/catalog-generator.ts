/**
 * Props 目录生成核心逻辑
 *
 * 扫描 renderer 字段/容器组件 + feature 组件，AST 提取 Props JSDoc，
 * 与 component-props-supplement.ts 合并后生成 component-props-catalog.ts。
 *
 * @module catalog-generator
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative, basename } from 'node:path'
import { globSync } from 'glob'
import { extractComponentApi } from './extract-component-api'
import type { ComponentApiDescriptor } from './extract-component-api'
import {
  CATALOG_OVERRIDES,
  CATALOG_ADDENDUMS,
  COMPONENT_CATEGORIES,
} from './supplement'
import {
  toKebabCase,
  inferSkillType,
  buildImplicitSkillDescription,
  parseSkillMeta,
  createLogger,
} from './utils'

const logger = createLogger('spark-catalog')

/* --------------------------------------------------------------------------
 * 类型
 * ----------------------------------------------------------------------- */

export interface ScannedComponent {
  absolutePath: string
  relativePath: string
  /** kebab-case 注册名 */
  skillType: string
  skillDescription: string
}

export interface CatalogGeneratorOptions {
  /** Feature 组件的 glob 扫描模式（相对于 root） */
  featurePatterns?: string[]
  /** 排除模式 */
  exclude?: string[]
  /** 输出文件路径（相对于 root），默认 packages/spark-ai/src/component-props-catalog.ts */
  outputPath?: string
  /** 启用详细日志 */
  verbose?: boolean
}

/* --------------------------------------------------------------------------
 * 生成器
 * ----------------------------------------------------------------------- */

/**
 * 扫描 renderer 容器/字段组件（固定路径）
 */
function scanRendererComponents(root: string): ScannedComponent[] {
  const extraPatterns = [
    './packages/spark-component/src/renderer/containers/*.vue',
    './packages/spark-component/src/renderer/fields/*.vue',
  ]

  const results: ScannedComponent[] = []

  for (const pattern of extraPatterns) {
    const files = globSync(pattern, { cwd: root, absolute: false })
    for (const file of files) {
      const absolutePath = resolve(root, file)
      if (!existsSync(absolutePath)) continue

      const fileName = basename(file, '.vue')
      const fallbackType = toKebabCase(fileName)
      const skillType = inferSkillType(absolutePath, fallbackType)
      if (skillType === null) continue // 跳过 Scope 内部组件

      // 跳过内部实现组件
      if (fileName === 'FieldContextRenderer') continue

      const skillDescription = buildImplicitSkillDescription(absolutePath, skillType)
      results.push({ absolutePath, relativePath: file, skillType, skillDescription })
    }
  }

  return results
}

/**
 * 扫描 feature / 业务组件
 */
function scanFeatureComponents(
  root: string,
  patterns: string[],
  exclude: string[],
): ScannedComponent[] {
  const results: ScannedComponent[] = []

  for (const pattern of patterns) {
    const files = globSync(pattern, {
      cwd: root,
      absolute: false,
      ignore: exclude,
    })

    for (const file of files) {
      const absolutePath = resolve(root, file)
      if (!existsSync(absolutePath)) continue

      const fileName = basename(file, '.vue')
      const kebabName = toKebabCase(fileName)

      const meta = parseSkillMeta(absolutePath, kebabName)
      if (!meta) continue

      results.push({
        absolutePath,
        relativePath: file,
        skillType: meta.type,
        skillDescription: meta.description,
      })
    }
  }

  return results
}

/**
 * 格式化 AST 提取的 Props 为 AI 友好文本
 */
function formatAstPropsEntry(
  skillType: string,
  description: string,
  api: ComponentApiDescriptor,
): string {
  const lines: string[] = [`**${skillType}** — ${description}`]

  // 过滤掉框架内部 Props
  const INTERNAL_PROPS = new Set(['config', 'sparkChildren'])
  const visibleProps = api.props.filter(p => !INTERNAL_PROPS.has(p.name))

  for (const prop of visibleProps) {
    const opt = prop.required ? '' : '?'
    const desc = prop.description ? ` — ${prop.description}` : ''
    const def = prop.default ? ` (默认 ${prop.default})` : ''
    lines.push(`${prop.name}${opt}: ${prop.type}${desc}${def}`)
  }

  // 能力链
  const { consumes, provides } = api.capabilities
  if (consumes.length > 0 || provides.length > 0) {
    lines.push('')
    lines.push('【能力链】')
    if (consumes.length > 0) lines.push(`consumes: ${consumes.join(', ')}`)
    if (provides.length > 0) lines.push(`provides: ${provides.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * 生成 component-props-catalog.ts 并写入指定路径
 */
export function generatePropsCatalog(root: string, options: CatalogGeneratorOptions = {}): void {
  const {
    featurePatterns = [],
    exclude = [],
    outputPath = 'packages/spark-ai/src/component-props-catalog.ts',
    verbose = false,
  } = options

  // 1. 扫描 renderer 组件
  const renderers = scanRendererComponents(root)
  if (verbose) {
    logger.info(`🔬 Renderer 组件: ${renderers.length} 个`)
  }

  // 2. AST 提取字段组件 Props
  const astEntries: Record<string, string> = {}

  for (const comp of renderers) {
    // 容器组件用 CATALOG_OVERRIDES，跳过 AST
    if (comp.skillType in CATALOG_OVERRIDES) continue

    try {
      const source = readFileSync(comp.absolutePath, 'utf-8')
      const api = extractComponentApi(source, comp.relativePath, comp.skillType)
      if (!api) continue

      astEntries[comp.skillType] = formatAstPropsEntry(
        comp.skillType,
        comp.skillDescription,
        api,
      )
    } catch {
      // 跳过无法读取的文件
    }
  }

  // 3. Feature 组件也扫描
  const features = scanFeatureComponents(root, featurePatterns, exclude)
  if (verbose) {
    logger.info(`🔬 Feature 组件: ${features.length} 个`)
  }

  for (const comp of features) {
    if (comp.skillType in CATALOG_OVERRIDES) continue
    if (comp.skillType in astEntries) continue // 已有 renderer 条目

    try {
      const source = readFileSync(comp.absolutePath, 'utf-8')
      const api = extractComponentApi(source, comp.relativePath, comp.skillType)
      if (!api) continue

      astEntries[comp.skillType] = formatAstPropsEntry(
        comp.skillType,
        comp.skillDescription,
        api,
      )
    } catch {
      // 跳过
    }
  }

  // 4. 合并：overrides > AST + addendums
  const merged: Record<string, string> = { ...CATALOG_OVERRIDES }

  for (const [key, astEntry] of Object.entries(astEntries)) {
    const addendum = CATALOG_ADDENDUMS[key]
    merged[key] = addendum ? `${astEntry}\n\n${addendum}` : astEntry
  }

  // 添加纯 addendum 条目（防御性处理）
  for (const [key, addendum] of Object.entries(CATALOG_ADDENDUMS)) {
    if (!(key in merged)) {
      merged[key] = addendum
    }
  }

  // 5. 按 key 排序
  const sortedKeys = Object.keys(merged).sort()
  const catalogLines = sortedKeys.map(key => {
    const value = (merged[key] ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$')
    return `  ${JSON.stringify(key)}: \`${value}\``
  })

  // 6. 生成组件注册表（按分类归组）
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

  // 7. 输出文件
  const output = `/**
 * SPARK 组件 Props 目录
 *
 * ⚠️ 自动生成 — 请勿手动编辑
 *
 * 由 vite-plugin-spark-catalog 在 build / dev 时生成。
 * 数据来源：Vue SFC Props JSDoc（AST 提取）+ supplement.ts（手工补充）
 *
 * 重新生成：pnpm run dev 或 pnpm run build
 * 生成时间：${new Date().toISOString()}
 * 条目数量：${sortedKeys.length}（AST 字段: ${Object.keys(astEntries).length}, 手工容器/概念: ${Object.keys(CATALOG_OVERRIDES).length}）
 */
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
