/**
 * AI 配置目录 TS 文件生成器
 *
 * 从 json-catalog-generator 生成的 ComponentCatalog（VCM 驱动）
 * 派生出 component-props-catalog.ts，供 spark-ai 包消费。
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
    outputPath = 'packages/spark-ai/src/component-props-catalog.ts',
    verbose = false,
  } = options

  const aiCatalog = toAiComponentCatalog(jsonCatalog)
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
import type { ComponentCatalog } from './catalog-types'

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
`

  const absoluteOutputPath = resolve(root, outputPath)
  try {
    writeFileSync(absoluteOutputPath, output, 'utf-8')
    logger.info(`📋 AI 配置目录已生成: ${relative(root, absoluteOutputPath)} (${sortedKeys.length} 条目)`)
  } catch (e) {
    logger.warn('⚠️ AI 配置目录生成失败（非致命）:', e)
  }
}
