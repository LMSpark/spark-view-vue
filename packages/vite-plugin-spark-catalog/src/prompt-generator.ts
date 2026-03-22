/**
 * 从 component-catalog.json 生成 AI 提示词文本
 *
 * 纯函数：`ComponentCatalog` JSON → 提示词文本。
 * 零前端依赖，可在任何 Node.js / 云端环境运行。
 *
 * @module prompt-generator
 */

import type { ComponentCatalog, ComponentEntry, PropEntry } from './component-catalog-schema'

/* --------------------------------------------------------------------------
 * 选项
 * ----------------------------------------------------------------------- */

export type PromptVerbosity = 'index' | 'compact' | 'full'

export interface PromptGeneratorOptions {
  /** 输出详细程度 */
  verbosity?: PromptVerbosity
  /** 仅包含指定组件 type（为空则全部包含） */
  include?: string[]
  /** 排除指定组件 type */
  exclude?: string[]
  /** 是否包含平台约束段 */
  includeConstraints?: boolean
}

/* --------------------------------------------------------------------------
 * 公共 API
 * ----------------------------------------------------------------------- */

/**
 * 生成组件注册表文本（type 列表，按分类归组）
 */
export function generateRegistryPrompt(catalog: ComponentCatalog): string {
  const { registry } = catalog
  const lines: string[] = [
    '## 组件注册表',
    '',
    `| 分组 | 允许的 type |`,
    `|------|------------|`,
    `| SPARK 容器 | ${registry.containers.join(', ')} |`,
    `| SPARK 字段 | ${registry.fields.join(', ')} |`,
    `| SPARK 分组 | ${registry.groups.join(', ')} |`,
  ]
  return lines.join('\n')
}

/**
 * 生成单个组件的 Props 文本
 */
export function generateComponentPrompt(entry: ComponentEntry, verbosity: PromptVerbosity = 'compact'): string {
  const lines: string[] = [`**${entry.type}** — ${entry.description}`]

  if (verbosity === 'index') return lines[0] ?? ''

  // Props
  if (entry.props.length > 0) {
    lines.push('')
    lines.push('【Props】')
    for (const prop of entry.props) {
      lines.push(formatPropLine(prop))
    }
  }

  // Root fields
  if (entry.rootFields !== undefined && entry.rootFields.length > 0) {
    lines.push('')
    lines.push('【根级字段】')
    for (const rf of entry.rootFields) {
      const desc = rf.description !== '' ? ` — ${rf.description}` : ''
      lines.push(`${rf.name}: ${rf.type}${desc}`)
    }
  }

  // Emits
  if (verbosity === 'full' && entry.emits.length > 0) {
    lines.push('')
    lines.push('【事件】')
    for (const emit of entry.emits) {
      if (emit.type !== undefined) {
        // VCM 格式: type 签名
        lines.push(`${emit.name}: ${emit.type}`)
      } else if (emit.payload !== undefined) {
        // 旧格式兼容
        const args = emit.payload.map(p => `${p.name}: ${p.type}`).join(', ')
        lines.push(`${emit.name}(${args})`)
      } else {
        lines.push(emit.name)
      }
    }
  }

  // Capabilities
  const { consumes, provides } = entry.capabilities
  if (consumes.length > 0 || provides.length > 0) {
    lines.push('')
    lines.push('【能力链】')
    if (consumes.length > 0) lines.push(`consumes: ${consumes.join(', ')}`)
    if (provides.length > 0) lines.push(`provides: ${provides.join(', ')}`)
  }

  // Notes (override/addendum text)
  if (verbosity === 'full' && entry.notes !== undefined) {
    lines.push('')
    lines.push(entry.notes)
  }

  return lines.join('\n')
}

/**
 * 生成完整组件 Props 目录（所有组件）
 */
export function generatePropsCatalogPrompt(catalog: ComponentCatalog, options: PromptGeneratorOptions = {}): string {
  const {
    verbosity = 'compact',
    include,
    exclude,
    includeConstraints = false,
  } = options

  const entries = filterEntries(catalog, include, exclude)
  const sections: string[] = []

  // 注册表
  sections.push(generateRegistryPrompt(catalog))

  // 按分类输出组件
  const grouped = groupByCategory(entries)

  for (const [category, label] of CATEGORY_LABELS) {
    const items = grouped.get(category)
    if (items === undefined || items.length === 0) continue

    sections.push('')
    sections.push(`## ${label}`)
    sections.push('')

    for (const entry of items) {
      sections.push(generateComponentPrompt(entry, verbosity))
      sections.push('')
    }
  }

  // 平台约束
  if (includeConstraints) {
    sections.push('')
    sections.push(generateConstraintsPrompt(catalog))
  }

  return sections.join('\n')
}

/**
 * 响应 @@query:component-props — 按 type 列表返回组件 Props
 */
export function queryComponentProps(catalog: ComponentCatalog, types: string[]): string {
  const results: string[] = []

  for (const query of types) {
    const hashIdx = query.indexOf('#')
    const type = hashIdx !== -1 ? query.slice(0, hashIdx) : query
    const fragment = hashIdx !== -1 ? query.slice(hashIdx + 1) : null

    // 特殊查询: @list
    if (type === '@list') {
      results.push(generateComponentIndex(catalog))
      continue
    }

    const entry = catalog.components[type]
    if (entry === undefined) {
      results.push(`❌ 未找到组件「${type}」`)
      continue
    }

    if (fragment !== null) {
      // 片段查询：返回匹配行
      const full = generateComponentPrompt(entry, 'full')
      const matched = full.split('\n').filter(line =>
        line.toLowerCase().includes(fragment.toLowerCase()),
      )
      results.push(matched.length > 0 ? matched.join('\n') : `❌ 组件「${type}」中未找到「${fragment}」相关内容`)
    } else {
      results.push(generateComponentPrompt(entry, 'full'))
    }
  }

  return results.join('\n\n---\n\n')
}

/**
 * 生成 COMPONENT_PROPS_CATALOG 等价的 Record<string, string>
 *
 * 向后兼容：供已有的 design-prompt.ts 消费。
 */
export function generateLegacyCatalogRecord(catalog: ComponentCatalog): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [type, entry] of Object.entries(catalog.components)) {
    // Override 类型：使用 notes（即原始 override 文本）
    if (entry.source === 'override' && entry.notes !== undefined) {
      result[type] = entry.notes
    } else {
      result[type] = generateComponentPrompt(entry, 'full')
    }
  }
  return result
}

/* --------------------------------------------------------------------------
 * 内部辅助
 * ----------------------------------------------------------------------- */

const CATEGORY_LABELS: Array<[ComponentEntry['category'], string]> = [
  ['meta', '元概念'],
  ['container', '容器组件'],
  ['field', '字段组件'],
  ['group', '分组组件'],
  ['feature', '业务组件'],
]

function formatPropLine(prop: PropEntry): string {
  const opt = prop.required ? '' : '?'
  const desc = prop.description !== undefined ? ` — ${prop.description}` : ''
  const def = prop.default !== undefined ? ` (默认 ${prop.default})` : ''
  return `${prop.name}${opt}: ${prop.type}${desc}${def}`
}

function filterEntries(
  catalog: ComponentCatalog,
  include?: string[],
  exclude?: string[],
): ComponentEntry[] {
  let entries = Object.values(catalog.components)

  if (include !== undefined && include.length > 0) {
    const set = new Set(include)
    entries = entries.filter(e => set.has(e.type))
  }

  if (exclude !== undefined && exclude.length > 0) {
    const set = new Set(exclude)
    entries = entries.filter(e => !set.has(e.type))
  }

  return entries.sort((a, b) => a.type.localeCompare(b.type))
}

function groupByCategory(entries: ComponentEntry[]): Map<ComponentEntry['category'], ComponentEntry[]> {
  const map = new Map<ComponentEntry['category'], ComponentEntry[]>()
  for (const entry of entries) {
    const group = map.get(entry.category) ?? []
    group.push(entry)
    map.set(entry.category, group)
  }
  return map
}

function generateComponentIndex(catalog: ComponentCatalog): string {
  const lines: string[] = ['| type | 分类 | 描述 |', '|------|------|------|']
  for (const [type, entry] of Object.entries(catalog.components)) {
    lines.push(`| ${type} | ${entry.category} | ${entry.description} |`)
  }
  return lines.join('\n')
}

function generateConstraintsPrompt(catalog: ComponentCatalog): string {
  const c = catalog.constraints
  const lines: string[] = [
    '## 平台约束',
    '',
    `**DataKey 格式**: \`${c.dataKeyPattern}\``,
    '',
    `**合法聚合类型**: ${c.validAggregateTypes.join(', ')}`,
    '',
    '**容器语境映射**:',
  ]

  for (const [container, context] of Object.entries(c.containerContextMap)) {
    lines.push(`- ${container} → ${context}`)
  }

  if (Object.keys(c.nestingRules).length > 0) {
    lines.push('')
    lines.push('**嵌套规则**:')
    for (const [parent, rule] of Object.entries(c.nestingRules)) {
      lines.push(`- **${parent}**: ${rule.note ?? rule.allowedChildren.join(', ')}`)
    }
  }

  return lines.join('\n')
}
