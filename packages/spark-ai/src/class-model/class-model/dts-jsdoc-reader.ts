/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-jsdoc-reader
 * 职责：从 TypeScript AST 节点读取和清理 JSDoc 注释，统一处理多行注释格式和标签。
 * 边界：只做 JSDoc 文本提取和格式归一化，不解释 JSDoc 语义、不生成 ClassModel 字段。
 * AI用途：排查 JSDoc 读取丢失或格式错乱时，用本模块确认提取和清理规则。
 */
import ts from 'typescript'

export function readJsDoc(checker: ts.TypeChecker, node: ts.Node): string {
  const symbol = readJsDocSymbol(checker, node)
  if (symbol !== undefined) {
    const lines = [
      normalizeJsDocText(ts.displayPartsToString(symbol.getDocumentationComment(checker))),
      ...symbol.getJsDocTags(checker).map(renderJsDocTag),
    ].filter(line => line.length > 0)
    if (lines.length > 0) return lines.join('\n')
  }
  const tags = ts.getJSDocCommentsAndTags(node)
  if (tags.length === 0) return ''
  return tags
    .map(tag => normalizeJsDocText(tag.getText()))
    .filter(text => text.length > 0)
    .join('\n')
    .trim()
}

export function readJsDocSymbol(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const name = readDeclarationNameNode(node)
  if (name !== undefined) {
    const symbol = checker.getSymbolAtLocation(name)
    if (symbol !== undefined) return symbol
  }
  return checker.getSymbolAtLocation(node)
}

export function readDeclarationNameNode(node: ts.Node): ts.Node | undefined {
  if (
    ts.isClassDeclaration(node)
    || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node)
    || ts.isEnumDeclaration(node)
    || ts.isFunctionDeclaration(node)
    || ts.isPropertyDeclaration(node)
    || ts.isPropertySignature(node)
    || ts.isMethodDeclaration(node)
    || ts.isMethodSignature(node)
    || ts.isEnumMember(node)
  ) {
    return node.name
  }
  return undefined
}

export function renderJsDocTag(tag: ts.JSDocTagInfo): string {
  const text = tag.text === undefined ? '' : ts.displayPartsToString(tag.text).trim()
  return text.length === 0 ? `@${tag.name}` : `@${tag.name} ${text}`
}

export function normalizeJsDocText(text: string): string {
  const normalized = text.trim()
  if (normalized.length === 0) return ''
  if (normalized.startsWith('/**') || normalized.startsWith('/*')) {
    return cleanJsDocBlock(normalized)
  }
  return normalized
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

export function cleanJsDocBlock(text: string): string {
  return text
    .replace(/^\/\*\*/u, '')
    .replace(/\*\/$/u, '')
    .split(/\r?\n/u)
    .map(line => line.replace(/^\s*\*\s?/u, '').trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}

export function cleanVueModuleComment(text: string): string {
  return text
    .replace(/^<!--/u, '')
    .replace(/-->$/u, '')
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim()
}
