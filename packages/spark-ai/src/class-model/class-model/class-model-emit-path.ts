/**
 * @module @spark-appworks/spark-ai:class-model/class-model/class-model-emit-path
 * 职责：ClassModel 编译期内存 emit 的虚拟路径约定（非磁盘目录）。
 * 边界：路径字符串规则与源文件 mtime 读取；不创建 TypeScript Program。
 * AI用途：判断 bundle 键是否为 class-model-emit 虚拟源或映射 repo 路径时，用本模块统一约定。
 */
import { statSync } from 'node:fs'
import { resolve } from 'node:path'

export const CLASS_MODEL_EMIT_PREFIX = 'class-model-emit/' as const

export const CLASS_MODEL_EMIT_SOURCE = 'class-model-emit' as const

/** ClassModel 内存 emit 来源标识（对应 tsconfig.class-model-emit.json）。 */
export type ClassModelEmitSource = typeof CLASS_MODEL_EMIT_SOURCE

export const CLASS_MODEL_EMIT_TSCONFIG = 'tsconfig.class-model-emit.json' as const

/** 判断 repo 相对路径是否为 ClassModel 内存 emit 虚拟键。 */
export function isClassModelEmitPath(path: string | undefined): path is string {
  if (typeof path !== 'string') return false
  return normalizeRepoRelativePath(path).startsWith(CLASS_MODEL_EMIT_PREFIX)
}

function hasPathSuffix(path: string, suffix: string): boolean {
  return path.endsWith(suffix)
}

function normalizeRepoRelativePath(path: string): string {
  return path.split('\\').join('/')
}

function replaceSourceExtension(path: string, sourceExt: string): string {
  return `${path.slice(0, -sourceExt.length)}.d.ts`
}

/** 将 repo 相对源码路径映射为内存 emit 虚拟 .d.ts 键。 */
export function toClassModelEmitPath(repoRelativePath: string): string {
  const normalized = normalizeRepoRelativePath(repoRelativePath)
  if (isClassModelEmitPath(normalized)) return normalized
  if (hasPathSuffix(normalized, '.vue')) {
    return `${CLASS_MODEL_EMIT_PREFIX}${normalized}.d.ts`
  }
  const tsExtensions = ['.tsx', '.ts', '.mts', '.cts'] as const
  for (const ext of tsExtensions) {
    if (hasPathSuffix(normalized, ext)) {
      return `${CLASS_MODEL_EMIT_PREFIX}${replaceSourceExtension(normalized, ext)}`
    }
  }
  const jsExtensions = ['.jsx', '.js', '.mjs', '.cjs'] as const
  for (const ext of jsExtensions) {
    if (hasPathSuffix(normalized, ext)) {
      return `${CLASS_MODEL_EMIT_PREFIX}${replaceSourceExtension(normalized, ext)}`
    }
  }
  throw new Error(`Cannot map source to ClassModel emit path: ${repoRelativePath}`)
}

/** 将内存 emit 虚拟 .d.ts 键还原为对应源文件 repo 相对路径。 */
export function sourceFileFromEmitPath(emitPath: string): string {
  const normalized = normalizeRepoRelativePath(emitPath)
  const sourcePath = isClassModelEmitPath(normalized)
    ? normalized.slice(CLASS_MODEL_EMIT_PREFIX.length)
    : normalized
  if (hasPathSuffix(sourcePath, '.vue.d.ts')) return sourcePath.slice(0, -'.d.ts'.length)
  if (hasPathSuffix(sourcePath, '.d.ts')) return `${sourcePath.slice(0, -'.d.ts'.length)}.ts`
  return sourcePath
}

/** 读取 emit 虚拟键对应源文件的最后修改时间（ISO）；源文件不存在时返回 undefined。 */
export function readSourceModifiedAtIso(command: Readonly<{
  repoRoot: string
  emitSourcePath: string
  /** manifest / .dts-manifest 记录的源路径，优先于 emit 键推导。 */
  sourceFile?: string
}>): string | undefined {
  const sourceRelativePath = command.sourceFile ?? sourceFileFromEmitPath(command.emitSourcePath)
  const absolutePath = resolve(command.repoRoot, sourceRelativePath)
  try {
    return statSync(absolutePath).mtime.toISOString()
  } catch {
    return undefined
  }
}
