/**
 * SFC Component API Extraction Engine（构建时组件能力提取）
 *
 * 从 Vue SFC 源码中通过 TypeScript AST 自动提取：
 * - Props（名称、类型、可选性、默认值、JSDoc 描述）
 * - Emits（事件名、参数签名）
 * - Capabilities（consume / provide 的能力键）
 *
 * 纯函数设计，零运行时依赖，仅在构建管线中使用。
 * 不依赖 @vue/compiler-sfc —— 使用轻量正则提取 <script setup> 内容。
 *
 * @module extract-component-api
 * @since 1.3.0
 */

import ts from 'typescript'
import { readFileSync } from 'fs'

/* ==========================================================================
 * 输出类型
 * ========================================================================== */

export interface PropDescriptor {
  name: string
  type: string
  required: boolean
  default?: string
  description?: string
}

export interface EmitDescriptor {
  name: string
  payload: Array<{ name: string; type: string }>
}

export interface ComponentApiDescriptor {
  /** kebab-case 注册名 */
  type: string
  /** 相对于项目 root 的文件路径 */
  filePath: string
  props: PropDescriptor[]
  emits: EmitDescriptor[]
  capabilities: {
    consumes: string[]
    provides: string[]
  }
  /** Props 接口包含 [key: string]: unknown 索引签名 */
  hasIndexSignature: boolean
}

/* ==========================================================================
 * 主入口
 * ========================================================================== */

/**
 * 从 Vue SFC 源码中提取组件 API 描述
 *
 * @param sfcSource - Vue SFC 文件完整源码
 * @param filePath  - 文件路径（用于 parse 和输出）
 * @param componentType - 组件注册名（kebab-case）
 */
export function extractComponentApi(
  sfcSource: string,
  filePath: string,
  componentType: string,
): ComponentApiDescriptor | null {
  const scriptBlock = extractScriptSetup(sfcSource)
  if (!scriptBlock) return null

  const { content: scriptContent, lang } = scriptBlock

  const sourceFile = ts.createSourceFile(
    `${filePath}.ts`,
    scriptContent,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    lang === 'tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const result: ComponentApiDescriptor = {
    type: componentType,
    filePath,
    props: [],
    emits: [],
    capabilities: { consumes: [], provides: [] },
    hasIndexSignature: false,
  }

  // 1. Props: 优先从 interface Props 提取，回退到 defineProps 内联类型
  const propsInterface = findInterfaceByName(sourceFile, 'Props')
  if (propsInterface) {
    result.props = extractPropsMembers(propsInterface, sourceFile)
    result.hasIndexSignature = propsInterface.members.some(ts.isIndexSignatureDeclaration)
  } else {
    // 尝试从 defineProps<{ ... }>() 内联类型提取
    result.props = extractInlineDefinePropsType(sourceFile)
  }

  // 2. withDefaults 默认值
  const defaultsMap = extractWithDefaults(sourceFile)
  if (defaultsMap) {
    for (const prop of result.props) {
      const d = defaultsMap.get(prop.name)
      if (d !== undefined) prop.default = d
    }
  }

  // 3. Emits
  result.emits = extractDefineEmits(sourceFile)

  // 4. Capabilities（递归扫描 consume / sparkProvide / provide）
  const caps = extractCapabilities(sourceFile)
  result.capabilities.consumes = [...new Set(caps.consumes)]
  result.capabilities.provides = [...new Set(caps.provides)]

  return result
}

/**
 * 批量提取多个组件的 API
 */
export function extractAllComponentApis(
  components: Array<{ type: string; absolutePath: string; relativePath: string }>,
): ComponentApiDescriptor[] {
  const results: ComponentApiDescriptor[] = []
  for (const comp of components) {
    try {
      const source = readFileSync(comp.absolutePath, 'utf-8')
      const api = extractComponentApi(source, comp.relativePath, comp.type)
      if (api) results.push(api)
    } catch {
      // 跳过无法读取的文件
    }
  }
  return results
}

/* ==========================================================================
 * Props 提取
 * ========================================================================== */

function findInterfaceByName(
  sourceFile: ts.SourceFile,
  name: string,
): ts.InterfaceDeclaration | null {
  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === name) return stmt
  }
  return null
}

function extractPropsMembers(
  iface: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile,
): PropDescriptor[] {
  const props: PropDescriptor[] = []
  for (const member of iface.members) {
    if (!ts.isPropertySignature(member)) continue
    if (!member.name || !ts.isIdentifier(member.name)) continue

    const desc: PropDescriptor = {
      name: member.name.text,
      type: member.type ? cleanTypeText(member.type.getText(sourceFile)) : 'unknown',
      required: member.questionToken === undefined,
    }

    const jsdoc = getLeadingJSDocComment(member, sourceFile)
    if (jsdoc) desc.description = jsdoc

    props.push(desc)
  }
  return props
}

/**
 * 从 defineProps<{ ... }>() 内联类型字面量中提取 props
 */
function extractInlineDefinePropsType(sourceFile: ts.SourceFile): PropDescriptor[] {
  let props: PropDescriptor[] = []

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fnName = node.expression.text
      // 匹配 defineProps<{ ... }>() 或 withDefaults(defineProps<{ ... }>(), ...)
      const targetCall = fnName === 'defineProps'
        ? node
        : fnName === 'withDefaults' && node.arguments[0] &&
          ts.isCallExpression(node.arguments[0]) &&
          ts.isIdentifier(node.arguments[0].expression) &&
          node.arguments[0].expression.text === 'defineProps'
          ? node.arguments[0] as ts.CallExpression
          : null

      if (targetCall?.typeArguments?.[0] && ts.isTypeLiteralNode(targetCall.typeArguments[0])) {
        const typeLiteral = targetCall.typeArguments[0]
        for (const member of typeLiteral.members) {
          if (!ts.isPropertySignature(member)) continue
          if (!member.name || !ts.isIdentifier(member.name)) continue
          const desc: PropDescriptor = {
            name: member.name.text,
            type: member.type ? cleanTypeText(member.type.getText(sourceFile)) : 'unknown',
            required: member.questionToken === undefined,
          }
          const jsdoc = getLeadingJSDocComment(member, sourceFile)
          if (jsdoc) desc.description = jsdoc
          props.push(desc)
        }
        return
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return props
}

/* ==========================================================================
 * withDefaults 提取
 * ========================================================================== */

function extractWithDefaults(sourceFile: ts.SourceFile): Map<string, string> | null {
  let result: Map<string, string> | null = null

  function visit(node: ts.Node): void {
    if (result) return // 已找到，停止
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'withDefaults' &&
      node.arguments.length >= 2
    ) {
      const defaultsArg = node.arguments[1]
      if (defaultsArg && ts.isObjectLiteralExpression(defaultsArg)) {
        result = new Map()
        for (const prop of defaultsArg.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            result.set(prop.name.text, cleanTypeText(prop.initializer.getText(sourceFile)))
          }
        }
      }
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return result
}

/* ==========================================================================
 * Emits 提取
 * ========================================================================== */

function extractDefineEmits(sourceFile: ts.SourceFile): EmitDescriptor[] {
  const emits: EmitDescriptor[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineEmits'
    ) {
      const typeArgs = node.typeArguments
      if (typeArgs && typeArgs.length > 0) {
        const typeArg = typeArgs[0]
        if (typeArg && ts.isTypeLiteralNode(typeArg)) {
          for (const member of typeArg.members) {
            // 元组风格: 'event-name': [arg1: type1, arg2: type2]
            if (ts.isPropertySignature(member) && member.type) {
              const name = getPropertyName(member.name, sourceFile)
              if (name) {
                emits.push({
                  name,
                  payload: extractTuplePayload(member.type, sourceFile),
                })
              }
            }
            // 调用签名风格: (e: 'event-name', value: type): void
            if (ts.isCallSignatureDeclaration(member)) {
              const eventName = extractCallSignatureEventName(member)
              if (eventName) {
                emits.push({
                  name: eventName,
                  payload: extractCallSignaturePayload(member, sourceFile),
                })
              }
            }
          }
        }
      }
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return emits
}

/* ==========================================================================
 * Capabilities 提取
 * ========================================================================== */

function extractCapabilities(
  sourceFile: ts.SourceFile,
): { consumes: string[]; provides: string[] } {
  const consumes: string[] = []
  const provides: string[] = []

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const fn = node.expression.text
      const firstArg = node.arguments[0]

      // consume(CAPABILITY_KEY)
      if (fn === 'consume' && firstArg && ts.isIdentifier(firstArg)) {
        consumes.push(firstArg.text)
      }

      // sparkProvide(KEY, value) — 始终是 SPARK provide（从 useSparkComponent 解构并重命名）
      if (fn === 'sparkProvide' && firstArg && ts.isIdentifier(firstArg)) {
        provides.push(firstArg.text)
      }

      // provide(KEY, value) — 仅当 KEY 是 SCREAMING_SNAKE_CASE 时视为 SPARK provide
      // 区分 Vue 的 provide('string-key', value)
      if (
        fn === 'provide' &&
        firstArg &&
        ts.isIdentifier(firstArg) &&
        isCapabilityKeyName(firstArg.text)
      ) {
        provides.push(firstArg.text)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return { consumes, provides }
}

/* ==========================================================================
 * 工具函数
 * ========================================================================== */

/** 判断标识符是否为 SCREAMING_SNAKE_CASE（能力键命名约定） */
function isCapabilityKeyName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name)
}

/** 清理类型文本：压缩空白 */
function cleanTypeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 提取节点前的 JSDoc 注释文本 */
function getLeadingJSDocComment(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): string | undefined {
  const sourceText = sourceFile.getFullText()
  const ranges = ts.getLeadingCommentRanges(sourceText, node.getFullStart())
  if (!ranges) return undefined

  for (const range of ranges) {
    const text = sourceText.slice(range.pos, range.end)
    if (text.startsWith('/**')) {
      const cleaned = text
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/\s*$/, '')
        .replace(/^\s*\*\s?/gm, '')
        .trim()
      if (cleaned) return cleaned
    }
  }
  return undefined
}

/** 获取属性名（Identifier / StringLiteral） */
function getPropertyName(
  name: ts.PropertyName,
  sourceFile: ts.SourceFile,
): string | null {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) return name.getText(sourceFile)
  return null
}

/** 从 Tuple 类型提取事件参数：[value: string] → [{ name: 'value', type: 'string' }] */
function extractTuplePayload(
  typeNode: ts.TypeNode,
  sourceFile: ts.SourceFile,
): Array<{ name: string; type: string }> {
  if (ts.isTupleTypeNode(typeNode)) {
    return typeNode.elements.map(el => {
      if (ts.isNamedTupleMember(el)) {
        return {
          name: el.name.text,
          type: el.type ? cleanTypeText(el.type.getText(sourceFile)) : 'unknown',
        }
      }
      return { name: '_', type: cleanTypeText(el.getText(sourceFile)) }
    })
  }
  // 非 tuple 类型，作为整体返回
  return [{ name: '_', type: cleanTypeText(typeNode.getText(sourceFile)) }]
}

/** 从调用签名风格提取事件名：(e: 'name', ...) → 'name' */
function extractCallSignatureEventName(sig: ts.CallSignatureDeclaration): string | null {
  if (sig.parameters.length < 1) return null
  const firstParam = sig.parameters[0]
  if (!firstParam) return null
  if (!firstParam.type) return null
  if (ts.isLiteralTypeNode(firstParam.type) && ts.isStringLiteral(firstParam.type.literal)) {
    return firstParam.type.literal.text
  }
  return null
}

/** 从调用签名提取事件参数（排除第一个事件名参数） */
function extractCallSignaturePayload(
  sig: ts.CallSignatureDeclaration,
  sourceFile: ts.SourceFile,
): Array<{ name: string; type: string }> {
  return sig.parameters.slice(1).map(p => ({
    name: ts.isIdentifier(p.name) ? p.name.text : '_',
    type: p.type ? cleanTypeText(p.type.getText(sourceFile)) : 'unknown',
  }))
}

/* ==========================================================================
 * SFC 解析（轻量实现，不依赖 @vue/compiler-sfc）
 * ========================================================================== */

/**
 * 从 Vue SFC 源码中提取 <script setup> 块的内容和语言
 *
 * 匹配 `<script setup>` 或 `<script setup lang="ts">` 等变体。
 * 不处理多 script 块合并等复杂场景——对 API 提取而言够用。
 */
function extractScriptSetup(sfcSource: string): { content: string; lang: string } | null {
  const match = sfcSource.match(/<script\s+setup(?:\s+lang=["'](\w+)["'])?\s*>([\s\S]*?)<\/script>/)
  if (!match) return null
  const content = match[2]
  if (content === undefined) return null
  return { content, lang: match[1] ?? 'ts' }
}
