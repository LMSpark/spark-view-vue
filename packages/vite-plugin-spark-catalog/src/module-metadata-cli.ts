#!/usr/bin/env node
/**
 * 独立 AI 能力模块元数据生成命令。
 *
 * 用法：
 *   pnpm run generate:module-metadata
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Draft2020AuditIssue } from '@spark-appworks/spark-json-document'
import { auditModuleMetadataDocument } from './module-metadata-draft2020-audit'
import {
  compareModuleMetadataForBuildConsistency,
  generateModuleAbilityMetadata,
  type ModuleMetadataJsDocTodoLogEntry,
  type ModuleMetadataSchemaDescriptionTodoLogEntry,
} from './module-metadata-generator'
import { createLogger } from './utils'
import {
  VCM_CONFIG_FILE_NAME,
  createVcmTargetGeneratorOptions,
  findVcmMetadataTarget,
  readVcmMetadataConfig,
} from './vcm-config'

const logger = createLogger('module-metadata-cli')
const root = resolve(import.meta.dirname, '../../..')
const diagnoseOnly = process.argv.includes('--diagnose-only')
const trace = process.argv.includes('--trace')
const verifyBuildConsistency = process.argv.includes('--verify-build-consistency')
const extractResults = process.argv.includes('--extract-results') || !diagnoseOnly
const extractResultSchemas = process.argv.includes('--extract-result-schemas') || !diagnoseOnly
const configFile = readCliOption('--config') ?? VCM_CONFIG_FILE_NAME
const targetId = readCliOption('--target') ?? 'page-design'

const vcmConfig = readVcmMetadataConfig(root, configFile)
const vcmTarget = findVcmMetadataTarget(vcmConfig, targetId)

logger.info(diagnoseOnly
  ? `🚀 开始诊断 AI 能力模块元数据 ... config=${configFile} target=${vcmTarget.id}`
  : `🚀 开始生成 AI 能力模块元数据 ... config=${configFile} target=${vcmTarget.id}`)
const result = generateModuleAbilityMetadata(root, createVcmTargetGeneratorOptions(vcmTarget, {
  trace,
  extractResults,
  extractResultSchemas,
  writeFiles: !diagnoseOnly,
}))
if (verifyBuildConsistency) {
  const buildEntryResult = generateModuleAbilityMetadata(root, createVcmTargetGeneratorOptions(vcmTarget, {
    trace,
    extractResults,
    extractResultSchemas,
    reflectionMode: 'type-entry',
    writeFiles: false,
  }))
  const issues = compareModuleMetadataForBuildConsistency(result.moduleMetadata, buildEntryResult.moduleMetadata)
  if (issues.length > 0) {
    const sample = issues.slice(0, 8).map(issue => `${issue.path} ${issue.message}`).join('\n')
    throw new Error(`Build consistency check failed with ${issues.length} issue(s):\n${sample}`)
  }
  logger.info('✅ build consistency check passed: source reflection matches built type entry.')
}
if (diagnoseOnly) {
  logger.info(`✅ 已完成元数据提取诊断；未写入 generated JSON。vcmOutput=${result.vcmCatalogOutFile}`)
} else {
  logger.info(`✅ VCM catalog 已写入 ${result.vcmCatalogOutFile}`)
  logger.info(`✅ API diagnostics 已写入 ${result.moduleOutFile}`)
  logger.info(`✅ API runtime 已写入 ${vcmTarget.outputs.runtime}`)
  logger.info(`✅ API runtime entry 已写入 ${vcmTarget.outputs.runtime.replace(/\.generated\.json$/u, '.ts')}`)
  assertGeneratedModuleMetadataDraft2020(root, [
    vcmTarget.outputs.apiDiagnostics,
    vcmTarget.outputs.runtime,
  ])
}
logger.info([
  '📊 metadata diagnostics:',
  `abilities=${String(result.diagnostics.abilityCount)}`,
  `modules=${String(result.diagnostics.moduleCount)}`,
  `actions=${String(result.diagnostics.actionCount)}`,
  `resultApis=${String(result.diagnostics.resultApiCount)}`,
  `referencedApiKinds=${result.diagnostics.referencedApiKinds.length === 0 ? '(none)' : result.diagnostics.referencedApiKinds.join(',')}`,
  `emptySchemaNodes=${String(result.diagnostics.emptySchemaNodeCount)}`,
  `maxSchemaDepth=${String(result.diagnostics.maxSchemaDepth)}`,
].join(' '))

for (const module of result.diagnostics.modules) {
  logger.info(
    `  - ${module.kind}: actions=${String(module.actionCount)}, directResultApis=${module.directResultApiKinds.length === 0 ? '(none)' : module.directResultApiKinds.join(',')}, resultApis=${String(module.resultApiCount)}, emptySchemaNodes=${String(module.emptySchemaNodeCount)}`,
  )
}

logger.info([
  '🧾 runtime knowledge audit:',
  `models=${String(result.runtimeAudit.runtimeDocument.moduleCount + result.runtimeAudit.runtimeDocument.apiRegistryCount)}`,
  `defs=${String(result.runtimeAudit.schemaRefAudit.defs)}`,
  `directDefRefs=${String(result.runtimeAudit.schemaRefAudit.directDefRefs)}`,
  `reachableDefs=${String(result.runtimeAudit.schemaRefAudit.reachableDefs)}`,
  `missingDefRefs=${result.runtimeAudit.schemaRefAudit.missingDefRefs.length === 0 ? '0' : result.runtimeAudit.schemaRefAudit.missingDefRefs.join(',')}`,
  `deadDefs=${result.runtimeAudit.schemaRefAudit.deadDefs.length === 0 ? '0' : result.runtimeAudit.schemaRefAudit.deadDefs.join(',')}`,
].join(' '))
logger.info([
  '  knowledge coverage:',
  `attributes=${String(result.runtimeAudit.knowledgeReadiness.coverage.typedAttributeCount)}/${String(result.runtimeAudit.knowledgeReadiness.coverage.attributeCount)}`,
  `methodParams=${String(result.runtimeAudit.knowledgeReadiness.coverage.typedMethodParamCount)}/${String(result.runtimeAudit.knowledgeReadiness.coverage.methodCount)}`,
  `methodReturns=${String(result.runtimeAudit.knowledgeReadiness.coverage.methodReturnKnowledgeCount)}/${String(result.runtimeAudit.knowledgeReadiness.coverage.methodCount)}`,
  `childModelMethods=${String(result.runtimeAudit.knowledgeReadiness.coverage.childModelMethodCount)}`,
  `schemaDescriptions=${String(result.runtimeAudit.knowledgeReadiness.coverage.schemaPropertyDescriptionCount)}/${String(result.runtimeAudit.knowledgeReadiness.coverage.schemaPropertyCount)}`,
].join(' '))
for (const example of result.runtimeAudit.knowledgeReadiness.smokeExamples) {
  const rendered = 'declaration' in example ? example.declaration : example.signature
  logger.info(`  - ${example.tool} ${example.kind}.${'attributeName' in example ? example.attributeName : example.actionName}: ${rendered}`)
}
if (result.runtimeAudit.knowledgeReadiness.schemaDescriptionTodo.length > 0) {
  logger.info(`🧭 schema description coverage gaps: entries=${String(result.runtimeAudit.knowledgeReadiness.schemaDescriptionTodo.length)} (see source semantic todo below)`)
}

const schemaSemanticTodoGroups = groupSchemaSemanticTodoLog(result.schemaDescriptionTodoLog)
logger.info([
  '🧭 schema semantic todo build log:',
  `sourceTodos=${String(schemaSemanticTodoGroups.length)}`,
  `rawEntries=${String(result.schemaDescriptionTodoLog.length)}`,
  '(按源码首声明聚合；sourceTodos 才是需要补的点)',
].join(' '))
for (const group of schemaSemanticTodoGroups) {
  logger.info(`  - ${group.file}:${String(group.line)} ${formatSchemaSemanticTodoGroup(group)}`)
}

const jsdocTodoGroups = groupJsDocTodoLog(result.jsdocTodoLog)
logger.info([
  '🧭 JSDoc todo build log:',
  `sourceTodos=${String(jsdocTodoGroups.length)}`,
  `rawEntries=${String(result.jsdocTodoLog.length)}`,
  '(file:line + 补什么)',
].join(' '))
for (const group of jsdocTodoGroups) {
  logger.info(`  - ${group.file}:${String(group.line)} ${formatJsDocTodoGroup(group)}`)
}

for (const finding of result.diagnostics.findings) {
  const suffix = finding.fix === undefined ? '' : ` fix=${finding.fix}`
  logger.info(`  [${finding.level}] ${finding.rule} ${finding.target}: ${finding.message}${suffix}`)
}

function assertGeneratedModuleMetadataDraft2020(rootDir: string, relativeFiles: readonly string[]): void {
  const allIssues: Draft2020AuditIssue[] = []
  for (const relativeFile of relativeFiles) {
    const absoluteFile = resolve(rootDir, relativeFile)
    const document: unknown = JSON.parse(readFileSync(absoluteFile, 'utf8'))
    const issues = auditModuleMetadataDocument(document)
    for (const issue of issues) {
      allIssues.push({
        ...issue,
        path: `${relativeFile}:${issue.path}`,
      })
    }
  }
  if (allIssues.length === 0) return

  const sample = allIssues.slice(0, 8).map(issue => `${issue.path} ${issue.rule} (${issue.detail})`).join('\n')
  throw new Error(`Draft 2020-12 schema audit failed with ${allIssues.length} issue(s):\n${sample}`)
}

function readCliOption(name: string): string | undefined {
  const equalsPrefix = `${name}=`
  const equalsArg = process.argv.find(arg => arg.startsWith(equalsPrefix))
  if (equalsArg !== undefined) {
    const value = equalsArg.slice(equalsPrefix.length).trim()
    return value.length === 0 ? undefined : value
  }
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]?.trim()
  return value === undefined || value.length === 0 || value.startsWith('--') ? undefined : value
}

type SchemaSemanticTodoGroup = Readonly<{
  file: string
  line: number
  declarationOwnerKind: ModuleMetadataSchemaDescriptionTodoLogEntry['declarationOwnerKind']
  declarationOwnerName?: string
  fields: readonly string[]
  paths: readonly string[]
  affects: readonly string[]
  typeTexts: readonly string[]
  hasDefinitionPath: boolean
  hasParamsRole: boolean
  hasReturnRole: boolean
  hasAttributeRole: boolean
}>

type MutableSchemaSemanticTodoGroup = {
  file: string
  line: number
  declarationOwnerKind: ModuleMetadataSchemaDescriptionTodoLogEntry['declarationOwnerKind']
  declarationOwnerName?: string
  fields: Set<string>
  paths: Set<string>
  affects: Set<string>
  typeTexts: Set<string>
  hasDefinitionPath: boolean
  hasParamsRole: boolean
  hasReturnRole: boolean
  hasAttributeRole: boolean
}

function groupSchemaSemanticTodoLog(
  entries: readonly ModuleMetadataSchemaDescriptionTodoLogEntry[],
): readonly SchemaSemanticTodoGroup[] {
  const groups = new Map<string, MutableSchemaSemanticTodoGroup>()
  for (const entry of entries) {
    const key = [
      entry.file,
      String(entry.line),
      entry.declarationOwnerKind,
      entry.declarationOwnerName ?? '',
    ].join(':')
    const group = groups.get(key) ?? createMutableSchemaSemanticTodoGroup(entry)
    group.fields.add(entry.propertyName)
    group.paths.add(formatSchemaFieldPath(entry))
    group.affects.add(formatSchemaAffect(entry))
    group.typeTexts.add(entry.typeText)
    group.hasDefinitionPath ||= entry.path.includes('$defs')
    group.hasParamsRole ||= entry.schemaRole === 'params'
    group.hasReturnRole ||= entry.schemaRole === 'return'
    group.hasAttributeRole ||= entry.schemaRole === 'attribute'
    groups.set(key, group)
  }

  return [...groups.values()]
    .map(group => ({
      file: group.file,
      line: group.line,
      declarationOwnerKind: group.declarationOwnerKind,
      ...(group.declarationOwnerName === undefined ? {} : { declarationOwnerName: group.declarationOwnerName }),
      fields: [...group.fields].sort(),
      paths: [...group.paths].sort(),
      affects: [...group.affects].sort(),
      typeTexts: [...group.typeTexts].sort(),
      hasDefinitionPath: group.hasDefinitionPath,
      hasParamsRole: group.hasParamsRole,
      hasReturnRole: group.hasReturnRole,
      hasAttributeRole: group.hasAttributeRole,
    }))
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line)
}

function createMutableSchemaSemanticTodoGroup(
  entry: ModuleMetadataSchemaDescriptionTodoLogEntry,
): MutableSchemaSemanticTodoGroup {
  return {
    file: entry.file,
    line: entry.line,
    declarationOwnerKind: entry.declarationOwnerKind,
    ...(entry.declarationOwnerName === undefined ? {} : { declarationOwnerName: entry.declarationOwnerName }),
    fields: new Set(),
    paths: new Set(),
    affects: new Set(),
    typeTexts: new Set(),
    hasDefinitionPath: false,
    hasParamsRole: false,
    hasReturnRole: false,
    hasAttributeRole: false,
  }
}

function formatSchemaSemanticTodoGroup(group: SchemaSemanticTodoGroup): string {
  const fix = inferSchemaSemanticTodoFix(group)
  const target = formatSchemaDeclarationTarget(group)
  const fields = formatLimitedList(group.fields, 8)
  const affects = formatLimitedList(group.affects, 4)
  const paths = formatLimitedList(group.paths, 4)
  return `${fix}：${target} fields=${fields}；影响=${affects}；路径示例=${paths}`
}

function inferSchemaSemanticTodoFix(group: SchemaSemanticTodoGroup): string {
  if (group.declarationOwnerKind === 'type' || group.declarationOwnerKind === 'interface') {
    return '给命名 DTO 字段补 JSDoc 语义'
  }
  if (group.declarationOwnerKind === 'class') {
    return '给 class 属性/getter 补 JSDoc 语义'
  }
  if (group.hasParamsRole && !group.hasReturnRole && !group.hasAttributeRole) {
    return '给 inline 参数对象字段补 JSDoc；建议先提命名 type'
  }
  if (group.hasReturnRole && !group.hasParamsRole && !group.hasAttributeRole) {
    return '给 inline 返回对象字段补 JSDoc；建议先提命名 type'
  }
  if (group.hasAttributeRole && !group.hasParamsRole && !group.hasReturnRole) {
    return '给 inline 属性对象字段补 JSDoc；建议先提命名 type'
  }
  return '给源码首声明字段补 JSDoc 语义'
}

function formatSchemaDeclarationTarget(group: SchemaSemanticTodoGroup): string {
  const ownerName = group.declarationOwnerName ?? '(anonymous)'
  if (group.declarationOwnerKind === 'type') return `type ${ownerName}`
  if (group.declarationOwnerKind === 'interface') return `interface ${ownerName}`
  if (group.declarationOwnerKind === 'class') return `class ${ownerName}`
  return ownerName
}

function formatSchemaAffect(entry: ModuleMetadataSchemaDescriptionTodoLogEntry): string {
  const owner = formatMemberOwner(entry.className, entry.memberName)
  if (entry.schemaRole === 'params') return `${owner}(params)`
  if (entry.schemaRole === 'return') return `${owner}(return)`
  return `${owner}(attribute)`
}

type JsDocTodoGroup = Readonly<{
  file: string
  line: number
  owners: readonly string[]
  fixes: readonly string[]
}>

function groupJsDocTodoLog(entries: readonly ModuleMetadataJsDocTodoLogEntry[]): readonly JsDocTodoGroup[] {
  const groups = new Map<string, { file: string; line: number; owners: Set<string>; fixes: Set<string> }>()
  for (const entry of entries) {
    const key = `${entry.file}:${String(entry.line)}`
    const group = groups.get(key) ?? {
      file: entry.file,
      line: entry.line,
      owners: new Set<string>(),
      fixes: new Set<string>(),
    }
    group.owners.add(formatMemberOwner(entry.className, entry.memberName))
    for (const fix of entry.reasons.flatMap(formatJsDocReason)) {
      group.fixes.add(fix)
    }
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(group => ({
      file: group.file,
      line: group.line,
      owners: [...group.owners].sort(),
      fixes: [...group.fixes].sort(),
    }))
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line)
}

function formatJsDocTodoGroup(group: JsDocTodoGroup): string {
  return `补 JSDoc：${formatLimitedList(group.owners, 4)} ${formatLimitedList(group.fixes, 8)}`
}

function formatMemberOwner(className: string, memberName: string | undefined): string {
  return memberName === undefined ? className : `${className}.${memberName}`
}

function formatSchemaFieldPath(entry: ModuleMetadataSchemaDescriptionTodoLogEntry): string {
  const path = stripSchemaPathNoise(entry.path, entry.memberName)
  return path.length === 0 ? entry.propertyName : path
}

function stripSchemaPathNoise(path: readonly string[], memberName: string | undefined): string {
  let parts = path.filter(part => part !== 'properties')
  if (memberName !== undefined && parts[0] === 'methods' && parts[1] === memberName && parts[2] === 'resultSchema') {
    parts = parts.slice(3)
  } else if (memberName !== undefined && parts[0] === 'attributes' && parts[1] === memberName && parts[2] === 'schema') {
    parts = parts.slice(3)
  } else if (parts[0] === 'params') {
    parts = parts.slice(1)
  }
  return compactSchemaPath(parts)
}

function compactSchemaPath(parts: readonly string[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (part === 'items') {
      const last = out.pop()
      out.push(last === undefined ? '[]' : `${last}[]`)
      continue
    }
    out.push(part)
  }
  return out.join('.')
}

function formatLimitedList(values: readonly string[], limit: number): string {
  const visible = values.slice(0, limit)
  const suffix = values.length > limit ? ` 等${String(values.length)}项` : ''
  return `${visible.join(', ')}${suffix}`
}

function formatJsDocReason(reason: string): readonly string[] {
  if (reason === 'missing JSDoc' || reason === 'missing JSDoc summary') return ['补 summary']
  const missingParam = /^missing @param: (.+)$/u.exec(reason)
  const missingParamText = missingParam?.[1]
  if (missingParamText !== undefined) {
    return missingParamText.split(',').map(param => `补 @param ${param.trim()}`)
  }
  const emptyParam = /^empty @param description: (.+)$/u.exec(reason)
  const emptyParamText = emptyParam?.[1]
  if (emptyParamText !== undefined) {
    return emptyParamText.split(',').map(param => `补 @param ${param.trim()} 描述`)
  }
  return [reason]
}
