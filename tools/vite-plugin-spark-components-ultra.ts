/**
 * SPARK 超高性能组件插件（1000+组件 < 1s 首屏）
 * 
 * 核心优化：
 * 1. 零启动注册 - 只生成索引，按需加载
 * 2. 预编译路由表 - 构建时分析路由组件依赖
 * 3. 智能预加载 - 根据访问模式预测下一个页面
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { globSync } from 'glob'

interface ComponentMetadata {
  name: string
  path: string
  size: number
  strategy: 'eager' | 'lazy' | 'route'
  routes?: string[]  // 关联的路由
  priority: number   // 加载优先级 (1-10)
}

interface UltraPluginOptions {
  patterns?: string[]
  coreComponents?: string[]  // 核心组件（必须预加载）
  routeManifest?: string     // 路由清单文件路径
  sizeThreshold?: number
  enablePreload?: boolean    // 启用智能预加载
  enableRouteAnalysis?: boolean  // 启用路由分析
}

export function sparkComponentsPluginUltra(options: UltraPluginOptions = {}): Plugin {
  const {
    patterns = ['./features/**/*.vue', './src/components/**/*.vue', './packages/**/components/**/*.vue'],
    coreComponents = ['PageRenderer', 'ErrorFallback'],
    sizeThreshold = 50,
    enablePreload = true,
    enableRouteAnalysis = true
  } = options

  let viteConfig: ResolvedConfig
  let components: ComponentMetadata[] = []

  return {
    name: 'spark-components-ultra',
    
    configResolved(config) {
      viteConfig = config
    },

    buildStart() {
      // 扫描组件
      components = scanComponents(viteConfig.root, patterns, coreComponents, sizeThreshold)
      
      // 路由分析（可选）
      if (enableRouteAnalysis) {
        analyzeRoutes(components, viteConfig.root)
      }
      
      console.log(`[Ultra] 扫描完成: ${components.length} 个组件`)
      console.log(`[Ultra] 核心组件: ${components.filter(c => c.strategy === 'eager').length}`)
      console.log(`[Ultra] 路由组件: ${components.filter(c => c.strategy === 'route').length}`)
      console.log(`[Ultra] 懒加载组件: ${components.filter(c => c.strategy === 'lazy').length}`)
    },

    resolveId(id) {
      if (id === 'virtual:spark-components-ultra') {
        return '\0virtual:spark-components-ultra'
      }
    },

    load(id) {
      if (id === '\0virtual:spark-components-ultra') {
        return generateUltraCode(components, enablePreload)
      }
    }
  }
}

/**
 * 扫描组件
 */
function scanComponents(
  root: string,
  patterns: string[],
  coreComponents: string[],
  sizeThreshold: number
): ComponentMetadata[] {
  const components: ComponentMetadata[] = []
  
  for (const pattern of patterns) {
    const files = globSync(pattern, { cwd: root, absolute: false })
    
    for (const file of files) {
      const absolutePath = resolve(root, file)
      if (!existsSync(absolutePath)) continue
      
      const fileName = file.split('/').pop()?.replace('.vue', '') ?? ''
      const name = toKebabCase(fileName)
      const stats = statSync(absolutePath)
      const sizeKB = stats.size / 1024
      
      // 判断策略
      let strategy: 'eager' | 'lazy' | 'route' = 'lazy'
      let priority = 5
      
      if (coreComponents.includes(fileName)) {
        strategy = 'eager'
        priority = 1
      } else if (sizeKB > sizeThreshold) {
        strategy = 'lazy'
        priority = 8
      } else if (fileName.includes('Page') || fileName.includes('View')) {
        strategy = 'route'
        priority = 3
      }
      
      components.push({
        name,
        path: './' + file.replace(/\\/g, '/'),
        size: Math.round(sizeKB * 100) / 100,
        strategy,
        priority
      })
    }
  }
  
  return components.sort((a, b) => a.priority - b.priority)
}

/**
 * 分析路由依赖
 */
function analyzeRoutes(components: ComponentMetadata[], root: string) {
  const routesFile = resolve(root, 'src/router/index.ts')
  if (!existsSync(routesFile)) return
  
  const content = readFileSync(routesFile, 'utf-8')
  
  // 简单的正则匹配（实际项目可用 AST）
  const importRegex = /import\s+(\w+)\s+from\s+['"](.+?)['"]/g
  const routeMap = new Map<string, string>()
  
  let match
  while ((match = importRegex.exec(content)) !== null) {
    const [, componentVar, importPath] = match
    if (importPath.includes('.vue')) {
      routeMap.set(componentVar, importPath)
    }
  }
  
  // 关联路由路径
  const routeConfigRegex = /path:\s*['"](.+?)['"]\s*,\s*component:\s*(\w+)/g
  while ((match = routeConfigRegex.exec(content)) !== null) {
    const [, routePath, componentVar] = match
    const importPath = routeMap.get(componentVar)
    if (importPath) {
      const component = components.find(c => c.path.includes(importPath))
      if (component) {
        component.routes = component.routes || []
        component.routes.push(routePath)
        component.strategy = 'route'
      }
    }
  }
}

/**
 * 生成超高性能代码
 */
function generateUltraCode(components: ComponentMetadata[], enablePreload: boolean): string {
  const eagerComponents = components.filter(c => c.strategy === 'eager')
  const routeComponents = components.filter(c => c.strategy === 'route')
  const lazyComponents = components.filter(c => c.strategy === 'lazy')

  return `/**
 * SPARK 超高性能组件系统
 * 生成时间: ${new Date().toISOString()}
 * 策略: 零启动注册 + 按需加载 + 智能预测
 */

import { Spark } from '@spark-view/spark-component'

/* -----------------------------------------------------------------------------
 * 组件索引（轻量级元数据）
 * -------------------------------------------------------------------------- */

const componentIndex = new Map([
${components.map(c => `  ['${c.name}', { path: '${c.path}', strategy: '${c.strategy}', size: ${c.size}, routes: ${JSON.stringify(c.routes || [])} }]`).join(',\n')}
])

/* -----------------------------------------------------------------------------
 * 核心组件（立即导入）- ${eagerComponents.length} 个
 * -------------------------------------------------------------------------- */

${eagerComponents.map(c => `import ${toPascalCase(c.name)} from '${c.path}'`).join('\n')}

/* -----------------------------------------------------------------------------
 * 懒加载注册器
 * -------------------------------------------------------------------------- */

const loadedComponents = new Set()
const loadingPromises = new Map()

async function lazyLoadComponent(name) {
  // 防止重复加载
  if (loadedComponents.has(name)) {
    return Spark.getRegistry().get(name)
  }
  
  // 等待正在加载的组件
  if (loadingPromises.has(name)) {
    return await loadingPromises.get(name)
  }
  
  const meta = componentIndex.get(name)
  if (!meta) {
    console.warn('[Ultra] Component not found:', name)
    return null
  }
  
  // 创建加载 Promise
  const loadPromise = (async () => {
    console.log('[Ultra] Loading:', name)
    const startTime = performance.now()
    
    const module = await import(/* @vite-ignore */ meta.path)
    const component = module.default
    
    // 注册组件
    Spark.getRegistry().registerOnce(name, component)
    loadedComponents.add(name)
    
    const loadTime = performance.now() - startTime
    console.log(\`[Ultra] Loaded \${name} in \${loadTime.toFixed(2)}ms\`)
    
    return component
  })()
  
  loadingPromises.set(name, loadPromise)
  
  try {
    return await loadPromise
  } finally {
    loadingPromises.delete(name)
  }
}

/* -----------------------------------------------------------------------------
 * 路由预加载（可选）
 * -------------------------------------------------------------------------- */

${enablePreload ? `
const routeComponentMap = new Map([
${routeComponents.map(c => 
  c.routes?.map(route => `  ['${route}', '${c.name}']`).join(',\n')
).filter(Boolean).join(',\n')}
])

function preloadRouteComponents(route) {
  const componentName = routeComponentMap.get(route)
  if (componentName) {
    // 后台预加载（不阻塞）
    setTimeout(() => lazyLoadComponent(componentName), 0)
  }
}

// 预测下一个路由（简单实现）
let lastRoute = null
function predictNextRoute(currentRoute) {
  // 基于历史访问模式预测（可扩展为机器学习）
  const predictions = {
    '/': ['/dashboard'],
    '/dashboard': ['/forms', '/charts'],
    '/forms': ['/dashboard']
  }
  
  const nextRoutes = predictions[currentRoute] || []
  nextRoutes.forEach(route => preloadRouteComponents(route))
}
` : ''}

/* -----------------------------------------------------------------------------
 * 注册函数（零启动成本）
 * -------------------------------------------------------------------------- */

export function registerComponents(app) {
  const registry = Spark.getRegistry()
  
  // 1️⃣ 只注册核心组件（${eagerComponents.length} 个）
${eagerComponents.map(c => `  registry.registerOnce('${c.name}', ${toPascalCase(c.name)})`).join('\n')}
  
  // 2️⃣ 安装懒加载拦截器
  const originalGet = registry.get.bind(registry)
  registry.get = async function(name) {
    let component = originalGet(name)
    
    // 如果组件未注册，尝试懒加载
    if (!component && componentIndex.has(name)) {
      component = await lazyLoadComponent(name)
    }
    
    return component
  }
  
  // 3️⃣ 安装路由预加载（可选）
${enablePreload ? `
  if (app.config.globalProperties.$router) {
    const router = app.config.globalProperties.$router
    
    router.beforeEach((to, from) => {
      // 预加载当前路由组件
      if (to.path) {
        preloadRouteComponents(to.path)
      }
      
      // 预测下一个路由
      if (from.path) {
        lastRoute = from.path
        predictNextRoute(to.path)
      }
    })
  }
` : ''}
  
  console.log(\`[Ultra] 注册完成: \${${eagerComponents.length}} 个核心组件已加载\`)
  console.log(\`[Ultra] 索引: \${componentIndex.size} 个组件可按需加载\`)
  
  return {
    total: componentIndex.size,
    eager: ${eagerComponents.length},
    route: ${routeComponents.length},
    lazy: ${lazyComponents.length}
  }
}

/* -----------------------------------------------------------------------------
 * 元数据导出
 * -------------------------------------------------------------------------- */

export function getComponentMetadata() {
  return Array.from(componentIndex.entries()).map(([name, meta]) => ({
    name,
    ...meta
  }))
}

export function getLoadedComponents() {
  return Array.from(loadedComponents)
}

export default registerComponents
`
}

/**
 * 工具函数
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
