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

/**
 * Props 类型字典条目（构建时内嵌，供 AI 查阅复杂类型定义）
 */
export interface TypeGlossaryEntry {
  /** 类型名（如 DockProp） */
  name: string
  /** 类型定义（如 T | Record<string, unknown> | false | null） */
  definition: string
  /** 简要说明 */
  description?: string
}

/**
 * 内置 Props 类型字典
 *
 * 覆盖 defineProps 中出现的非平凡自定义类型，让 AI 生成 rule.json 时
 * 能理解各复合类型的实际结构。
 *
 * ⚠️ **零泛型约束**：所有条目的 name / definition 中禁止出现 `<>`
 *    泛型语法。AI 消费者不解析泛型，所有类型必须是具体的、展开的。
 */
const PROP_TYPE_GLOSSARY: TypeGlossaryEntry[] = [
  // ── 核心模型 ──
  { name: 'SparkNode', definition: '{ type: string, props?: object, children?: SparkNode[] }', description: 'SPARK 节点树结构，等价于 h(type, props, children)' },
  { name: 'IDataRow', definition: '{ [key: string]: unknown, _id?: string | number }', description: 'DataView 行数据对象' },
  { name: 'CollapseValue', definition: 'string | number | (string | number)[]', description: '折叠面板激活值' },

  // ── 事件回调（script.js 中使用） ──
  { name: 'RowClickHandler', definition: '(row: IDataRow, column: unknown, event: Event | undefined, control: { cancel(): void }) => void | Promise<void>', description: '行点击拦截器，调用 control.cancel() 阻止默认行为' },
  { name: 'RowSelectionHandler', definition: '(selection: IDataRow[], control: { cancel(): void }) => void | Promise<void>', description: '行选中变更拦截器' },
  { name: 'CurrentRowChangeHandler', definition: '(currentRow: IDataRow | null, oldRow: IDataRow | null | undefined, control: { cancel(): void }) => void | Promise<void>', description: '当前行变更拦截器' },
  { name: 'AddRowHandler', definition: '(partialRow: IDataRow, control: { cancel(): void }) => void | Promise<void>', description: '新增行拦截器' },
  { name: 'EditRowHandler', definition: '(rowId: string | number, partialRow: IDataRow, control: { cancel(): void }) => void | Promise<void>', description: '编辑行拦截器' },
  { name: 'RemoveRowHandler', definition: '(rowId: string | number, control: { cancel(): void }) => void | Promise<void>', description: '删除行拦截器' },
  { name: 'TreeEventHandler', definition: '(data: TreeNode, node: ElTreeNode, component: ElTreeComponent, control: { cancel(): void }) => void | Promise<void>', description: '树节点事件拦截器' },
  { name: 'TreeNodeActionHandler', definition: '(data: TreeNode, control: { cancel(): void }) => void | Promise<void>', description: '树节点操作拦截器（简化版，无 el-tree 内部参数）' },

  // ── 位置与布局 ──
  { name: 'ToolbarPosition', definition: '"top" | "bottom" | "left" | "right"', description: '工具栏位置' },
  { name: 'LateralActionPosition', definition: '"left" | "right"', description: '行操作列位置' },
  { name: 'InlineAlign', definition: '"start" | "center" | "end" | "stretch"', description: '行内对齐' },
  { name: 'InlineJustify', definition: '"start" | "center" | "end" | "space-between"', description: '行内分布' },

  // ── 字段值类型 ──
  { name: 'MultiValue', definition: '(string | number | boolean)[]', description: '多选字段值' },
  { name: 'CascaderValue', definition: '(string | number | boolean)[] | (string | number | boolean)[][]', description: '级联选择值（单选为路径数组，多选为路径数组的数组）' },
  { name: 'TransferValue', definition: '(string | number)[]', description: '穿梭框选中值' },
  { name: 'TreeSelectValue', definition: 'string | number | boolean | (string | number | boolean)[]', description: '树选择值' },
  { name: 'EntityPickerValue', definition: 'string | object | object[]', description: '实体选择器值' },
  { name: 'SparkCodeLanguage', definition: '"javascript" | "css"', description: '代码编辑器语言' },
  { name: 'SparkJsonEditorMode', definition: '"text" | "tree" | "table"', description: 'JSON 编辑器模式' },
]

/**
 * 构建类型名 → 字典条目索引（key 为去掉泛型参数的基础名）
 */
const _glossaryIndex: Map<string, TypeGlossaryEntry> = new Map(
  PROP_TYPE_GLOSSARY.map(e => [e.name.replace(/<.*>$/, ''), e]),
)

/**
 * 从一组 PropMeta 中提取引用的字典类型（递归展开嵌套引用）
 *
 * 例：`DockProp<DockToolbarNode>` → 匹配 DockProp、DockToolbarNode
 * DockToolbarNode 定义中含 ToolbarPosition → 也收录
 */
function resolveReferencedTypes(props: PropMeta[]): TypeGlossaryEntry[] {
  const seen = new Set<string>()
  const result: TypeGlossaryEntry[] = []

  function collect(typeStr: string): void {
    const identifiers = typeStr.match(/[A-Z]\w*/g)
    if (!identifiers) return
    for (const id of identifiers) {
      if (seen.has(id)) continue
      seen.add(id)
      const entry = _glossaryIndex.get(id)
      if (entry) {
        result.push(entry)
        collect(entry.definition)
      }
    }
  }

  for (const prop of props) {
    collect(prop.type)
  }

  return result
}

/**
 * 将复合类型字符串展开为自包含的完整定义（LLM 无需再查类型表）
 *
 * 例：expandTypeForPrompt('DockProp<DockToolbarNode>')
 *  → '{ type: "r-toolbar", props?: { position?: "top" | "bottom" | "left" | "right", class?: string }, children?: SparkNode[] } | Record<string, unknown> | false | null'
 *
 * 返回 null 表示该类型无需展开（原始类型或不在字典中）
 */
function expandTypeForPrompt(typeStr: string): string | null {
  // 简单类型无需展开
  if (!/[A-Z]/.test(typeStr)) return null

  const seen = new Set<string>()
  let result = typeStr

  // 步骤1：处理泛型 — DockProp<DockToolbarNode> → 用 T 替换
  const genericMatch = result.match(/^([A-Z]\w*)<(.+)>$/)
  if (genericMatch) {
    const baseName = genericMatch[1] ?? ''
    const typeParam = genericMatch[2] ?? ''
    const baseEntry = _glossaryIndex.get(baseName)
    if (baseEntry) {
      seen.add(baseName)
      // 先展开类型参数
      const paramEntry = _glossaryIndex.get(typeParam.replace(/<.*>$/, ''))
      const paramExpanded = paramEntry ? (seen.add(typeParam.replace(/<.*>$/, '')), paramEntry.definition) : typeParam
      // 替换 T
      result = baseEntry.definition.replace(/\bT\b/g, `(${paramExpanded})`)
    }
  } else {
    // 非泛型：直接查字典展开顶层
    const topEntry = _glossaryIndex.get(typeStr.replace(/<.*>$/, ''))
    if (topEntry) {
      seen.add(typeStr.replace(/<.*>$/, ''))
      result = topEntry.definition
    }
  }

  if (result === typeStr) return null

  // 步骤2：展开剩余的 PascalCase 类型引用（2 轮，避免无限递归）
  for (let round = 0; round < 2; round++) {
    // 先收集本轮需要替换的类型名→定义映射
    const replacements = new Map<string, string>()
    const matches = result.match(/\b([A-Z]\w*)(?![<\w])/g)
    if (matches) {
      for (const name of matches) {
        if (seen.has(name) || replacements.has(name)) continue
        const entry = _glossaryIndex.get(name)
        if (entry) {
          replacements.set(name, entry.definition)
          seen.add(name)
        }
      }
    }
    if (replacements.size === 0) break
    // 全量替换（同一类型名的所有出现都替换）
    for (const [name, def] of replacements) {
      result = result.replace(new RegExp(`\\b${name}\\b(?![<\\w])`, 'g'), def)
    }
  }

  return result
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

/* -----------------------------------------------------------------------------
 * Props 提取（@vue/compiler-sfc 解析 defineProps interface）
 * -------------------------------------------------------------------------- */

/**
 * 从 interface body 中提取属性定义（含 JSDoc 注释），使用大括号深度计数定位闭合
 */
function extractInterfaceBody(script: string, interfaceName: string): string | null {
  const pattern = new RegExp(`interface\\s+${interfaceName}\\s+(?:extends\\s+[\\w\\s,&|<>]+)?\\{`)
  const match = pattern.exec(script)
  if (!match) return null

  const startIdx = match.index + match[0].length
  let depth = 1
  let i = startIdx
  while (i < script.length && depth > 0) {
    if (script[i] === '{') depth++
    else if (script[i] === '}') depth--
    i++
  }
  if (depth !== 0) return null
  return script.slice(startIdx, i - 1)
}

/**
 * 逐行解析 interface body，提取每个属性的名称、类型、可选性和 JSDoc 描述
 */
function parseInterfaceProperties(body: string): PropMeta[] {
  const lines = body.split('\n')
  const props: PropMeta[] = []
  let currentComment: string | undefined
  let inMultilineComment = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // 单行 JSDoc: /** text */
    if (trimmed.startsWith('/**') && trimmed.endsWith('*/')) {
      currentComment = trimmed.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '').trim() || undefined
      inMultilineComment = false
      continue
    }

    // 多行 JSDoc 开始: /**
    if (trimmed.startsWith('/**')) {
      inMultilineComment = true
      const text = trimmed.replace(/^\/\*\*\s*/, '').trim()
      currentComment = text || undefined
      continue
    }

    // 多行 JSDoc 中间/结束
    if (inMultilineComment) {
      if (trimmed === '*/' || trimmed.endsWith('*/')) {
        inMultilineComment = false
        continue
      }
      const text = trimmed.replace(/^\*\s?/, '').trim()
      if (text) {
        currentComment = currentComment ? `${currentComment} ${text}` : text
      }
      continue
    }

    // 属性行: name?: TypeExpression
    const propMatch = trimmed.match(/^([\w$]+)(\?)?:\s*(.+?)[\s;]*$/)
    if (propMatch) {
      const [, name, optional, rawType] = propMatch
      if (name && rawType) {
        props.push({
          name,
          type: rawType.replace(/;$/, '').trim(),
          required: !optional,
          ...(currentComment ? { description: currentComment } : {}),
        })
      }
      currentComment = undefined
    }
  }

  return props
}

/**
 * 从 withDefaults(defineProps<Props>(), { ... }) 语句提取默认值，回写到对应 PropMeta
 */
function applyDefaultsFromWithDefaults(script: string, props: PropMeta[]): void {
  const match = script.match(/withDefaults\s*\(\s*defineProps<\w+>\(\)\s*,\s*\{([\s\S]*?)\}\s*\)/)
  if (!match) return

  const body = match[1]
  if (!body) return
  const lines = body.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Match: key: value, 或 key: value
    const defaultMatch = trimmed.match(/^([\w$]+)\s*:\s*(.+?)[\s,]*$/)
    if (defaultMatch) {
      const [, name, value] = defaultMatch
      if (!name || !value) continue
      const prop = props.find(p => p.name === name)
      if (prop) {
        prop.default = value.replace(/,\s*$/, '').trim()
      }
    }
  }
}

/**
 * 从 SFC <script setup> 中提取 defineProps<Props> 类型接口的结构化属性定义
 *
 * 解析链：regex 提取 script setup block → 定位 interface Props → 逐行提取属性 → 回填 withDefaults
 */
function parseComponentProps(absolutePath: string): PropMeta[] | undefined {
  let content: string
  try {
    content = readFileSync(absolutePath, 'utf-8')
  } catch {
    return undefined
  }

  // 提取 <script setup ...> 或 <script ...> 块的内容
  const scriptMatch = content.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/)
    ?? content.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  const scriptContent = scriptMatch?.[1]
  if (!scriptContent) return undefined

  // 1. 尝试从 interface Props 提取
  const propsBody = extractInterfaceBody(scriptContent, 'Props')
  if (!propsBody) return undefined

  // 2. 逐行解析属性
  const props = parseInterfaceProperties(propsBody)
  if (props.length === 0) return undefined

  // 3. 回填 withDefaults 默认值
  applyDefaultsFromWithDefaults(scriptContent, props)

  return props
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

        // 对 Skill 组件提取结构化 Props（需完整 SFC 解析，仅对有 Skill 的组件执行）
        if (skillMeta) {
          const propsMeta = parseComponentProps(absolutePath)
          if (propsMeta) skillMeta.props = propsMeta
        }

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
   * 数据来源：
   * - 组件 API：直接嵌入 sparkCatalogPlugin 已生成的 component-catalog.json（SSoT）
   * - Skill 目录 + prompt：从 .vue JSDoc 提取的 SkillMeta
   * - 注册信息：scan() 的组件列表（path/size/strategy）
   *
   * 后端仅消费 skills / skillPrompts 字段用于构建系统提示词。
   */
  generateMetadataJson(): string {
    this.scan()

    const skills = this.components
      .filter(c => c.skillMeta !== null)
      .map(c => c.skillMeta!)

    // 为每个 skill 附加引用的类型定义（per-component 而非全局）
    const skillsWithTypeRefs = skills.map(skill => {
      const refs = skill.props && skill.props.length > 0
        ? resolveReferencedTypes(skill.props)
        : []
      return refs.length > 0 ? { ...skill, referencedTypes: refs } : skill
    })

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

    // 构建能力级别的组件关系图（providers / consumers）
    const capabilityMap: Record<string, { providers: string[]; consumers: string[] }> = {}
    for (const skill of skills) {
      for (const cap of skill.provides) {
        const entry = capabilityMap[cap] ??= { providers: [], consumers: [] }
        entry.providers.push(skill.type)
      }
      for (const cap of skill.consumes) {
        const entry = capabilityMap[cap] ??= { providers: [], consumers: [] }
        entry.consumers.push(skill.type)
      }
    }

    const metadata = {
      version: '2.0.0',
      buildTime: new Date().toISOString(),
      componentCount: this.components.length,
      skillCount: skills.length,
      components,
      skills: skillsWithTypeRefs,
      typeGlossary: PROP_TYPE_GLOSSARY,
      skillPrompts: {
        index: indexPrompt,
        compact: compactPrompt,
        full: fullPrompt,
      },
      componentRelationships: {
        capabilities: capabilityMap,
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
      return header + '\n\n（暂无可用 Skill）\n'
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
        if (mode === 'compact' && skill.props && skill.props.length > 0) {
          // compact 模式：仅列出属性名（不含 on* 事件回调）
          const configProps = skill.props.filter(p => !p.name.startsWith('on') || !/^on[A-Z]/.test(p.name))
          if (configProps.length > 0) {
            lines.push('- **Props**: ' + configProps.map(p => `\`${p.name}\``).join(', '))
          }
          // compact 模式：列出引用的自定义类型名（便于 AI 感知复杂度）
          const refs = resolveReferencedTypes(skill.props)
          if (refs.length > 0) {
            lines.push('- **类型参考**: ' + refs.map(r => `\`${r.name}\` = ${r.definition}`).join('; '))
          }
        }
        if (mode === 'full') {
          if (skill.inputSchema) {
            lines.push(`- **输入参数**: \`${skill.inputSchema}\``)
          }
          if (skill.props && skill.props.length > 0) {
            // full 模式：分为配置属性和事件回调两组
            const configProps = skill.props.filter(p => !p.name.startsWith('on') || !/^on[A-Z]/.test(p.name))
            const eventProps = skill.props.filter(p => p.name.startsWith('on') && /^on[A-Z]/.test(p.name))
            if (configProps.length > 0) {
              lines.push('- **配置属性（Props）**:')
              lines.push('')
              lines.push('| 属性 | 类型 | 必填 | 默认值 | 说明 |')
              lines.push('|------|------|------|--------|------|')
              for (const prop of configProps) {
                // 展开复合类型为自包含定义，LLM 无需再查类型表
                const expanded = expandTypeForPrompt(prop.type)
                const typeCell = expanded
                  ? `\`${prop.type}\` = \`${expanded}\``
                  : `\`${prop.type}\``
                lines.push(`| \`${prop.name}\` | ${typeCell} | ${prop.required ? '✅' : ''} | ${prop.default ? `\`${prop.default}\`` : ''} | ${prop.description ?? ''} |`)
              }
              lines.push('')
            }
            if (eventProps.length > 0) {
              lines.push('- **事件回调**:')
              lines.push('')
              lines.push('| 事件 | 完整签名 | 说明 |')
              lines.push('|------|----------|------|')
              for (const prop of eventProps) {
                const expanded = expandTypeForPrompt(prop.type)
                const sigCell = expanded ? `\`${expanded}\`` : `\`${prop.type}\``
                lines.push(`| \`${prop.name}\` | ${sigCell} | ${prop.description ?? ''} |`)
              }
              lines.push('')
            }
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
  * 包含所有可生成 Skill 元数据的组件；JSDoc 注释用于覆盖默认 type/description/能力声明。
   */
  generateSkillCatalog(): string {
    // 确保数据最新
    this.scan()

    const skills = this.components
      .filter(c => c.skillMeta !== null)
      .map(c => c.skillMeta!)

    const skillsJson = JSON.stringify(skills, null, 2)
    const typeGlossaryJson = JSON.stringify(PROP_TYPE_GLOSSARY, null, 2)

    return `/**
 * SPARK Skill 目录
 *
 * ⚠️ 此文件由 vite-plugin-spark-components 自动生成，请勿手动修改
 * 生成时间: ${new Date().toISOString()}
 * Skill 总数: ${skills.length}
 *
 * 用法：
 *   import { skillCatalog, typeGlossary } from 'virtual:spark-skill-catalog'
 *   // skillCatalog  — 完整 Skill 描述数组，可序列化为 JSON 发给 AI
 *   // typeGlossary — 类型定义数组，可用于 UI 展示或类型展开
 */

/** @type {import('./tools/vite-plugin-spark-components').SkillMeta[]} */
export const skillCatalog = ${skillsJson}

/** @type {import('./tools/vite-plugin-spark-components').TypeGlossaryEntry[]} */
export const typeGlossary = ${typeGlossaryJson}

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
