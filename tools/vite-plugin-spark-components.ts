/**
 * Vite Plugin: SPARK 组件自动注册代码生成器
 * 
 * ## 核心功能
 * - **编译时扫描**: 在构建时扫描所有 Vue 组件
 * - **智能分析**: 分析文件大小、命名规则、依赖关系
 * - **代码生成**: 生成静态的 TypeScript 注册代码
 * - **零运行时开销**: 所有逻辑在构建时完成
 * - **类型安全**: 生成的代码包含完整的 TypeScript 类型
 * - **HMR 支持**: 开发时自动重新生成
 * 
 * ## 使用方式
 * ```typescript
 * // vite.config.ts
 * import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'
 * 
 * export default defineConfig({
 *   plugins: [
 *     sparkComponentsPlugin({
 *       patterns: ['./features/**\/*.vue', './src/components/**\/*.vue'],
 *       syncComponents: ['PageRenderer', 'SparkComponentRenderer'],
 *       asyncComponents: ['*Demo', '*EJ2*'],
 *       sizeThreshold: 50 // KB
 *     })
 *   ]
 * })
 * ```
 * 
 * ## 生成的代码
 * ```typescript
 * // virtual:spark-components
 * import { Spark } from '@spark-view/spark-component'
 * import PageRenderer from './components/PageRenderer.vue'
 * const SparkEJ2Grid = () => import('./features/spark-ej2/SparkEJ2Grid.vue')
 * 
 * export function registerComponents() {
 *   const registry = Spark.getRegistry()
 *   registry.register('page-renderer', PageRenderer)
 *   registry.register('spark-ej2-grid', SparkEJ2Grid)
 * }
 * ```
 * 
 * @module vite-plugin-spark-components
 * @author SPARK Team
 * @since 1.1.0
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, relative, dirname, basename, join } from 'node:path'
import { globSync } from 'glob'

/* -----------------------------------------------------------------------------
 * 简单日志工具
 * -------------------------------------------------------------------------- */

function createLogger(namespace: string) {
  const prefix = `[${namespace}]`
  return {
    info: (...args: any[]) => console.log(prefix, ...args),
    warn: (...args: any[]) => console.warn(prefix, ...args),
    error: (...args: any[]) => console.error(prefix, ...args),
    debug: (...args: any[]) => console.debug(prefix, ...args)
  }
}

const logger = createLogger('SparkComponentsPlugin')

/* -----------------------------------------------------------------------------
 * 类型定义
 * -------------------------------------------------------------------------- */

/**
 * 加载策略
 */
export type LoadStrategy = 'sync' | 'async'

/**
 * Skill 元数据（从 .vue 文件顶部 JSDoc 注释自动提取）
 *
 * 在 .vue 文件顶部添加如下注释即可被插件识别：
 * ```
 * /**
 *  * @skill dept-tree
 *  * @description 部门组织树，支持懒加载、拖拽、节点点击联动子表
 *  * @provides spark:capability:data-source
 *  * @provides spark:capability:field-context
 *  * @consumes spark:capability:page-dataset
 *  * @input { dataKey: string, nodeKey?: string, defaultExpandAll?: boolean }
 *  * /
 * ```
 */
export interface SkillMeta {
  /** Skill 注册名（默认取 kebab-case 文件名，@skill 标签可覆盖） */
  type: string
  /** Skill 功能描述（@description 标签） */
  description?: string
  /** 该组件 provide 的能力键列表（@provides 标签，可多行） */
  provides: string[]
  /** 该组件 consume 的能力键列表（@consumes 标签，可多行） */
  consumes: string[]
  /** 输入参数 Schema 描述（@input 标签，JSON-like 格式字符串） */
  inputSchema?: string
  /** 调用示例（@example 标签，JSON 格式字符串） */
  example?: string
}

/**
 * 组件元数据
 */
export interface ComponentMetadata {
  /** 组件名称（kebab-case） */
  name: string
  /** 文件路径（相对于 root） */
  path: string
  /** 绝对路径 */
  absolutePath: string
  /** 文件名（不含扩展名） */
  fileName: string
  /** 文件大小（KB） */
  size: number
  /** 加载策略 */
  strategy: LoadStrategy
  /** 导入语句 */
  importStatement: string
  /** 注册语句 */
  registerStatement: string
  /** Skill 元数据（从 JSDoc 注释提取，无 @skill/@description 时为 null） */
  skillMeta: SkillMeta | null
}

/**
 * 插件配置
 */
export interface SparkComponentsPluginOptions {
  /**
   * 组件扫描模式（glob 模式）
   * @default ['./features/**\/*.vue', './src/components/**\/*.vue']
   */
  patterns?: string[]
  
  /**
   * 同步加载的组件列表（支持通配符）
   * @default ['PageRenderer', 'SparkComponentRenderer', 'ErrorFallback']
   */
  syncComponents?: string[]
  
  /**
   * 异步加载的组件列表（支持通配符）
   * @default ['*Demo', '*EJ2*', 'Capability*']
   */
  asyncComponents?: string[]
  
  /**
   * 文件大小阈值（KB），超过此大小自动异步加载
   * @default 50
   */
  sizeThreshold?: number
  
  /**
   * 排除的组件（支持通配符）
   * @default ['App.vue', '**/node_modules/**']
   */
  exclude?: string[]
  
  /**
   * 生成的虚拟模块 ID
   * @default 'virtual:spark-components'
   */
  virtualModuleId?: string
  
  /**
   * 是否生成 TypeScript 类型定义
   * @default true
   */
  generateTypes?: boolean
  
  /**
   * 是否在控制台输出详细日志
   * @default false
   */
  verbose?: boolean
}

/* -----------------------------------------------------------------------------
 * 默认配置
 * -------------------------------------------------------------------------- */

const DEFAULT_OPTIONS: Required<SparkComponentsPluginOptions> = {
  patterns: [
    './features/**/*.vue',
    './src/components/**/*.vue'
  ],
  syncComponents: [
    'PageRenderer',
    'SparkComponentRenderer',
    'ErrorFallback'
  ],
  asyncComponents: [
    '*Demo',
    '*EJ2*',
    'Capability*',
    'Tree*'
  ],
  sizeThreshold: 50,
  exclude: [
    'App.vue',
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.vue',
    '**/*.spec.vue'
  ],
  virtualModuleId: 'virtual:spark-components',
  generateTypes: true,
  verbose: false
}

/* -----------------------------------------------------------------------------
 * 工具函数
 * -------------------------------------------------------------------------- */

/**
 * 转换为 kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

/**
 * 通配符匹配
 */
function matchPattern(str: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexPattern}$`, 'i').test(str)
}

/**
 * 检查是否匹配任一模式
 */
function matchAnyPattern(str: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchPattern(str, pattern))
}

/**
 * 生成导入语句
 */
function generateImportStatement(
  componentName: string,
  path: string,
  strategy: LoadStrategy
): string {
  const varName = componentName
    .split('-')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  
  if (strategy === 'sync') {
    return `import ${varName} from '${path}'`
  } else {
    return `const ${varName} = () => import('${path}')`
  }
}

/**
 * 从 .vue 文件顶部的 JSDoc 注释中提取 Skill 元数据
 *
 * 只读取文件前 50 行，避免全量读取大文件。
 * 若没有 @skill 或 @description 标签，返回 null（视为普通组件，不进入 Skill 目录）。
 */
function parseSkillMeta(absolutePath: string, fallbackType: string): SkillMeta | null {
  let content: string
  try {
    // 只读前 60 行即可覆盖文件头部注释
    const raw = readFileSync(absolutePath, 'utf-8')
    content = raw.split('\n').slice(0, 60).join('\n')
  } catch {
    return null
  }

  // 提取第一个块注释（/** ... */）
  const blockMatch = content.match(/\/\*\*([\s\S]*?)\*\//)
  if (!blockMatch) return null
  const block = blockMatch[1]

  // 辅助：提取单值标签
  const getTag = (tag: string): string | undefined => {
    const m = block.match(new RegExp(`@${tag}\\s+(.+)`))
    return m ? m[1].trim() : undefined
  }

  // 辅助：提取多值标签（可出现多次）
  const getTagAll = (tag: string): string[] => {
    const re = new RegExp(`@${tag}\\s+(.+)`, 'g')
    const results: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(block)) !== null) {
      results.push(m[1].trim())
    }
    return results
  }

  const description = getTag('description')
  const skillType  = getTag('skill') ?? fallbackType
  const provides   = getTagAll('provides')
  const consumes   = getTagAll('consumes')
  const inputSchema = getTag('input')
  const example    = getTag('example')

  // 没有任何 Skill 相关标签 → 普通组件，不列入 Skill 目录
  if (!description && provides.length === 0 && consumes.length === 0) {
    return null
  }

  return { type: skillType, description, provides, consumes, inputSchema, example }
}

/**
 * 生成注册语句
 */
function generateRegisterStatement(componentName: string): string {
  const varName = componentName
    .split('-')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  
  // 使用 registerOnce 避免重复注册警告（HMR 场景）
  return `  registry.registerOnce('${componentName}', ${varName})`
}

/* -----------------------------------------------------------------------------
 * 组件分析器
 * -------------------------------------------------------------------------- */

class ComponentAnalyzer {
  private config: Required<SparkComponentsPluginOptions>
  private viteConfig: ResolvedConfig | null = null
  private components: ComponentMetadata[] = []

  constructor(options: SparkComponentsPluginOptions) {
    this.config = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * 设置 Vite 配置
   */
  setViteConfig(config: ResolvedConfig): void {
    this.viteConfig = config
  }

  /**
   * 扫描组件
   */
  scan(): ComponentMetadata[] {
    if (!this.viteConfig) {
      throw new Error('Vite config not initialized')
    }

    const root = this.viteConfig.root
    const components: ComponentMetadata[] = []

    logger.info('🔍 开始扫描组件...')

    // 扫描所有匹配的文件
    for (const pattern of this.config.patterns) {
      const files = globSync(pattern, {
        cwd: root,
        absolute: false,
        ignore: this.config.exclude
      })

      if (this.config.verbose) {
        logger.debug(`  模式 ${pattern} 匹配到 ${files.length} 个文件`)
      }

      for (const file of files) {
        const absolutePath = resolve(root, file)
        
        // 检查文件是否存在
        if (!existsSync(absolutePath)) {
          continue
        }

        // 提取组件信息
        const fileName = basename(file, '.vue')
        const componentName = toKebabCase(fileName)
        
        // 检查是否排除
        if (matchAnyPattern(fileName, this.config.exclude)) {
          continue
        }

        // 获取文件大小
        const stats = statSync(absolutePath)
        const sizeKB = stats.size / 1024

        // 判断加载策略
        const strategy = this.determineStrategy(fileName, sizeKB)

        // 生成路径（相对于 root，用于 import 语句）
        const importPath = './' + file.replace(/\\/g, '/')

        // 生成导入和注册语句
        const importStatement = generateImportStatement(componentName, importPath, strategy)
        const registerStatement = generateRegisterStatement(componentName)

        // 提取 Skill 元数据（同一次 I/O 顺带完成，无额外磁盘开销）
        const skillMeta = parseSkillMeta(absolutePath, componentName)

        components.push({
          name: componentName,
          path: file,
          absolutePath,
          fileName,
          size: Math.round(sizeKB * 100) / 100,
          strategy,
          importStatement,
          registerStatement,
          skillMeta,
        })
      }
    }

    // 排序：同步组件在前，异步组件在后
    components.sort((a, b) => {
      if (a.strategy === b.strategy) {
        return a.name.localeCompare(b.name)
      }
      return a.strategy === 'sync' ? -1 : 1
    })

    this.components = components

    // 统计信息
    const syncCount  = components.filter(c => c.strategy === 'sync').length
    const asyncCount = components.filter(c => c.strategy === 'async').length
    const skillCount = components.filter(c => c.skillMeta !== null).length

    logger.info(`✅ 扫描完成: ${components.length} 个组件 (同步: ${syncCount}, 异步: ${asyncCount}, Skill: ${skillCount})`)

    if (this.config.verbose) {
      components.forEach(c => {
        logger.debug(`  ${c.strategy === 'sync' ? '📦' : '⏳'} ${c.name} (${c.size} KB)`)
      })
    }

    return components
  }

  /**
   * 判断加载策略
   */
  private determineStrategy(fileName: string, sizeKB: number): LoadStrategy {
    // 1. 检查显式同步配置
    if (matchAnyPattern(fileName, this.config.syncComponents)) {
      return 'sync'
    }

    // 2. 检查显式异步配置
    if (matchAnyPattern(fileName, this.config.asyncComponents)) {
      return 'async'
    }

    // 3. 根据文件大小判断
    if (sizeKB > this.config.sizeThreshold) {
      return 'async'
    }

    // 4. 默认同步加载
    return 'sync'
  }

  /**
   * 生成注册代码
   */
  generateCode(): string {
    // 确保在每次生成前都执行一次扫描，这样即便某些组件被删除或者
    // HMR 未能触发也能保持最新状态。
    this.scan()

    const syncComponents = this.components.filter(c => c.strategy === 'sync')
    const asyncComponents = this.components.filter(c => c.strategy === 'async')

    const code = `/**
 * SPARK 组件自动注册代码
 * 
 * ⚠️ 此文件由 vite-plugin-spark-components 自动生成
 * ⚠️ 请勿手动修改，所有更改将在下次构建时被覆盖
 * 
 * 生成时间: ${new Date().toISOString()}
 * 组件总数: ${this.components.length} (同步: ${syncComponents.length}, 异步: ${asyncComponents.length})
 */

import { Spark } from '@spark-view/spark-component'

/* -----------------------------------------------------------------------------
 * 同步加载组件 (${syncComponents.length} 个)
 * 这些组件会在应用启动时立即加载
 * -------------------------------------------------------------------------- */

${syncComponents.map(c => c.importStatement).join('\n')}

/* -----------------------------------------------------------------------------
 * 异步加载组件 (${asyncComponents.length} 个)
 * 这些组件会在首次使用时按需加载
 * -------------------------------------------------------------------------- */

${asyncComponents.map(c => c.importStatement).join('\n')}

/* -----------------------------------------------------------------------------
 * 注册函数
 * -------------------------------------------------------------------------- */

/**
 * 注册所有组件到 SPARK Registry
 * 
 * @param {import('vue').App} [app] - Vue 应用实例（可选）
 * @returns {{ total: number, sync: number, async: number, components: Map }} 组件统计信息
 */
export function registerComponents(app) {
  const registry = Spark.getRegistry()
  
  // 注册同步组件
${syncComponents.map(c => c.registerStatement).join('\n')}
  
  // 注册异步组件
${asyncComponents.map(c => c.registerStatement).join('\n')}
  
  return {
    total: ${this.components.length},
    sync: ${syncComponents.length},
    async: ${asyncComponents.length},
    components: registry.getAll()
  }
}

/**
 * 获取所有组件的元数据
 */
export function getComponentMetadata() {
  return ${JSON.stringify(this.components.map(c => ({
    name: c.name,
    path: c.path,
    size: c.size,
    strategy: c.strategy
  })), null, 2)}
}

/**
 * 默认导出
 */
export default registerComponents
`

    return code
  }

  /**
   * 生成组件元数据 JSON（用于构建时输出到 dist/ 并上传到服务端）
   *
   * 包含：组件注册表 + Skill 目录 + 预构建 prompt
   */
  generateMetadataJson(): string {
    this.scan()

    const skills = this.components
      .filter(c => c.skillMeta !== null)
      .map(c => c.skillMeta!)

    const components = this.components.map(c => ({
      type: c.name,
      path: c.path,
      size: c.size,
      strategy: c.strategy,
      hasSkill: c.skillMeta !== null,
    }))

    // 构建三种精度的 prompt
    const indexPrompt = this.buildPromptMarkdown(skills, 'index')
    const compactPrompt = this.buildPromptMarkdown(skills, 'compact')
    const fullPrompt = this.buildPromptMarkdown(skills, 'full')

    const metadata = {
      version: '1.0.0',
      buildTime: new Date().toISOString(),
      componentCount: this.components.length,
      skillCount: skills.length,
      components,
      skills,
      skillPrompts: {
        index: indexPrompt,
        compact: compactPrompt,
        full: fullPrompt,
      },
    }

    return JSON.stringify(metadata, null, 2)
  }

  /**
   * 纯服务端导出的 prompt 构建（不依赖运行时 JS 函数）
   */
  private buildPromptMarkdown(
    skills: SkillMeta[],
    mode: 'index' | 'compact' | 'full',
  ): string {
    const header = '## SPARK Skill 目录'
    if (skills.length === 0) {
      return header + '\n\n（暂无已标注 Skill 的组件）\n'
    }

    const lines: string[] = [header, '']

    if (mode === 'index') {
      lines.push('| type | 描述 |')
      lines.push('|------|------|')
      for (const skill of skills) {
        lines.push(`| \`${skill.type}\` | ${skill.description ?? ''} |`)
      }
    } else {
      lines.push('> rule.json 的 type 字段只能使用以下值，每个值对应一个可调用的前端 Skill。', '')
      for (const skill of skills) {
        lines.push(`### \`${skill.type}\``)
        if (skill.description) lines.push('> ' + skill.description)
        if (skill.consumes.length > 0) {
          lines.push('- **依赖能力（consumes）**: ' + skill.consumes.map(c => `\`${c}\``).join(', '))
        }
        if (skill.provides.length > 0) {
          lines.push('- **提供能力（provides）**: ' + skill.provides.map(p => `\`${p}\``).join(', '))
        }
        if (mode === 'full') {
          if (skill.inputSchema) {
            lines.push(`- **输入参数**: \`${skill.inputSchema}\``)
          }
          if (skill.example) {
            lines.push('- **调用示例**:')
            lines.push('```json')
            lines.push(skill.example)
            lines.push('```')
          }
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /**
   * 生成 Skill 目录虚拟模块代码
   *
   * 输出：virtual:spark-skill-catalog
   * 仅包含携带 @skill / @description / @provides / @consumes 注释的组件。
   */
  generateSkillCatalog(): string {
    // 确保数据最新
    this.scan()

    const skills = this.components
      .filter(c => c.skillMeta !== null)
      .map(c => c.skillMeta!)

    const skillsJson = JSON.stringify(skills, null, 2)

    return `/**
 * SPARK Skill 目录
 *
 * ⚠️ 此文件由 vite-plugin-spark-components 自动生成，请勿手动修改
 * 生成时间: ${new Date().toISOString()}
 * Skill 总数: ${skills.length}
 *
 * 用法：
 *   import { skillCatalog, buildSkillPrompt } from 'virtual:spark-skill-catalog'
 *   // skillCatalog  — 完整 Skill 描述数组，可序列化为 JSON 发给 AI
 *   // buildSkillPrompt() — 生成适合嵌入 LLM 系统提示词的 Markdown 文本
 */

/** @type {import('./tools/vite-plugin-spark-components').SkillMeta[]} */
export const skillCatalog = ${skillsJson}

/**
 * 生成适合嵌入 AI 系统提示词的 Skill 目录 Markdown
 *
 * @param {string} [header] - 段落标题（默认："## 可用前端 Skill 目录"）
 * @returns {string} Markdown 格式的 Skill 说明文本
 */
/**
 * Skill 目录输出精度模式
 *
 * - 'index'   : 仅 type + 一行描述（最短，适合「先问 AI 用哪个 Skill」）
 * - 'compact' : type + 描述 + provides/consumes（中等，适合多数场景）
 * - 'full'    : 全部字段含 example（最详细，单次调用前用）
 */

/**
 * 按 type 关键词过滤 Skill
 * @param {string} [header] - 段落标题
 * @param {'index'|'compact'|'full'} [mode] - 输出精度
 * @param {string[]} [types] - 只输出这些 type 的 Skill（空数组 = 全量）
 */
export function buildSkillPrompt(
  header = '## 可用前端 Skill 目录',
  mode = 'compact',
  types = [],
) {
  const list = types.length > 0
    ? skillCatalog.filter(s => types.includes(s.type))
    : skillCatalog

  if (list.length === 0) {
    return header + '\\n\\n（暂无已标注 Skill 的组件）\\n'
  }

  const lines = [header, '']

  if (mode === 'index') {
    // 最精简：type 列表 + 单行描述，约 20 tokens/组件
    lines.push('| type | 描述 |')
    lines.push('|------|------|')
    for (const skill of list) {
      lines.push(\`| \\\`\${skill.type}\\\` | \${skill.description ?? ''} |\`)
    }
    lines.push('')
    lines.push('> 需要某个 Skill 的详细用法时，指定 type 后再次调用 buildSkillPrompt(…, "full", [type])')
  } else {
    lines.push('> rule.json 的 type 字段只能使用以下值，每个值对应一个可调用的前端 Skill。', '')
    for (const skill of list) {
      lines.push(\`### \\\`\${skill.type}\\\`\`)
      if (skill.description) lines.push('> ' + skill.description)
      if (skill.consumes.length > 0) {
        lines.push('- **依赖能力（consumes）**: ' + skill.consumes.map(c => \`\\\`\${c}\\\`\`).join(', '))
      }
      if (skill.provides.length > 0) {
        lines.push('- **提供能力（provides）**: ' + skill.provides.map(p => \`\\\`\${p}\\\`\`).join(', '))
      }
      if (mode === 'full') {
        if (skill.inputSchema) {
          lines.push(\`- **输入参数**: \\\`\${skill.inputSchema}\\\`\`)
        }
        if (skill.example) {
          lines.push('- **调用示例**:')
          lines.push('\`\`\`json')
          lines.push(skill.example)
          lines.push('\`\`\`')
        }
      }
      lines.push('')
    }
  }

  return lines.join('\\n')
}

export default skillCatalog
`
  }

  /**
   * 生成类型定义
   */
  generateTypes(): string {
    // 保持组件列表为最新状态
    this.scan()

    const componentNames = this.components.map(c => `'${c.name}'`).join(' | ')

    return `/**
 * SPARK 组件类型定义
 * 
 * ⚠️ 此文件由 vite-plugin-spark-components 自动生成
 */

import type { App } from 'vue'

export type ComponentName = ${componentNames || 'string'}

export interface ComponentStats {
  total: number
  sync: number
  async: number
  components: Map<string, Component>
}

export function registerComponents(app?: App): ComponentStats

export function getComponentMetadata(): Array<{
  name: ComponentName
  path: string
  size: number
  strategy: 'sync' | 'async'
}>

export default registerComponents
`
  }
}

/* -----------------------------------------------------------------------------
 * Vite Plugin
 * -------------------------------------------------------------------------- */

/**
 * SPARK 组件自动注册 Vite 插件
 */
export function sparkComponentsPlugin(
  options: SparkComponentsPluginOptions = {}
): Plugin {
  const analyzer = new ComponentAnalyzer(options)
  const config = { ...DEFAULT_OPTIONS, ...options }
  const virtualModuleId = config.virtualModuleId
  const resolvedVirtualModuleId = '\0' + virtualModuleId
  const resolvedVirtualTypeModuleId = '\0' + virtualModuleId + '.d.ts'

  // Skill 目录虚拟模块（与组件注册模块同插件，同次扫描）
  const skillCatalogModuleId = 'virtual:spark-skill-catalog'
  const resolvedSkillCatalogModuleId = '\0' + skillCatalogModuleId

  return {
    name: 'vite-plugin-spark-components',

    /**
     * 配置解析完成
     */
    configResolved(resolvedConfig) {
      analyzer.setViteConfig(resolvedConfig)
      
      // 初始扫描
      analyzer.scan()
    },

    /**
     * 解析虚拟模块 ID
     */
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId
      }
      if (id === virtualModuleId + '.d.ts') {
        return resolvedVirtualTypeModuleId
      }
      if (id === skillCatalogModuleId) {
        return resolvedSkillCatalogModuleId
      }
      return null
    },

    /**
     * 加载虚拟模块
     */
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return analyzer.generateCode()
      }
      if (id === resolvedVirtualTypeModuleId && config.generateTypes) {
        return analyzer.generateTypes()
      }
      if (id === resolvedSkillCatalogModuleId) {
        return analyzer.generateSkillCatalog()
      }
      return null
    },

    /**
     * 构建完成后输出组件元数据 JSON（仅生产构建）
     */
    writeBundle() {
      if (!analyzer['viteConfig']) return
      const outDir = analyzer['viteConfig'].build?.outDir ?? 'dist'
      const root = analyzer['viteConfig'].root
      const outputPath = resolve(root, outDir, 'spark-component-metadata.json')

      try {
        const metadataJson = analyzer.generateMetadataJson()
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, metadataJson, 'utf-8')
        logger.info(`📦 组件元数据已输出: ${relative(root, outputPath)}`)
      } catch (e) {
        logger.error('❌ 输出组件元数据失败:', e)
      }
    },

    /**
     * HMR 热更新（仅开发模式）
     */
    handleHotUpdate({ file, server }) {
      // 如果是 Vue 组件文件变更/新增/删除，重新扫描
      // Vite 在删除文件时也会触发此 hook，虽然文件已不存在，
      // scan() 内部会跳过 missing paths。
      if (file.endsWith('.vue')) {
        logger.debug('🔄 检测到组件变更或删除，重新扫描...')
        analyzer.scan()
        
        // 同时失效两个虚拟模块
        const modules = [
          server.moduleGraph.getModuleById(resolvedVirtualModuleId),
          server.moduleGraph.getModuleById(resolvedSkillCatalogModuleId),
        ].filter(Boolean)

        for (const mod of modules) {
          if (mod) server.moduleGraph.invalidateModule(mod)
        }

        if (modules.length > 0) {
          server.ws.send({ type: 'full-reload', path: '*' })
        }
      }
    }
  }
}

/**
 * 默认导出
 */
export default sparkComponentsPlugin
