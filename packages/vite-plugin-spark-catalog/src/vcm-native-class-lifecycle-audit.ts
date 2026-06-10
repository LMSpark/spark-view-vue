/**
 * VCM 原生 class 生命周期契约审计（编译期）。
 *
 * 与 docs/ai/VCM_NATIVE_CLASS_SPEC.md 对齐：可持久化 kind 须有 toJson/fromJson；
 * 会话 kind（@vcmSession）豁免。
 */
import ts from 'typescript'

export type VcmNativeClassLifecycleFinding = Readonly<{
  level: 'info' | 'warn' | 'error'
  rule: string
  target: string
  message: string
  fix?: string
}>

const VCM_SESSION_TAG = 'vcmSession'
const VCM_SERIALIZABLE_TAG = 'vcmSerializable'
const VCM_FILE_PERSISTED_TAG = 'vcmFilePersisted'

const DEFAULT_SESSION_KINDS = new Set(['project', 'config-page'])
const SNAPSHOT_KINDS = new Set(['dataset', 'data-table', 'data-view'])
const TREE_KINDS = new Set(['node-tree'])

const STATIC_FACTORY_NAMES = new Set([
  'fromJson',
  'fromRuleJson',
  'fromDataSet',
  'reconcileFromJson',
])

type ApiLike = Readonly<{
  kind: string
  className: string
  actions: ReadonlyArray<Readonly<{ methodName: string }>>
}>

export type VcmNativeClassLifecycleAuditOptions = Readonly<{
  program: ts.Program
  apis: readonly ApiLike[]
}>

export function auditVcmNativeClassLifecycle(
  options: VcmNativeClassLifecycleAuditOptions,
): readonly VcmNativeClassLifecycleFinding[] {
  const findings: VcmNativeClassLifecycleFinding[] = []
  for (const api of options.apis) {
    const declaration = findClassDeclaration(options.program, api.className)
    if (declaration === undefined) {
      findings.push({
        level: 'warn',
        rule: 'lifecycle-class-not-found',
        target: api.kind,
        message: `无法定位 class ${api.className} 以审计生命周期契约。`,
      })
      continue
    }
    const docTags = readClassDocTagNames(declaration)
    const tier = resolveLifecycleTier(api.kind, docTags)
    if (tier === 'session') continue

    const hasInstanceToJson = hasInstanceMethod(declaration, 'toJson')
      || api.actions.some(action => action.methodName === 'toJson')
    const hasStaticFactory = hasStaticFactoryMethod(declaration)

    if (tier === 'snapshot') {
      if (!hasInstanceToJson) {
        findings.push({
          level: 'error',
          rule: 'lifecycle-missing-toJson',
          target: api.kind,
          message: `${api.className} 缺少实例 toJson()；可持久化 kind 必须可导出 JSON 快照。`,
          fix: '实现 toJson(): Metadata 并在 JSDoc 说明 @moduleMutation 读写边界。',
        })
      }
      if (!hasStaticFactory) {
        findings.push({
          level: 'error',
          rule: 'lifecycle-missing-fromJson',
          target: api.kind,
          message: `${api.className} 缺少 static fromJson/fromDataSet/reconcileFromJson 工厂。`,
          fix: '实现 static fromJson(...) 或在类 JSDoc 标注 @vcmSession 声明会话模型。',
        })
      }
      continue
    }

    if (!hasStaticFactory) {
      findings.push({
        level: 'error',
        rule: 'lifecycle-missing-tree-factory',
        target: api.kind,
        message: `${api.className} 缺少 static fromJson/fromRuleJson 树工厂。`,
        fix: '树模型至少提供 static fromJson 以从 rule.json / SparkNode 恢复。',
      })
    }
    if (!hasInstanceToJson && !docTags.has(VCM_FILE_PERSISTED_TAG)) {
      findings.push({
        level: 'warn',
        rule: 'lifecycle-tree-no-toJson',
        target: api.kind,
        message: `${api.className} 无实例 toJson；若仅经文件 API 持久化，请标注 @vcmFilePersisted。`,
        fix: '在 class JSDoc 添加 @vcmFilePersisted 说明持久化路径，或实现 toJson()。',
      })
    }
  }
  return findings
}

function resolveLifecycleTier(kind: string, docTags: ReadonlySet<string>): 'session' | 'snapshot' | 'tree' {
  if (docTags.has(VCM_SESSION_TAG) || DEFAULT_SESSION_KINDS.has(kind)) return 'session'
  if (docTags.has(VCM_SERIALIZABLE_TAG) || SNAPSHOT_KINDS.has(kind)) return 'snapshot'
  if (TREE_KINDS.has(kind)) return 'tree'
  return 'snapshot'
}

function findClassDeclaration(program: ts.Program, className: string): ts.ClassDeclaration | undefined {
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue
    const found = ts.forEachChild(sourceFile, function visit(node): ts.ClassDeclaration | undefined {
      if (ts.isClassDeclaration(node) && node.name?.text === className) return node
      return ts.forEachChild(node, visit)
    })
    if (found !== undefined) return found
  }
  return undefined
}

function readClassDocTagNames(declaration: ts.ClassDeclaration): ReadonlySet<string> {
  const tags = new Set<string>()
  const jsDoc = ts.getJSDocTags(declaration)
  for (const tag of jsDoc) {
    tags.add(tag.tagName.text)
  }
  return tags
}

function hasInstanceMethod(declaration: ts.ClassDeclaration, methodName: string): boolean {
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member)) continue
    if (member.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) === true) continue
    if (methodNameText(member.name) === methodName) return true
  }
  return false
}

function hasStaticFactoryMethod(declaration: ts.ClassDeclaration): boolean {
  for (const member of declaration.members) {
    if (!ts.isMethodDeclaration(member)) continue
    if (member.modifiers?.some(mod => mod.kind === ts.SyntaxKind.StaticKeyword) !== true) continue
    const name = methodNameText(member.name)
    if (STATIC_FACTORY_NAMES.has(name)) return true
  }
  return false
}

function methodNameText(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return name.getText()
}
