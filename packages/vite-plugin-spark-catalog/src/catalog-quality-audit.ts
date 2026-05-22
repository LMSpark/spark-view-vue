/**
 * 组件目录质量审计
 *
 * 从 Vue 层治理到 catalog 产物的质量守卫。
 * 构建时自动扫描 catalog，输出质量报告，可选阻断（CI 使用）。
 *
 * 审计维度：
 * 1. Prop 描述覆盖率（每个非结构性 prop 应有 description）
 * 2. 类型精度（检测 unknown / object 等低信号类型）
 * 3. Schema type 引用一致性（组件属性/事件的复杂类型必须指向存在的 schema type）
 * 4. Emit 语义完整性（emit 应有 description）
 * 5. 绑定描述符完整性（有 DataViewKey的组件应有绑定信息）
 * 6. field / value 优先级文档（display 组件同时有 field 和 value 时需说明优先级）
 *
 * @module catalog-quality-audit
 */

import type {
  CatalogBindingDescriptor,
  ComponentEntry,
  PlatformConstraints,
  PropSchema,
} from './component-catalog-schema'
import { createLogger } from './utils'

const logger = createLogger('spark-catalog-audit')

/* --------------------------------------------------------------------------
 * 审计问题类型
 * ----------------------------------------------------------------------- */

export type AuditSeverity = 'error' | 'warning' | 'info'

export type AuditIssue = {
  severity: AuditSeverity
  rule: string
  component: string
  field?: string
  message: string}

export type AuditReport = {
  timestamp: string
  totalComponents: number
  issues: AuditIssue[]
  summary: {
    errors: number
    warnings: number
    infos: number
    propDescriptionCoverage: number
    emitDescriptionCoverage: number
    avgPropsPerComponent: number
  }}

export type AuditOptions = {
  /** 忽略的规则 ID 列表 */
  ignoreRules?: string[]
  /** 忽略的组件 type 列表 */
  ignoreComponents?: string[]
  /** 开启严格模式（warning 升级为 error） */
  strict?: boolean}

type AuditableComponentCatalog = {
  componentCount: number
  components: Record<string, ComponentEntry>
  schemas?: Record<string, PropSchema>
  schemaPool?: Record<string, PropSchema>
  constraints: PlatformConstraints
  bindingDescriptors: Record<string, CatalogBindingDescriptor>}

/* --------------------------------------------------------------------------
 * 结构性 prop 名称（不需要用户文档化的 prop）
 * ----------------------------------------------------------------------- */

const STRUCTURAL_PROP_NAMES = new Set(['type', 'id', 'children'])

/** 低信号类型关键字——出现在 prop type 中表明类型精度不足 */
const LOW_PRECISION_TYPE_PATTERNS = [
  /^unknown$/,
  /^object$/,
  /^any$/,
  /\bRecord<string,\s*unknown>/,
]

/* --------------------------------------------------------------------------
 * 审计规则
 * ----------------------------------------------------------------------- */

function auditPropDescriptions(entry: ComponentEntry, issues: AuditIssue[]): void {
  for (const prop of entry.props) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue

    if (prop.description === undefined || prop.description.trim() === '') {
      issues.push({
        severity: 'warning',
        rule: 'prop-description-missing',
        component: entry.type,
        field: prop.name,
        message: `Prop "${prop.name}" 缺少 description（请在 Vue SFC 的 Props 类型中为该字段添加 JSDoc 注释）`,
      })
    }
  }
}

function auditTypePrecision(entry: ComponentEntry, issues: AuditIssue[]): void {
  for (const prop of entry.props) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue

    const typeStr = prop.type
    for (const pattern of LOW_PRECISION_TYPE_PATTERNS) {
      if (pattern.test(typeStr)) {
        issues.push({
          severity: 'info',
          rule: 'prop-type-low-precision',
          component: entry.type,
          field: prop.name,
          message: `Prop "${prop.name}" 类型为 "${typeStr}"——考虑在 Vue 接口中使用更精确的类型（如联合类型或具体接口）`,
        })
        break
      }
    }
  }
}

function auditSchemaRefIntegrity(
  entry: ComponentEntry,
  schemas: Record<string, PropSchema> | undefined,
  issues: AuditIssue[],
): void {
  const refs = new Set(Object.keys(schemas ?? {}))
  if (refs.size === 0) return

  const assertSchemaType = (field: string, typeRef: string | undefined): void => {
    if (typeRef === undefined || refs.has(typeRef)) return
    issues.push({
      severity: 'error',
      rule: 'schema-type-dangling',
      component: entry.type,
      field,
      message: `"${field}" 的 schema type 引用 "${typeRef}" 指向不存在的类型`,
    })
  }

  for (const prop of entry.props) {
    assertSchemaType(prop.name, prop.schemaNodeId)
  }
  for (const emit of entry.emits) {
    assertSchemaType(emit.name, emit.schemaNodeId)
  }
}

function auditEmitDescriptions(entry: ComponentEntry, issues: AuditIssue[]): void {
  for (const emit of entry.emits) {
    if (emit.description === undefined || emit.description.trim() === '') {
      issues.push({
        severity: 'info',
        rule: 'emit-description-missing',
        component: entry.type,
        field: emit.name,
        message: `Emit "${emit.name}" 缺少 description（请在 Vue SFC 的 defineEmits 中添加 JSDoc 注释）`,
      })
    }
  }
}

function auditBindingCompleteness(entry: ComponentEntry, issues: AuditIssue[]): void {
  if (entry.binding === undefined) return

  const propNames = new Set(entry.props.map((p) => p.name))

  if (propNames.has('field') && entry.binding.fieldProvider !== true) {
    issues.push({
      severity: 'info',
      rule: 'binding-field-provider-missing',
      component: entry.type,
      message: `组件有 field prop 但 binding.fieldProvider 未标记`,
    })
  }
}

function auditBindingDescriptorDocs(catalog: AuditableComponentCatalog, issues: AuditIssue[]): void {
  for (const [type, descriptor] of Object.entries(catalog.bindingDescriptors)) {
    if (descriptor.description === undefined || descriptor.description.trim() === '') {
      issues.push({
        severity: 'warning',
        rule: 'binding-description-missing',
        component: type,
        message: `bindingDescriptors.${type} 缺少 description（需要解释 dataViewKey、dataMember、dataField、field、options、value 绑定语义）`,
      })
    }
    if (!Array.isArray(descriptor.examples)) {
      issues.push({
        severity: 'info',
        rule: 'binding-examples-missing',
        component: type,
        message: `bindingDescriptors.${type} 缺少 examples（建议提供 LLM 可参考的最小绑定配置）`,
      })
    }
  }
}

function auditConstraintDocs(catalog: AuditableComponentCatalog, issues: AuditIssue[]): void {
  const constraintNames = [
    'dataViewKeyPattern',
    'validTypePrefixes',
    'validAggregateTypes',
    'nonFieldRTypes',
    'containerContextMap',
    'nestingRules',
  ] as const

  for (const name of constraintNames) {
    const constraint = catalog.constraints[name]
    if (constraint.description.trim() === '') {
      issues.push({
        severity: 'warning',
        rule: 'constraint-description-missing',
        component: 'component-catalog',
        field: name,
        message: `constraints.${name} 缺少 description（LLM 无法理解该平台约束含义）`,
      })
    }
    if (!Array.isArray(constraint.examples)) {
      issues.push({
        severity: 'info',
        rule: 'constraint-examples-missing',
        component: 'component-catalog',
        field: name,
        message: `constraints.${name} 缺少 examples（建议提供合法配置示例）`,
      })
    }
  }
}

function auditFieldValuePrecedence(entry: ComponentEntry, issues: AuditIssue[]): void {
  const propNames = new Set(entry.props.map((p) => p.name))

  if (propNames.has('field') && propNames.has('value')) {
    const fieldProp = entry.props.find((p) => p.name === 'field')
    const valueProp = entry.props.find((p) => p.name === 'value')

    const fieldHasPrecedenceDoc = fieldProp?.description?.includes('优先') === true
      || fieldProp?.description?.includes('precedence') === true
      || fieldProp?.description?.includes('优先级') === true
    const valueHasFallbackDoc = valueProp?.description?.includes('回退') === true
      || valueProp?.description?.includes('fallback') === true
      || valueProp?.description?.includes('默认') === true

    if (!fieldHasPrecedenceDoc && !valueHasFallbackDoc) {
      issues.push({
        severity: 'warning',
        rule: 'field-value-precedence-undocumented',
        component: entry.type,
        message: `组件同时有 field 和 value prop，但未在 JSDoc 中说明优先级关系（field 通常优先于 value）`,
      })
    }
  }
}

function auditComponentDescription(entry: ComponentEntry, issues: AuditIssue[]): void {
  if (entry.description.startsWith('SPARK 组件') || entry.description.startsWith('SPARK 字段组件') || entry.description.startsWith('SPARK 容器组件')) {
    if (entry.source === 'vcm') {
      issues.push({
        severity: 'warning',
        rule: 'component-description-generic',
        component: entry.type,
        message: `组件描述为自动生成的通用文本——请在 Vue SFC 中添加 @description 注解`,
      })
    }
  }
}

function auditDefaultValues(entry: ComponentEntry, _issues: AuditIssue[]): void {
  for (const prop of entry.props) {
    if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue
    if (prop.required) continue

    // 枚举类型通常需要说明默认行为
    if (prop.schemaNodeId !== undefined && prop.default === undefined) {
      // 非必填的复杂类型 prop 没有 default——可能需要文档化默认行为
      // 仅对 enum 类型提醒
      // 这里不做检查，因为 schema 中可能是 object 而非 enum
    }
  }
}

/* --------------------------------------------------------------------------
 * 统计计算
 * ----------------------------------------------------------------------- */

function computePropDescriptionCoverage(catalog: AuditableComponentCatalog): number {
  let total = 0
  let withDesc = 0

  for (const entry of Object.values(catalog.components)) {
    for (const prop of entry.props) {
      if (STRUCTURAL_PROP_NAMES.has(prop.name)) continue
      total++
      if (prop.description !== undefined && prop.description.trim() !== '') {
        withDesc++
      }
    }
  }

  return total > 0 ? Math.round((withDesc / total) * 10000) / 100 : 100
}

function computeEmitDescriptionCoverage(catalog: AuditableComponentCatalog): number {
  let total = 0
  let withDesc = 0

  for (const entry of Object.values(catalog.components)) {
    for (const emit of entry.emits) {
      total++
      if (emit.description !== undefined && emit.description.trim() !== '') {
        withDesc++
      }
    }
  }

  return total > 0 ? Math.round((withDesc / total) * 10000) / 100 : 100
}

function computeAvgPropsPerComponent(catalog: AuditableComponentCatalog): number {
  const components = Object.values(catalog.components)
  if (components.length === 0) return 0

  const totalProps = components.reduce((sum, entry) => sum + entry.props.length, 0)
  return Math.round((totalProps / components.length) * 100) / 100
}

/* --------------------------------------------------------------------------
 * 审计入口
 * ----------------------------------------------------------------------- */

/**
 * 对组件目录执行质量审计，返回审计报告。
 *
 * **治理路径**：Vue SFC JSDoc → VCM 提取 → catalog JSON → 审计报告
 *
 * 修复路径：审计报告指向需要在 Vue 层补充 JSDoc 的具体 prop 和组件。
 */
export function auditCatalog(catalog: AuditableComponentCatalog, options: AuditOptions = {}): AuditReport {
  const { ignoreRules = [], ignoreComponents = [], strict = false } = options
  const ignoreRuleSet = new Set(ignoreRules)
  const ignoreComponentSet = new Set(ignoreComponents)

  const issues: AuditIssue[] = []

  for (const entry of Object.values(catalog.components)) {
    if (ignoreComponentSet.has(entry.type)) continue

    auditPropDescriptions(entry, issues)
    auditTypePrecision(entry, issues)
    auditSchemaRefIntegrity(entry, catalog.schemas ?? catalog.schemaPool, issues)
    auditEmitDescriptions(entry, issues)
    auditBindingCompleteness(entry, issues)
    auditFieldValuePrecedence(entry, issues)
    auditComponentDescription(entry, issues)
    auditDefaultValues(entry, issues)
  }
  auditBindingDescriptorDocs(catalog, issues)
  auditConstraintDocs(catalog, issues)

  // 过滤被忽略的规则
  const filteredIssues = issues.filter((issue) => !ignoreRuleSet.has(issue.rule))

  // 严格模式：warning 升级为 error
  if (strict) {
    for (const issue of filteredIssues) {
      if (issue.severity === 'warning') issue.severity = 'error'
    }
  }

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    totalComponents: Object.keys(catalog.components).length,
    issues: filteredIssues,
    summary: {
      errors: filteredIssues.filter((i) => i.severity === 'error').length,
      warnings: filteredIssues.filter((i) => i.severity === 'warning').length,
      infos: filteredIssues.filter((i) => i.severity === 'info').length,
      propDescriptionCoverage: computePropDescriptionCoverage(catalog),
      emitDescriptionCoverage: computeEmitDescriptionCoverage(catalog),
      avgPropsPerComponent: computeAvgPropsPerComponent(catalog),
    },
  }

  return report
}

/**
 * 将审计报告输出到控制台日志。
 */
export function logAuditReport(report: AuditReport): void {
  logger.info(`\n📊 组件目录质量审计报告`)
  logger.info(`   组件总数: ${report.totalComponents}`)
  logger.info(`   Prop 描述覆盖率: ${report.summary.propDescriptionCoverage}%`)
  logger.info(`   Emit 描述覆盖率: ${report.summary.emitDescriptionCoverage}%`)
  logger.info(`   平均 Props/组件: ${report.summary.avgPropsPerComponent}`)
  logger.info(`   问题统计: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} infos`)

  if (report.issues.length === 0) {
    logger.info(`   ✅ 无质量问题`)
    return
  }

  // 按组件分组输出
  const byComponent = new Map<string, AuditIssue[]>()
  for (const issue of report.issues) {
    const existing = byComponent.get(issue.component) ?? []
    existing.push(issue)
    byComponent.set(issue.component, existing)
  }

  const errorIssues = report.issues.filter((i) => i.severity === 'error')
  const warningIssues = report.issues.filter((i) => i.severity === 'warning')

  if (errorIssues.length > 0) {
    logger.info(`\n   ❌ Errors (${errorIssues.length}):`)
    for (const issue of errorIssues) {
      const fieldSuffix = issue.field !== undefined ? `.${issue.field}` : ''
      logger.info(`      ${issue.component}${fieldSuffix}: ${issue.message}`)
    }
  }

  if (warningIssues.length > 0) {
    logger.info(`\n   ⚠️ Warnings (前 20 条):`)
    for (const issue of warningIssues.slice(0, 20)) {
      const fieldSuffix = issue.field !== undefined ? `.${issue.field}` : ''
      logger.info(`      ${issue.component}${fieldSuffix}: ${issue.message}`)
    }
    if (warningIssues.length > 20) {
      logger.info(`      ... 还有 ${warningIssues.length - 20} 条 warnings`)
    }
  }
}

/**
 * 生成治理修复指南——告诉开发者应该修改哪些 Vue 文件。
 *
 * 按 Vue 源文件分组，输出每个文件需要添加的 JSDoc 注解。
 */
export function generateFixGuide(report: AuditReport, catalog: AuditableComponentCatalog): string {
  const lines: string[] = ['# 组件目录质量修复指南', '']
  lines.push(`生成时间: ${report.timestamp}`)
  lines.push(`Prop 描述覆盖率: ${report.summary.propDescriptionCoverage}%`)
  lines.push('')

  // 按 Vue 源文件分组
  const byFile = new Map<string, { component: string; issues: AuditIssue[] }>()
  for (const issue of report.issues) {
    if (issue.severity === 'info') continue // 只包含 error 和 warning

    const entry = catalog.components[issue.component]
    const filePath = entry?.filePath ?? `unknown (${issue.component})`

    const existing = byFile.get(filePath)
    if (existing !== undefined) {
      existing.issues.push(issue)
    } else {
      byFile.set(filePath, { component: issue.component, issues: [issue] })
    }
  }

  if (byFile.size === 0) {
    lines.push('✅ 无需修复——所有组件质量达标')
    return lines.join('\n')
  }

  for (const [filePath, { component, issues }] of byFile) {
    lines.push(`## ${filePath}`)
    lines.push(`组件: \`${component}\``)
    lines.push('')

    const descMissing = issues.filter((i) => i.rule === 'prop-description-missing')
    if (descMissing.length > 0) {
      lines.push('### 需要添加 JSDoc 注释的 Props:')
      lines.push('```typescript')
      lines.push('type Props = {')
      for (const issue of descMissing) {
        lines.push(`  /** TODO: 添加描述 */`)
        lines.push(`  ${issue.field ?? 'unknown'}?: ...`)
      }
      lines.push('}')
      lines.push('```')
      lines.push('')
    }

    const precedenceIssues = issues.filter((i) => i.rule === 'field-value-precedence-undocumented')
    if (precedenceIssues.length > 0) {
      lines.push('### 需要说明 field / value 优先级:')
      lines.push('```typescript')
      lines.push('type Props = {')
      lines.push('  /** 字段绑定名，优先于 value 取值 */')
      lines.push('  field?: string')
      lines.push('  /** 静态回退值（field 未指定或为空时使用） */')
      lines.push('  value?: unknown')
      lines.push('}')
      lines.push('```')
      lines.push('')
    }

    const genericDescIssues = issues.filter((i) => i.rule === 'component-description-generic')
    if (genericDescIssues.length > 0) {
      lines.push('### 需要添加组件描述:')
      lines.push('在 `<script setup>` 块开头添加:')
      lines.push('```typescript')
      lines.push('/**')
      lines.push(` * @skill ${component}`)
      lines.push(` * @description TODO: 一句话描述组件功能`)
      lines.push(' */')
      lines.push('```')
      lines.push('')
    }
  }

  return lines.join('\n')
}
