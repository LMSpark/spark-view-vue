/**
 * SPARK 组件系统共享工具函数
 *
 * @module utils
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/* --------------------------------------------------------------------------
 * 命名转换
 * ----------------------------------------------------------------------- */

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

/* --------------------------------------------------------------------------
 * Skill 类型推断
 * ----------------------------------------------------------------------- */

/**
 * 根据文件路径推断组件的 skill type（r-xxx 格式）。
 * 返回 null 表示该组件应被跳过（如 Scope 内部组件）。
 */
export function inferSkillType(absolutePath: string, fallbackType: string): string | null {
  const normalizedPath = normalizePath(absolutePath)
  const fileName = basename(absolutePath, '.vue')

  if (normalizedPath.includes('/components/fields/') && fileName.startsWith('Field')) {
    return `r-${toKebabCase(fileName.replace(/^Field/, ''))}`
  }

  if (normalizedPath.includes('/components/containers/') && fileName.startsWith('Renderer')) {
    if (fileName.endsWith('Scope')) return null
    return `r-${toKebabCase(fileName.replace(/^Renderer/, ''))}`
  }

  return fallbackType
}

/**
 * 根据文件路径生成默认 skill 描述文本。
 */
export function buildImplicitSkillDescription(absolutePath: string, skillType: string): string {
  const normalizedPath = normalizePath(absolutePath)
  const fileName = basename(absolutePath, '.vue')

  if (normalizedPath.includes('/components/fields/') && fileName.startsWith('Field')) {
    return `SPARK 字段组件，可在 rule.json 中通过 type="${skillType}" 使用。`
  }

  if (normalizedPath.includes('/components/containers/') && fileName.startsWith('Renderer')) {
    return `SPARK 容器组件，可在 rule.json 中通过 type="${skillType}" 组织子组件。`
  }

  if (normalizedPath.includes('/features/')) {
    return `SPARK 业务组件，可在 rule.json 中通过 type="${skillType}" 使用。`
  }

  if (normalizedPath.includes('/packages/') && normalizedPath.includes('/src/components/')) {
    return `SPARK 包组件，可在 rule.json 中通过 type="${skillType}" 使用。`
  }

  if (normalizedPath.includes('/src/views/')) {
    return `SPARK 视图组件，可在注册表中通过 type="${skillType}" 引用。`
  }

  return `SPARK 组件，可在注册表中通过 type="${skillType}" 使用。`
}

/* --------------------------------------------------------------------------
 * Skill 元数据解析
 * ----------------------------------------------------------------------- */

export interface SkillMeta {
  type: string
  description: string
  /** @category 覆盖（优先于目录推断） */
  category?: string
  /** @binding 数据绑定模式声明 */
  binding?: string
  /** @provides 向子组件暴露的能力键列表 */
  provides?: string[]
  /** @consumes 从父组件消费的能力键列表 */
  consumes?: string[]
  /** @notes 使用注意事项（可多条） */
  notes?: string[]
}

/**
 * 从 .vue 文件 `<script>` 块首部 JSDoc 中提取 Skill 元数据。
 *
 * 策略：定位 `<script` 标签后的前 20 行，在其中查找 `@skill-description`。
 * 若 `<script` 标签不存在则回退扫描文件前 60 行（兼容纯 .ts 场景）。
 */
export function parseSkillMeta(absolutePath: string, fallbackType: string): SkillMeta | null {
  let raw: string
  try {
    raw = readFileSync(absolutePath, 'utf-8')
  } catch {
    return null
  }

  const skillType = inferSkillType(absolutePath, fallbackType)
  if (skillType === null) return null

  // 定位 <script 标签后的区域（覆盖大型 template 场景）
  const allLines = raw.split('\n')
  const scriptIdx = allLines.findIndex((l) => /^\s*<script\b/.test(l))
  const searchLines = scriptIdx >= 0
    ? allLines.slice(scriptIdx, scriptIdx + 20)
    : allLines.slice(0, 60)
  const content = searchLines.join('\n')

  // 查找第一个 JSDoc 块
  const jsdocRegex = /\/\*\*\s*([\s\S]*?)\s*\*\//
  const match = jsdocRegex.exec(content)
  if (!match) {
    return {
      type: skillType,
      description: buildImplicitSkillDescription(absolutePath, skillType),
    }
  }

  const jsdocBody = match[1] ?? ''
  const lines = jsdocBody.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim())

  // 提取 @skill-description / @description
  const descLine = lines.find((l) => l.startsWith('@skill-description') || l.startsWith('@description'))
  const description = descLine
    ? descLine.replace(/^@(?:skill-description|description)\s*/, '').trim()
    : buildImplicitSkillDescription(absolutePath, skillType)

  // 提取 @category
  const categoryLine = lines.find((l) => l.startsWith('@category'))
  const category = categoryLine
    ? categoryLine.replace('@category', '').trim() || undefined
    : undefined

  // 提取 @binding
  const bindingLine = lines.find((l) => l.startsWith('@binding'))
  const binding = bindingLine
    ? bindingLine.replace('@binding', '').trim() || undefined
    : undefined

  // 提取 @provides（可多条，格式：@provides KEY - description）
  const provides = lines
    .filter((l) => l.startsWith('@provides'))
    .map((l) => l.replace('@provides', '').trim())
    .filter(Boolean)

  // 提取 @consumes（可多条）
  const consumes = lines
    .filter((l) => l.startsWith('@consumes'))
    .map((l) => l.replace('@consumes', '').trim())
    .filter(Boolean)

  // 提取 @notes（可多条）
  const notes = lines
    .filter((l) => l.startsWith('@notes'))
    .map((l) => l.replace('@notes', '').trim())
    .filter(Boolean)

  return {
    type: skillType,
    description,
    ...(category !== undefined ? { category } : {}),
    ...(binding !== undefined ? { binding } : {}),
    ...(provides.length > 0 ? { provides } : {}),
    ...(consumes.length > 0 ? { consumes } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  }
}

/* --------------------------------------------------------------------------
 * 日志
 * ----------------------------------------------------------------------- */

export function createLogger(namespace: string) {
  const prefix = `[${namespace}]`
  return {
    info: (...args: unknown[]) => { console.info(prefix, ...args) },
    warn: (...args: unknown[]) => { console.warn(prefix, ...args) },
    error: (...args: unknown[]) => { console.error(prefix, ...args) },
    debug: (...args: unknown[]) => {
      if (process.env['DEBUG'] !== undefined) console.info(prefix, '(debug)', ...args)
    },
  }
}
