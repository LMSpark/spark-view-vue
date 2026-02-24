/**
 * SPARK 组件目录配置 - 统一配置源
 * 
 * 所有依赖组件目录的子系统共享此配置，确保一致性：
 * - sparkComponentsPlugin（编译时注册）
 * - AutoLoader（运行时注册）
 * - AI 知识库生成（组件元数据提取）
 * 
 * @module spark-components-config
 * @since 1.2.0
 */

/* ==========================================================================
 * 扫描模式（Glob 格式，相对于项目 root）
 * ========================================================================== */

/**
 * 组件扫描模式（glob 格式）
 * 
 * 改动说明：
 * - features/ 扫描所有 Vue 组件（EJ2、自定义 feature 等）
 * - packages/ 扫描各包内的 components 目录
 * - src/components/ 扫描应用层自有组件
 * - src/views/ 扫描页面级组件
 */
export const COMPONENT_SCAN_PATTERNS = [
  './features/**/*.vue',
  './src/components/**/*.vue',
  './src/views/**/*.vue',
  './packages/*/src/components/**/*.vue'
] as const

/**
 * 排除的文件模式（glob 格式）
 */
export const COMPONENT_EXCLUDE_PATTERNS = [
  'App.vue',
  '**/node_modules/**',
  '**/dist/**',
  '**/*.test.vue',
  '**/*.spec.vue',
  '**/__tests__/**'
] as const

/* ==========================================================================
 * 组件加载策略
 * ========================================================================== */

/**
 * 同步加载的核心组件
 * 
 * 同步组件会被打包进主 chunk，用于：
 * - 首屏渲染必需的骨架组件
 * - 被多处引用的高频基础组件
 * - 体积小（< sizeThreshold）的轻量组件
 */
export const SYNC_COMPONENTS = [
  'PageRenderer',
  'SparkComponentRenderer',
  'ErrorFallback',
  'UserGrid',
  'UserRow',
  'UserField'
] as const

/**
 * 异步加载的组件（支持通配符）
 * 
 * 异步组件在运行时按需加载，用于：
 * - 大型第三方组件（EJ2、Charts 等）
 * - 低频访问的演示/设置页面
 * - 体积大（> sizeThreshold）的组件
 */
export const ASYNC_COMPONENTS = [
  '*EJ2*',        // Syncfusion 组件（大体积）
  '*Demo',        // 演示组件
  'Capability*',  // 能力展示
  'JsonRenderer*',// JSON 渲染器
  'Tree*'         // 树形组件
] as const

/**
 * 文件大小阈值（KB）
 * 超过此大小的组件自动标记为异步加载
 */
export const SIZE_THRESHOLD = 50

/* ==========================================================================
 * AI 知识库扫描目录（绝对路径工厂）
 * ========================================================================== */

/**
 * 获取 AI 知识库需要扫描的目录列表
 * 
 * @param rootDir - 项目根目录绝对路径
 * @returns 需要扫描的目录绝对路径数组
 */
export function getComponentDirs(rootDir: string): string[] {
  // 引入 path 模块的 resolve
  const { resolve } = require('path') as typeof import('path')
  
  return [
    // SPARK 包内组件
    resolve(rootDir, 'packages/spark-component/src/components'),
    resolve(rootDir, 'packages/spark-component/src/renderer'),
    
    // Features 组件
    resolve(rootDir, 'src/features/spark/components'),
    resolve(rootDir, 'src/features/spark-ej2/components'),
    
    // 应用层组件
    resolve(rootDir, 'src/components'),
    resolve(rootDir, 'src/components/demo'),
    resolve(rootDir, 'src/views')
  ]
}

/* ==========================================================================
 * SPARK 注册类型映射（组件名 → kebab-case 注册名）
 * ========================================================================== */

/**
 * 已知的组件注册类型映射
 * 
 * 当组件文件名与 SPARK 注册类型不一致时使用此映射。
 * 默认行为：PascalCase → kebab-case（如 UserGrid → user-grid）
 * 
 * 仅在需要覆盖默认转换时添加条目。
 */
export const TYPE_OVERRIDES: Record<string, string> = {
  // 示例：'SparkEJ2Grid': 'spark-ej2-grid' （默认规则已能正确转换，无需覆盖）
}

/* ==========================================================================
 * 组件能力声明（静态分析辅助）
 * ========================================================================== */

/**
 * 组件能力声明
 * 
 * 由于 provide/consume 是运行时行为，静态分析无法完全提取。
 * 此处声明已知组件的能力映射，用于 AI 知识库增强。
 */
export const COMPONENT_CAPABILITIES: Record<string, {
  provides?: string[]
  consumes?: string[]
  nestableIn?: string[]
  children?: string[]
}> = {
  'SparkEJ2Grid': {
    provides: ['SELECTION', 'GRID_EVENTS'],
    consumes: ['APP_SERVICES', 'DATA_TABLE'],
    children: ['SparkEJ2Column']
  },
  'SparkEJ2Column': {
    consumes: ['GRID_EVENTS'],
    nestableIn: ['SparkEJ2Grid']
  },
  'UserGrid': {
    provides: ['SELECTION', 'GRID_EVENTS'],
    consumes: ['APP_SERVICES'],
    children: ['UserRow']
  },
  'UserRow': {
    consumes: ['SELECTION'],
    nestableIn: ['UserGrid'],
    children: ['UserField']
  },
  'UserField': {
    consumes: ['ROW_DATA'],
    nestableIn: ['UserRow']
  },
  'PageRenderer': {
    provides: ['APP_SERVICES', 'PAGE_SERVICE'],
    consumes: ['APP_SERVICES']
  },
  'SparkComponentRenderer': {
    provides: [],
    consumes: ['APP_SERVICES']
  }
}
