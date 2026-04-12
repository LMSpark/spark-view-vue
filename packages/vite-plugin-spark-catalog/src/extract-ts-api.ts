/**
 * TypeScript API 表面提取器
 *
 * 使用 TypeScript 编译器 API 从源代码中提取公共方法签名，
 * 生成 ApiSurface 结构供 component-catalog.json 消费。
 *
 * 提取目标：
 * - DataView 类公共方法
 * - DataSet 类公共方法
 * - SparkData 命名空间导出函数
 * - IScriptContext 接口成员
 * - IPageServiceCapability 接口方法
 *
 * @module extract-ts-api
 */

import ts from 'typescript'
import { resolve } from 'node:path'
import type { ApiSurface, ApiMethodEntry, ApiParamEntry, ApiMemberEntry } from './component-catalog-schema'
import { createLogger } from './utils'

const logger = createLogger('spark-extract-ts-api')

/* --------------------------------------------------------------------------
 * 内部工具
 * ----------------------------------------------------------------------- */

function createProgram(root: string, files: string[]): ts.Program {
  const tsconfigPath = resolve(root, 'tsconfig.typecheck.json')
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config as Record<string, unknown>,
    ts.sys,
    root,
  )
  return ts.createProgram(
    files.map(f => resolve(root, f)),
    parsedConfig.options,
  )
}

function getJsDoc(node: ts.Node): string {
  const jsDocTags = ts.getJSDocTags(node)
  // 获取 JSDoc 注释文本
  const comments: string[] = []

  // 方法 1：从 JSDoc 注释节点获取
  const jsDocs = (node as unknown as { jsDoc?: ts.JSDoc[] }).jsDoc
  if (jsDocs !== undefined && jsDocs.length > 0) {
    for (const doc of jsDocs) {
      if (doc.comment !== undefined) {
        const text = typeof doc.comment === 'string'
          ? doc.comment
          : doc.comment.map(c => c.text).join('')
        if (text !== '') comments.push(text)
      }
    }
  }

  // 方法 2：从 @description tag 获取
  for (const tag of jsDocTags) {
    if (tag.tagName.text === 'description' && tag.comment !== undefined) {
      const text = typeof tag.comment === 'string'
        ? tag.comment
        : tag.comment.map(c => c.text).join('')
      if (text !== '') comments.push(text)
    }
  }

  return comments.join(' ').trim()
}

function formatType(checker: ts.TypeChecker, node: ts.Node, type?: ts.Type): string {
  const t = type ?? checker.getTypeAtLocation(node)
  return checker.typeToString(t, node, ts.TypeFormatFlags.NoTruncation)
}

/* --------------------------------------------------------------------------
 * 类方法提取
 * ----------------------------------------------------------------------- */

function extractClassMethods(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  className: string,
): ApiMethodEntry[] {
  const methods: ApiMethodEntry[] = []

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      for (const member of node.members) {
        const mods = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined

        // 跳过私有/受保护成员
        if (mods?.some(m =>
          m.kind === ts.SyntaxKind.PrivateKeyword ||
          m.kind === ts.SyntaxKind.ProtectedKeyword,
        )) continue

        // 跳过以 _ 开头的内部成员
        const memberName = member.name !== undefined && ts.isIdentifier(member.name)
          ? member.name.text
          : undefined
        if (memberName === undefined || memberName.startsWith('_')) continue

        // 跳过静态方法（如工厂钩子）
        if (mods?.some(m => m.kind === ts.SyntaxKind.StaticKeyword)) continue

        if (ts.isMethodDeclaration(member)) {
          const sig = checker.getSignatureFromDeclaration(member)
          if (sig === undefined) continue

          const params = extractParams(checker, member.parameters)
          const returnType = checker.typeToString(sig.getReturnType())
          const description = getJsDoc(member)

          methods.push({
            name: memberName,
            signature: `${memberName}(${formatParamSignature(params)}): ${returnType}`,
            ...(description !== '' ? { description } : {}),
            ...(params.length > 0 ? { params } : {}),
            returnType,
          })
        }

        // 公共属性（getter 风格的 API 也有意义）
        if (ts.isGetAccessorDeclaration(member)) {
          const returnType = member.type !== undefined
            ? member.type.getText(sourceFile)
            : formatType(checker, member)
          const description = getJsDoc(member)

          methods.push({
            name: memberName,
            signature: `get ${memberName}(): ${returnType}`,
            ...(description !== '' ? { description } : {}),
            returnType,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return methods
}

/* --------------------------------------------------------------------------
 * 命名空间函数提取
 * ----------------------------------------------------------------------- */

function extractNamespaceFunctions(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  namespaceName: string,
): ApiMethodEntry[] {
  const methods: ApiMethodEntry[] = []

  function visit(node: ts.Node): void {
    if (ts.isModuleDeclaration(node) && node.name.text === namespaceName) {
      const body = node.body
      if (body !== undefined && ts.isModuleBlock(body)) {
        for (const stmt of body.statements) {
          if (ts.isFunctionDeclaration(stmt) && stmt.name !== undefined) {
            const fnName = stmt.name.text
            // 跳过内部函数
            if (fnName.startsWith('_')) continue

            const sig = checker.getSignatureFromDeclaration(stmt)
            if (sig === undefined) continue

            const params = extractParams(checker, stmt.parameters)
            const returnType = checker.typeToString(sig.getReturnType())
            const description = getJsDoc(stmt)

            methods.push({
              name: fnName,
              signature: `${fnName}(${formatParamSignature(params)}): ${returnType}`,
              ...(description !== '' ? { description } : {}),
              ...(params.length > 0 ? { params } : {}),
              returnType,
            })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return methods
}

/* --------------------------------------------------------------------------
 * 接口成员提取
 * ----------------------------------------------------------------------- */

function extractInterfaceMembers(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  interfaceName: string,
): ApiMemberEntry[] {
  const members: ApiMemberEntry[] = []

  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        const name = member.name !== undefined && ts.isIdentifier(member.name)
          ? member.name.text
          : undefined
        if (name === undefined || name.startsWith('_')) continue

        const description = getJsDoc(member)

        if (ts.isMethodSignature(member)) {
          const sig = checker.getSignatureFromDeclaration(member)
          if (sig === undefined) continue
          const params = extractParams(checker, member.parameters)
          const returnType = checker.typeToString(sig.getReturnType())
          members.push({
            name,
            type: `(${formatParamSignature(params)}) => ${returnType}`,
            kind: 'method',
            ...(description !== '' ? { description } : {}),
          })
        } else if (ts.isPropertySignature(member)) {
          const type = member.type !== undefined
            ? member.type.getText(sourceFile)
            : formatType(checker, member)
          members.push({
            name,
            type,
            kind: 'property',
            ...(description !== '' ? { description } : {}),
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return members
}

/* --------------------------------------------------------------------------
 * 接口方法提取（ApiMethodEntry 格式）
 * ----------------------------------------------------------------------- */

function extractInterfaceMethods(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  interfaceName: string,
): ApiMethodEntry[] {
  const methods: ApiMethodEntry[] = []

  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        const name = member.name !== undefined && ts.isIdentifier(member.name)
          ? member.name.text
          : undefined
        if (name === undefined || name.startsWith('_')) continue

        if (ts.isMethodSignature(member)) {
          const sig = checker.getSignatureFromDeclaration(member)
          if (sig === undefined) continue
          const params = extractParams(checker, member.parameters)
          const returnType = checker.typeToString(sig.getReturnType())
          const description = getJsDoc(member)

          methods.push({
            name,
            signature: `${name}(${formatParamSignature(params)}): ${returnType}`,
            ...(description !== '' ? { description } : {}),
            ...(params.length > 0 ? { params } : {}),
            returnType,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return methods
}

/* --------------------------------------------------------------------------
 * 参数工具
 * ----------------------------------------------------------------------- */

function extractParams(
  checker: ts.TypeChecker,
  parameters: ts.NodeArray<ts.ParameterDeclaration>,
): ApiParamEntry[] {
  return parameters.map(p => {
    const name = ts.isIdentifier(p.name) ? p.name.text : '?'
    const type = p.type !== undefined
      ? p.type.getText()
      : formatType(checker, p)
    const required = p.questionToken === undefined && p.initializer === undefined
    const description = getJsDoc(p)
    return {
      name,
      type,
      ...(required ? {} : { required: false }),
      ...(description !== '' ? { description } : {}),
    }
  })
}

function formatParamSignature(params: ApiParamEntry[]): string {
  return params
    .map(p => `${p.name}${p.required === false ? '?' : ''}: ${p.type}`)
    .join(', ')
}

/* --------------------------------------------------------------------------
 * 公共 API
 * ----------------------------------------------------------------------- */

/**
 * 从源代码提取 API 全息表面。
 *
 * 使用 TypeScript 编译器 API 解析源文件，提取公共方法签名。
 */
export function extractApiSurface(root: string): ApiSurface {
  const files = [
    'packages/spark-data/src/data-view.ts',
    'packages/spark-data/src/dataset.ts',
    'packages/spark-data/src/spark-data.ts',
    'packages/spark-page-config/src/script-context-types.ts',
    'packages/spark-utils/src/capability.ts',
  ]

  const program = createProgram(root, files)
  const checker = program.getTypeChecker()

  const getSource = (relative: string): ts.SourceFile | undefined =>
    program.getSourceFile(resolve(root, relative).replace(/\\/g, '/'))
      ?? program.getSourceFile(resolve(root, relative))

  // DataView
  const dvSource = getSource('packages/spark-data/src/data-view.ts')
  const dataView = dvSource !== undefined
    ? extractClassMethods(checker, dvSource, 'DataView')
    : []

  // DataSet
  const dsSource = getSource('packages/spark-data/src/dataset.ts')
  const dataSet = dsSource !== undefined
    ? extractClassMethods(checker, dsSource, 'DataSet')
    : []

  // SparkData namespace
  const sdSource = getSource('packages/spark-data/src/spark-data.ts')
  const sparkData = sdSource !== undefined
    ? extractNamespaceFunctions(checker, sdSource, 'SparkData')
    : []

  // IScriptContext interface
  const scSource = getSource('packages/spark-page-config/src/script-context-types.ts')
  const scriptContext = scSource !== undefined
    ? extractInterfaceMembers(checker, scSource, 'IScriptContext')
    : []

  // IPageServiceCapability interface
  const psSource = getSource('packages/spark-utils/src/capability.ts')
  const pageService = psSource !== undefined
    ? extractInterfaceMethods(checker, psSource, 'IPageServiceCapability')
    : []

  logger.info(`API Surface: DataView(${dataView.length}), DataSet(${dataSet.length}), SparkData(${sparkData.length}), ScriptContext(${scriptContext.length}), PageService(${pageService.length})`)

  return { dataView, dataSet, sparkData, scriptContext, pageService }
}
