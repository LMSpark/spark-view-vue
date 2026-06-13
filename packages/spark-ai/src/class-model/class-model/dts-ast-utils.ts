/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-ast-utils
 * 职责：提供 DTS 投影链路中跨模块共享的 AST 工具函数，消除 project-from-declarations 和 build-dts-class-model-bundle 之间的重复定义。
 * 边界：只包含无状态的纯函数，不持有 TypeChecker 或 Program 实例，不读写文件系统。
 * AI用途：当需要修改路径归一化、符号解析或声明名称提取逻辑时，用本模块确认唯一实现位置。
 */
import { relative, resolve } from 'node:path'

import ts from 'typescript'

export {
  CLASS_MODEL_EMIT_PREFIX,
  CLASS_MODEL_EMIT_SOURCE,
  CLASS_MODEL_EMIT_TSCONFIG,
  isClassModelEmitPath,
  sourceFileFromEmitPath,
  toClassModelEmitPath,
} from './class-model-emit-path'

/** 将绝对路径归一化为相对于 repoRoot 的 POSIX 风格路径。 */
export function normalizeRepoPath(absolutePath: string, repoRoot: string): string {
  return relative(resolve(repoRoot), resolve(absolutePath)).replace(/\\/g, '/')
}

/** 解析可能的 import alias 符号到最终声明符号。 */
export function resolveAliasedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  if (symbol === undefined) return undefined
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol)
}

/** 从声明节点提取名称文本（仅 Identifier 命名的声明有效）。 */
export function declarationNameText(declaration: ts.Declaration): string | undefined {
  const name = (declaration as ts.Declaration & { name?: ts.Node }).name
  return name !== undefined && ts.isIdentifier(name) ? name.text : undefined
}
