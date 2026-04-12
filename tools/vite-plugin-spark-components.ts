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
   *       asyncComponents: ['*Demo'],
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
 * 
 * export function registerComponents() {
 *   const registry = Spark.getRegistry()
 *   registry.register('page-renderer', PageRenderer)
 * }
 * ```
 * 
 * @module vite-plugin-spark-components
 * @author SPARK Team
 * @since 1.1.0
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { resolve, relative, dirname, basename } from 'node:path'
import { globSync } from 'glob'
import {
  toKebabCase,
  inferSkillType,
  buildImplicitSkillDescription,
} from '../packages/vite-plugin-spark-catalog/src/index'

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
/**
 * 组件 Props 属性元数据（从 defineProps<Props> interface 自动提取）
 */
export interface PropMeta {
  /** 属性名 */
  name: string
  /** TypeScript 类型字符串 */
  type: string
  /** 是否必填 */
  required: boolean
  /** JSDoc 描述 */
  description?: string
  /** withDefaults 默认值（字符串形式） */
  default?: string
}

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
  /** 组件 Props 定义（从 defineProps<Props> interface 自动提取） */
  props?: PropMeta[]
}



/* REMOVED: PROP_TYPE_GLOSSARY — 已迁移到 vite-plugin-spark-catalog (SHARED_TYPE_DEFINITIONS) */

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
  /** Skill 元数据（显式 JSDoc 注释优先，缺失时按组件路径自动补全） */
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
   * @default ['*Demo', 'Capability*']
   */
  asyncComponents?: string[]
  
  /**
   * 文件大小阈值（KB），超过此大小自动异步加载
   * @default 50
   */
  sizeThreshold?: number
  
  /**
   * 排除的组件（支持通配符）
   * @default `['App.vue', '**​/node_modules/**']`
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
 * 只读取文件前 60 行，避免全量读取大文件。
 * 未显式标注时按组件路径自动生成默认 Skill 元数据。
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

  const inferredType = inferSkillType(absolutePath, fallbackType)
  if (inferredType === null) return null

  // 提取第一个块注释（/** ... */）
  const blockMatch = content.match(/\/\*\*([\s\S]*?)\*\//)
  const block = blockMatch?.[1]

  // 辅助：提取单值标签
  const getTag = (tag: string): string | undefined => {
    if (!block) return undefined
    const m = block.match(new RegExp(`@${tag}\\s+(.+)`))
    return m?.[1]?.trim()
  }

  // 辅助：提取多值标签（可出现多次）
  const getTagAll = (tag: string): string[] => {
    if (!block) return []
    const re = new RegExp(`@${tag}\\s+(.+)`, 'g')
    const results: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(block)) !== null) {
      const val = m[1]
      if (val) results.push(val.trim())
    }
    return results
  }

  const explicitDescription = getTag('description')
  const skillType  = getTag('skill') ?? inferredType
  const provides   = getTagAll('provides')
  const consumes   = getTagAll('consumes')
  const inputSchema = getTag('input')
  const example    = getTag('example')

  const meta: SkillMeta = {
    type: skillType,
    description: explicitDescription ?? buildImplicitSkillDescription(absolutePath, skillType),
    provides,
    consumes,
  }
  if (inputSchema !== undefined) meta.inputSchema = inputSchema
  if (example !== undefined) meta.example = example
  return meta
}

/* REMOVED: Props 提取（extractInterfaceBody, parseInterfaceProperties, applyDefaultsFromWithDefaults, parseComponentProps）
 * —— Props 结构化提取已迁移到 vite-plugin-spark-catalog（基于 vue-component-meta）
 */

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
   * 精简版：仅输出组件注册列表 + 基础 skill 信息。
  * 完整 AI 元数据由 vite-plugin-spark-catalog 生成（component-catalog.json）。
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

    const metadata = {
      version: '3.0.0',
      buildTime: new Date().toISOString(),
      componentCount: this.components.length,
      skillCount: skills.length,
      components,
      skills,
    }

    return JSON.stringify(metadata, null, 2)
  }

  /**
   * 生成 Skill 目录虚拟模块代码
   *
   * 输出：virtual:spark-skill-catalog
   * 包含所有可生成 Skill 元数据的组件；JSDoc 注释用于覆盖默认 type/description/能力声明。
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
 *   import { skillCatalog } from 'virtual:spark-skill-catalog'
 *   // skillCatalog  — 完整 Skill 描述数组，可序列化为 JSON 发给 AI
 */

/** @type {import('./tools/vite-plugin-spark-components').SkillMeta[]} */
export const skillCatalog = ${skillsJson}

export default skillCatalog
`
  }

  /**
   * 生成类型声明虚拟模块代码
   */
  generateTypes(): string {
    const componentNames = this.components
      .map(c => `'${c.name}'`)
      .join(' | ')

    return `import type { App } from 'vue'

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
