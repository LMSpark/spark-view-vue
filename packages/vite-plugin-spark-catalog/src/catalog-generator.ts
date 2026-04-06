/**
 * AI 配置目录 TS 文件生成器
 *
 * 从 json-catalog-generator 生成的 ComponentCatalog（VCM 驱动）
 * 派生出供 spark-ai 包消费的查询目录：
 * - COMPONENT_CATALOG：结构化精简目录
 * - COMPONENT_DIRECTORY_DESCRIBE：供 session.describe 合并返回的组件目录摘要
 * - COMPONENT_SPEC_BY_TYPE：供 actionSpec 式单项查询的结构化组件规格
 * - COMPONENT_DIRECTORY_PROMPT：组件目录索引
 * - COMPONENT_PROMPT_BY_TYPE：按组件 type 建立的完整参数目录
 *
 * 这里不再复制完整 JSON SSoT，也不再生成扁平文本 COMPONENT_PROPS_CATALOG。
 * 只保留 AI 生成配置真正需要的子集：registry / components(props, rootFields,
 * emits, binding, notes) / constraints。
 *
 * @module catalog-generator
 */

import { writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { createLogger } from './utils'
import type { ComponentCatalog as FullComponentCatalog, ComponentEntry as FullComponentEntry, PropEntry as FullPropEntry } from './component-catalog-schema'
import { generateComponentDescribeCatalog, generateComponentQueryCatalog } from './prompt-generator'

const logger = createLogger('spark-catalog')

/* --------------------------------------------------------------------------
 * 类型
 * ----------------------------------------------------------------------- */

export interface CatalogGeneratorOptions {
  /** 输出文件路径（相对于 root），默认 packages/spark-ai/src/catalog/component-props-catalog.ts */
  outputPath?: string
  /** 启用详细日志 */
  verbose?: boolean
}

type AiPropEntry = Pick<FullPropEntry, 'name' | 'type' | 'required'> & {
  default?: string
  description?: string
}

type AiComponentEntry = Pick<FullComponentEntry, 'type' | 'category' | 'description'> & {
  props: AiPropEntry[]
  emits?: FullComponentEntry['emits']
  rootFields?: FullComponentEntry['rootFields']
  notes?: string
  binding?: FullComponentEntry['binding']
}

type AiComponentCatalog = {
  version: FullComponentCatalog['version']
  buildTime: FullComponentCatalog['buildTime']
  componentCount: FullComponentCatalog['componentCount']
  registry: FullComponentCatalog['registry']
  components: Record<string, AiComponentEntry>
  constraints: FullComponentCatalog['constraints']
}

function toAiPropEntry(prop: FullPropEntry): AiPropEntry {
  return {
    name: prop.name,
    type: prop.type,
    required: prop.required,
    ...(prop.default !== undefined ? { default: prop.default } : {}),
    ...(prop.description !== undefined ? { description: prop.description } : {}),
  }
}

function toAiComponentEntry(entry: FullComponentEntry): AiComponentEntry {
  return {
    type: entry.type,
    category: entry.category,
    description: entry.description,
    props: entry.props.map(toAiPropEntry),
    ...(entry.emits.length > 0 ? { emits: entry.emits } : {}),
    ...(entry.rootFields !== undefined && entry.rootFields.length > 0 ? { rootFields: entry.rootFields } : {}),
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
    ...(entry.binding !== undefined ? { binding: entry.binding } : {}),
  }
}

function toAiComponentCatalog(jsonCatalog: FullComponentCatalog): AiComponentCatalog {
  return {
    version: jsonCatalog.version,
    buildTime: jsonCatalog.buildTime,
    componentCount: jsonCatalog.componentCount,
    registry: jsonCatalog.registry,
    components: Object.fromEntries(
      Object.entries(jsonCatalog.components).map(([key, entry]) => [key, toAiComponentEntry(entry)]),
    ),
    constraints: jsonCatalog.constraints,
  }
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
  jsonCatalog: FullComponentCatalog,
): void {
  const {
    outputPath = 'packages/spark-ai/src/catalog/component-props-catalog.ts',
    verbose = false,
  } = options

  const aiCatalog = toAiComponentCatalog(jsonCatalog)
  const describeCatalog = generateComponentDescribeCatalog(jsonCatalog)
  const queryCatalog = generateComponentQueryCatalog(jsonCatalog)
  const sortedKeys = Object.keys(aiCatalog.components).sort()
  if (verbose) {
    logger.info(`📋 AI 配置目录包含 ${sortedKeys.length} 个组件条目`)
  }

  const output = `/**
 * SPARK AI 配置组件目录
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
import type { ComponentCatalog } from './types'

/**
 * AI 配置目录（精简版）
 *
 * 仅保留 AI 生成配置相关字段：registry / components(props, rootFields, emits,
 * binding, notes) / constraints。
 *
 * 完整 SSoT 位于 component-catalog.json；此文件专供 spark-ai 运行时查询，避免把
 * sharedTypes、schema、slots、exposed、source 等非配置信息带进模型上下文。
 */
export const COMPONENT_CATALOG: ComponentCatalog = ${JSON.stringify(aiCatalog, null, 2)}

/**
 * 供 session.describe 合并返回的组件目录摘要。
 */
export const COMPONENT_DIRECTORY_DESCRIBE = ${JSON.stringify(describeCatalog.directory, null, 2)}

/**
 * 供 actionSpec 式按组件 type 精确查询的结构化规格表。
 */
export const COMPONENT_SPEC_BY_TYPE = ${JSON.stringify(describeCatalog.specByType, null, 2)}

/**
 * 按组件 type 获取结构化规格。
 */
export function getComponentSpec(type: string): Record<string, unknown> | null {
  return (COMPONENT_SPEC_BY_TYPE as Record<string, Record<string, unknown>>)[type] ?? null
}

/**
 * 供 AI 先做“有哪些组件”判断的组件目录。
 */
export const COMPONENT_DIRECTORY_PROMPT = ${JSON.stringify(queryCatalog.directoryPrompt)}

/**
 * 供 AI 按组件 type 精确查询的参数目录。
 */
export const COMPONENT_PROMPT_BY_TYPE: Record<string, string> = ${JSON.stringify(queryCatalog.promptByType, null, 2)}

/**
 * 按组件 type 获取完整参数说明。
 */
export function getComponentPrompt(type: string): string | null {
  return COMPONENT_PROMPT_BY_TYPE[type] ?? null
}

/**
 * 运行时查询组件目录。
 *
 * 规则：
 * - '@list' → 返回组件目录
 * - 'r-table' → 返回该组件完整参数说明
 * - 'r-table#dataKey' → 仅返回匹配 dataKey 的行
 */
export function queryComponentPrompts(types: string[]): string | null {
  if (!Array.isArray(types) || types.length === 0) {
    return null
  }

  const results: string[] = []

  for (const rawQuery of types) {
    if (rawQuery === '@list') {
      results.push(COMPONENT_DIRECTORY_PROMPT)
      continue
    }

    const hashIdx = rawQuery.indexOf('#')
    const type = hashIdx >= 0 ? rawQuery.slice(0, hashIdx) : rawQuery
    const fragment = hashIdx >= 0 ? rawQuery.slice(hashIdx + 1) : null
    const prompt = COMPONENT_PROMPT_BY_TYPE[type]

    if (prompt === undefined) {
      // eslint-disable-next-line prefer-template
      results.push('❌ 未找到组件「' + type + '」')
      continue
    }

    if (fragment !== null && fragment !== '') {
      const matched = prompt
        .split('\\n')
        .filter(line => line.toLowerCase().includes(fragment.toLowerCase()))
      results.push(
        matched.length > 0
          ? matched.join('\\n')
          // eslint-disable-next-line prefer-template
          : '❌ 组件「' + type + '」中未找到「' + fragment + '」相关内容',
      )
      continue
    }

    results.push(prompt)
  }

  return results.length > 0 ? results.join('\\n\\n---\\n\\n') : null
}
`

  const absoluteOutputPath = resolve(root, outputPath)
  try {
    writeFileSync(absoluteOutputPath, output, 'utf-8')
    logger.info(`📋 AI 配置目录已生成: ${relative(root, absoluteOutputPath)} (${sortedKeys.length} 条目)`)
  } catch (e) {
    logger.warn('⚠️ AI 配置目录生成失败（非致命）:', e)
  }
}
